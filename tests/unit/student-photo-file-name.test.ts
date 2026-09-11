import { describe, expect, it } from "vitest";

import { studentPhotoFileName } from "@/modules/students/domain/photo-file-name";
import { attachmentDisposition } from "@/platform/helpers/content-disposition";

describe("studentPhotoFileName", () => {
  it("names the file SR-then-name", () => {
    expect(
      studentPhotoFileName({
        admissionNo: "2166",
        fullName: "SADHANA KANWAR CHUNDAWAT",
        photoPath: "101f3123-8e87-41e9-a60e-1a5eef27943c/1755612345678-k3p9xq.jpg",
      }),
    ).toBe("2166-SADHANA-KANWAR-CHUNDAWAT.jpg");
  });

  it("derives the extension from the stored object rather than assuming jpg", () => {
    expect(
      studentPhotoFileName({ admissionNo: "2166", fullName: "A B", photoPath: "x/y.png" }),
    ).toBe("2166-A-B.png");
    // .jpeg and .jpg are the same format and should not produce two spellings.
    expect(
      studentPhotoFileName({ admissionNo: "2166", fullName: "A B", photoPath: "x/y.jpeg" }),
    ).toBe("2166-A-B.jpg");
  });

  it("still names a file when the SR number is missing", () => {
    expect(
      studentPhotoFileName({ admissionNo: null, fullName: "SADHANA", photoPath: "x/y.jpg" }),
    ).toBe("SADHANA.jpg");
  });

  it("falls back rather than producing a bare extension", () => {
    expect(
      studentPhotoFileName({ admissionNo: null, fullName: "   ", photoPath: "x/y.jpg" }),
    ).toBe("student-photo.jpg");
  });

  it("caps the base so the name fits a filesystem even in Devanagari", () => {
    const name = studentPhotoFileName({
      admissionNo: "2166",
      fullName: "अ".repeat(300),
      photoPath: "x/y.jpg",
    });
    expect(name.length).toBeLessThanOrEqual(105);
  });
});

describe("attachmentDisposition", () => {
  it("emits both the ASCII fallback and the RFC 5987 ext-value", () => {
    expect(attachmentDisposition("2166-SADHANA-KANWAR-CHUNDAWAT.jpg")).toBe(
      "attachment; filename=\"2166-SADHANA-KANWAR-CHUNDAWAT.jpg\"; " +
        "filename*=UTF-8''2166-SADHANA-KANWAR-CHUNDAWAT.jpg",
    );
  });

  it("keeps the SR number in the ASCII half when the name is Devanagari", () => {
    const header = attachmentDisposition("2166-सधना.jpg");
    // The ASCII fold cannot carry the name, which is exactly why the SR leads.
    expect(header).toContain('filename="2166-.jpg"');
    expect(header).toContain("filename*=UTF-8''2166-%E0%A4%B8");
  });

  it("folds an accent to its base letter rather than dropping it", () => {
    expect(attachmentDisposition("JOSÉ.jpg")).toContain('filename="JOSE.jpg"');
  });

  /**
   * The value here is a name somebody typed into a student record, so this is
   * the test that matters: a quote, a backslash or a newline must not be able
   * to close the quoted string or start a second header.
   */
  it("cannot be used to inject a header", () => {
    const header = attachmentDisposition('a"b\\c\r\nX-Evil: 1.jpg');
    expect(header).not.toContain("\r");
    expect(header).not.toContain("\n");
    expect(header).not.toContain('"a"');
    expect(header).not.toContain("X-Evil: 1");
    // Exactly one quoted filename, and exactly one ext-value.
    expect(header.match(/filename=/g)).toHaveLength(1);
    expect(header.match(/filename\*=/g)).toHaveLength(1);
  });

  it("escapes the characters encodeURIComponent leaves behind", () => {
    const header = attachmentDisposition("a'b(c)d!e*f.jpg");
    const ext = header.split("filename*=UTF-8''")[1];
    expect(ext).not.toMatch(/['()!*]/);
  });
});
