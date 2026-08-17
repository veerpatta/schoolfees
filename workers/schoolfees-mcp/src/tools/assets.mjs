/**
 * Photos and voice notes.
 *
 * Both live in private Supabase buckets. This Worker holds the service-role key,
 * which bypasses storage RLS, so the rule these tools exist under is: **a caller
 * never names a path**. It names a student, the path is read from the database,
 * and only then is anything signed or downloaded. A generic
 * read_storage_object(bucket, path) would be an arbitrary-file-read primitive
 * wearing a tool's clothes.
 *
 * Links, not bytes, by default. A signed URL handed to an assistant lands in a
 * transcript that outlives the conversation, so the TTLs here are shorter than
 * the app's own.
 */

import * as z from "zod/v4";

import { select } from "../supabase.mjs";
import { BUCKETS, createSignedUrl, downloadObject, toBase64 } from "../storage.mjs";
import { defineTool, toolError, toolResult } from "../toolkit.mjs";

/** The bucket limit is 512 KB; this leaves room without inviting a big file. */
const PHOTO_MAX_BYTES = 700_000;
const VOICE_NOTE_MAX_BYTES = 2_000_000;

const formatSchema = z
  .enum(["link", "bytes"])
  .default("link")
  .describe(
    "link returns a short-lived signed URL (small, works anywhere). bytes returns the file inline for clients that render it.",
  );

async function findStudent(env, { studentId, admissionNo, sessionLabel }) {
  const params = {
    select: "student_id,admission_no,student_name,class_label,record_status",
    limit: 1,
  };
  if (studentId) params.student_id = `eq.${studentId}`;
  else params.admission_no = `eq.${admissionNo}`;
  if (sessionLabel) params.session_label = `eq.${sessionLabel}`;

  const { rows } = await select(env, "v_workbook_student_financials", params);
  return rows[0] || null;
}

export function registerAssetTools(server, ctx) {
  const { env, identity } = ctx;

  defineTool(server, ctx, {
    name: "get_student_photo",
    title: "Get Student Photo",
    description:
      "Use this to see or share a student's photograph. Returns a short-lived signed link by default, or the image itself with format:\"bytes\". Not every student has one, and that is normal rather than an error.",
    requires: ["students:view"],
    inputSchema: {
      studentId: z.string().uuid().optional().describe("Student UUID."),
      admissionNo: z.string().max(40).optional().describe("SR number, if the UUID is not to hand."),
      format: formatSchema,
      expiresInSeconds: z
        .number()
        .int()
        .min(60)
        .max(3600)
        .default(900)
        .describe("How long a link stays valid. Shorter is safer."),
    },
    // found=false means no such student; found=true with hasPhoto=false means
    // the student exists and has no photograph. That is ordinary, not an error.
    outputSchema: {
      found: z.boolean(),
      hasPhoto: z.boolean(),
      studentId: z.string().optional(),
      studentName: z.string().nullable().optional(),
      admissionNo: z.string().nullable().optional(),
      classLabel: z.string().nullable().optional(),
      format: z.enum(["link", "bytes"]).optional(),
      url: z.string().optional(),
      expiresAt: z.string().optional(),
      expiresInSeconds: z.number().int().optional(),
      byteLength: z.number().int().optional(),
      mimeType: z.string().optional(),
      /** Set when the image was too large to inline and a link was sent instead. */
      fellBackToLink: z.boolean().optional(),
      note: z.string().optional(),
      error: z.string().optional(),
    },
    handler: async ({ studentId, admissionNo, format, expiresInSeconds }) => {
      // isError, because "you called me wrong" and "there is nothing there" are
      // different answers. They used to share one envelope, so a client could
      // only tell them apart by probing for an `error` key.
      if (!studentId && !admissionNo) {
        return toolError("Give either studentId or admissionNo.", {
          error: "studentId or admissionNo is required",
        });
      }

      const student = await findStudent(env, { studentId, admissionNo });
      if (!student) {
        return toolResult(`No student matched ${studentId || admissionNo}.`, {
          found: false,
          hasPhoto: false,
        });
      }

      // The path comes from the student record, never from the caller.
      const { rows } = await select(env, "students", {
        select: "id,photo_path",
        id: `eq.${student.student_id}`,
        limit: 1,
      });
      const photoPath = rows[0]?.photo_path || null;

      if (!photoPath) {
        // A missing photo is ordinary. The app treats it the same way.
        return toolResult(
          `${student.student_name} (SR ${student.admission_no}) has no photograph on file.`,
          {
            found: true,
            hasPhoto: false,
            studentId: student.student_id,
            studentName: student.student_name,
            admissionNo: student.admission_no,
          },
        );
      }

      const base = {
        found: true,
        hasPhoto: true,
        studentId: student.student_id,
        studentName: student.student_name,
        admissionNo: student.admission_no,
        classLabel: student.class_label,
      };

      if (format === "bytes") {
        const file = await downloadObject(env, BUCKETS.studentPhotos, photoPath, {
          maxBytes: PHOTO_MAX_BYTES,
        });
        if (file.tooLarge) {
          const signed = await createSignedUrl(
            env,
            BUCKETS.studentPhotos,
            photoPath,
            expiresInSeconds,
          );
          return toolResult(
            `Photo for ${student.student_name} is ${file.byteLength} bytes, over the inline limit — returning a link instead.`,
            { ...base, ...signed, fellBackToLink: true, byteLength: file.byteLength },
          );
        }

        return {
          content: [
            {
              type: "text",
              text: `Photograph of ${student.student_name} (SR ${student.admission_no}), ${student.class_label}.`,
            },
            { type: "image", data: toBase64(file.bytes), mimeType: file.mimeType },
          ],
          structuredContent: {
            ...base,
            byteLength: file.byteLength,
            mimeType: file.mimeType,
            format: "bytes",
          },
        };
      }

      const signed = await createSignedUrl(env, BUCKETS.studentPhotos, photoPath, expiresInSeconds);
      return toolResult(
        `Photograph of ${student.student_name} (SR ${student.admission_no}). Link valid for ${Math.round(expiresInSeconds / 60)} minutes.`,
        {
          ...base,
          ...signed,
          format: "link",
          note: "This link needs no sign-in. Treat it as the photograph itself and do not paste it anywhere public.",
        },
      );
    },
  });

  defineTool(server, ctx, {
    name: "get_defaulter_voice_note",
    title: "Get Follow-Up Voice Note",
    description:
      "Use this to hear a voice note a staff member recorded against a fee follow-up call. Returns a short-lived signed link by default.",
    requires: ["defaulters:view"],
    inputSchema: {
      studentId: z.string().uuid().optional().describe("Most recent voice note for this student."),
      contactId: z.string().uuid().optional().describe("A specific contact-log entry."),
      format: formatSchema,
      expiresInSeconds: z.number().int().min(60).max(1800).default(600),
    },
    outputSchema: {
      found: z.boolean(),
      hasVoiceNote: z.boolean(),
      contactId: z.string().nullable().optional(),
      studentId: z.string().nullable().optional(),
      contactedAt: z.string().nullable().optional(),
      outcome: z.string().nullable().optional(),
      channel: z.string().nullable().optional(),
      format: z.enum(["link", "bytes"]).optional(),
      url: z.string().optional(),
      expiresAt: z.string().optional(),
      expiresInSeconds: z.number().int().optional(),
      byteLength: z.number().int().optional(),
      mimeType: z.string().optional(),
      fellBackToLink: z.boolean().optional(),
      note: z.string().optional(),
      error: z.string().optional(),
    },
    handler: async ({ studentId, contactId, format, expiresInSeconds }) => {
      if (!studentId && !contactId) {
        return toolError("Give either studentId or contactId.", {
          error: "studentId or contactId is required",
        });
      }

      const params = {
        select: "id,student_id,contacted_at,outcome,channel,voice_note_path",
        order: "contacted_at.desc",
        limit: 1,
      };
      if (contactId) params.id = `eq.${contactId}`;
      else {
        params.student_id = `eq.${studentId}`;
        params.voice_note_path = "not.is.null";
      }

      const { rows } = await select(env, "defaulter_contacts", params);
      const contact = rows[0];

      if (!contact?.voice_note_path) {
        return toolResult("No voice note found for that student or contact.", {
          found: false,
          hasVoiceNote: false,
        });
      }

      const base = {
        found: true,
        hasVoiceNote: true,
        contactId: contact.id,
        studentId: contact.student_id,
        contactedAt: contact.contacted_at,
        outcome: contact.outcome,
        channel: contact.channel,
      };

      if (format === "bytes") {
        const file = await downloadObject(env, BUCKETS.voiceNotes, contact.voice_note_path, {
          maxBytes: VOICE_NOTE_MAX_BYTES,
        });
        if (file.tooLarge) {
          const signed = await createSignedUrl(
            env,
            BUCKETS.voiceNotes,
            contact.voice_note_path,
            expiresInSeconds,
          );
          return toolResult(
            `That recording is ${file.byteLength} bytes, over the inline limit — returning a link instead.`,
            { ...base, ...signed, fellBackToLink: true, byteLength: file.byteLength },
          );
        }

        return {
          content: [
            { type: "text", text: `Voice note from ${contact.contacted_at}.` },
            { type: "audio", data: toBase64(file.bytes), mimeType: file.mimeType },
          ],
          structuredContent: { ...base, byteLength: file.byteLength, mimeType: file.mimeType },
        };
      }

      const signed = await createSignedUrl(
        env,
        BUCKETS.voiceNotes,
        contact.voice_note_path,
        expiresInSeconds,
      );
      return toolResult(`Voice note from ${contact.contacted_at}.`, {
        ...base,
        ...signed,
        format: "link",
        note: "This link needs no sign-in. It is a recording of a real conversation with a family — do not share it outside the office.",
      });
    },
  });

  // Referenced so the linter sees the identity is deliberately unused here:
  // permission gating happens in defineTool, not inside a handler.
  void identity;
}
