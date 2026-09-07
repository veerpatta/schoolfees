/**
 * The collection list as a document somebody can carry.
 *
 * A real PDF rather than the exports module's printable HTML, for one concrete
 * reason: `navigator.share` needs a `File`, so a phone can only push a class
 * list into a teacher's WhatsApp if the server produced an actual file. The
 * same artifact then serves print and download, so there is one layout to keep
 * right instead of three.
 *
 * Two columns are deliberately blank — **Collected** and **Signature**. A sheet
 * a teacher cannot write on is a screenshot; those two turn it into the record
 * the office types back in.
 */
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";

import {
  ensurePdfFontsRegistered,
  loadLogoImage,
  pdfTokens,
  rs,
  SchoolLetterhead,
  sharedStyles,
} from "@/platform/pdf/document-kit";
import type { CollectionGroup } from "@/modules/whatsapp/domain/collection-list";
import { COLLECTION_STATUS_LABELS } from "@/modules/whatsapp/domain/collection-list";

/**
 * Column widths as flex ratios, against A4 LANDSCAPE.
 *
 * Eight columns — two of them blank for a person to write in — do not fit
 * portrait: 539pt of usable width gave Student about 103pt, which is 17
 * characters at 9pt, and most of this school's names are longer than that.
 * Landscape gives 786pt, so Student gets ~150pt and a name fits on one line.
 * The exports module's printable HTML already sets `@page { size: A4
 * landscape }` for exactly this reason.
 *
 * These are ratios, so they only ever have to stay in proportion — but
 * widening Student or Parent is still what pushes Signature off the page.
 */
const COL = {
  sr: 1.1,
  student: 2.6,
  parent: 2.4,
  phone: 1.7,
  owed: 1.3,
  status: 1.5,
  collected: 1.3,
  signature: 1.7,
} as const;

function HeaderCell({ label, flex, right = false }: { label: string; flex: number; right?: boolean }) {
  return (
    <View style={{ flex }}>
      <Text style={{ fontFamily: "Helvetica-Bold", textAlign: right ? "right" : "left" }}>
        {label}
      </Text>
    </View>
  );
}

function Cell({
  children,
  flex,
  right = false,
  muted = false,
}: {
  children: string;
  flex: number;
  right?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={{ flex }}>
      <Text
        style={{
          textAlign: right ? "right" : "left",
          color: muted ? pdfTokens.muted : pdfTokens.ink,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

function GroupPage({
  group,
  sessionLabel,
  subtitle,
  logo,
  generatedAt,
}: {
  group: CollectionGroup;
  sessionLabel: string;
  subtitle: string;
  logo: Awaited<ReturnType<typeof loadLogoImage>>;
  generatedAt: string;
}) {
  return (
    // One page per group is the whole point: a class teacher is handed exactly
    // their class, with nobody else's children on the back of it.
    <Page size="A4" orientation="landscape" style={sharedStyles.page} wrap>
      <SchoolLetterhead
        docTitleEn={`Fees pending — ${group.label}`}
        docTitleHi="शुल्क शेष सूची"
        logo={logo}
      />

      <View style={sharedStyles.rule} />

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={sharedStyles.muted}>
          Session {sessionLabel} · {group.rows.length}{" "}
          {group.rows.length === 1 ? "student" : "students"}
        </Text>
        <Text style={{ fontFamily: "Helvetica-Bold" }}>Total {rs(group.total)}</Text>
      </View>

      <View style={sharedStyles.tableHeader} fixed>
        <HeaderCell label="SR no" flex={COL.sr} />
        <HeaderCell label="Student" flex={COL.student} />
        <HeaderCell label="Parent" flex={COL.parent} />
        <HeaderCell label="Phone" flex={COL.phone} />
        <HeaderCell label="Owed" flex={COL.owed} right />
        <HeaderCell label="Status" flex={COL.status} />
        <HeaderCell label="Collected" flex={COL.collected} right />
        <HeaderCell label="Signature" flex={COL.signature} />
      </View>

      {group.rows.map((row) => (
        <View key={row.studentId} style={sharedStyles.tableRow} wrap={false}>
          <Cell flex={COL.sr}>{row.admissionNo}</Cell>
          <Cell flex={COL.student}>{row.studentName}</Cell>
          <Cell flex={COL.parent}>{row.parentName}</Cell>
          <Cell flex={COL.phone} muted={!row.phone}>
            {row.phone ?? "no number"}
          </Cell>
          <Cell flex={COL.owed} right>
            {rs(row.dueAmount)}
          </Cell>
          {/* A row that is not plainly collectable says so, so nobody chases a
              family inside a promise they gave. */}
          <Cell flex={COL.status} muted>
            {row.status === "eligible" ? "" : COLLECTION_STATUS_LABELS[row.status]}
          </Cell>
          <Cell flex={COL.collected}>{""}</Cell>
          <Cell flex={COL.signature}>{""}</Cell>
        </View>
      ))}

      <Text style={sharedStyles.footer} fixed>
        {subtitle} · generated {generatedAt} · page{" "}
        <Text render={({ pageNumber }) => String(pageNumber)} />
      </Text>
    </Page>
  );
}

export async function renderCollectionListPdf(input: {
  groups: CollectionGroup[];
  sessionLabel: string;
  /** Names the filter this came from, so a sheet found later can be trusted. */
  subtitle: string;
  generatedAt: string;
}): Promise<Buffer> {
  ensurePdfFontsRegistered();
  const logo = await loadLogoImage();

  const grandTotal = input.groups.reduce((sum, group) => sum + group.total, 0);
  const grandCount = input.groups.reduce((sum, group) => sum + group.rows.length, 0);

  return renderToBuffer(
    <Document>
      {input.groups.map((group) => (
        <GroupPage
          key={group.key}
          group={group}
          sessionLabel={input.sessionLabel}
          subtitle={input.subtitle}
          logo={logo}
          generatedAt={input.generatedAt}
        />
      ))}

      {/* The office's own copy: what was handed out, and what it adds up to.
          Only worth a page when there is more than one group to reconcile. */}
      {input.groups.length > 1 ? (
        <Page size="A4" orientation="landscape" style={sharedStyles.page}>
          <SchoolLetterhead
            docTitleEn="Fees pending — summary"
            docTitleHi="शुल्क शेष सारांश"
            logo={logo}
          />
          <View style={sharedStyles.rule} />

          <View style={sharedStyles.tableHeader}>
            <HeaderCell label="List" flex={3} />
            <HeaderCell label="Students" flex={1} right />
            <HeaderCell label="Amount owed" flex={1.6} right />
          </View>

          {input.groups.map((group) => (
            <View key={group.key} style={sharedStyles.tableRow}>
              <Cell flex={3}>{group.label}</Cell>
              <Cell flex={1} right>
                {String(group.rows.length)}
              </Cell>
              <Cell flex={1.6} right>
                {rs(group.total)}
              </Cell>
            </View>
          ))}

          <View style={{ ...sharedStyles.tableHeader, marginTop: 2 }}>
            <HeaderCell label={`Total (${input.groups.length} lists)`} flex={3} />
            <HeaderCell label={String(grandCount)} flex={1} right />
            <HeaderCell label={rs(grandTotal)} flex={1.6} right />
          </View>

          <Text style={sharedStyles.footer} fixed>
            {input.subtitle} · generated {input.generatedAt}
          </Text>
        </Page>
      ) : null}
    </Document>,
  );
}
