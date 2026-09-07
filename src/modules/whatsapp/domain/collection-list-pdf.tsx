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

/** The column header, repeated at the top of every page by `fixed`. */
function TableHead() {
  return (
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
  );
}

/**
 * One group: a heading, then its students. NOT its own page.
 *
 * The first cut gave every group a `<Page>`, so a class of 5 students burned a
 * whole A4 sheet and eighteen classes came to nineteen pages for 114 children.
 * Groups now flow one after another and a short class is followed straight down
 * the page by the next one — the same 114 children land in about four pages.
 *
 * Two react-pdf details do the real work:
 *
 * - `minPresenceAhead` on the heading. Without it a group title can be the last
 *   thing that fits on a page, leaving the heading stranded and its students
 *   starting the next sheet under a repeated column header with no name on it.
 *   The value is roughly a heading plus three rows, so a group only starts on a
 *   page that can show something of it.
 * - `wrap={false}` per row, so a student is never split across the fold.
 *
 * Handing one class to one teacher is still a one-press job: the per-group
 * download (`?scope=<group>`) renders that group alone.
 */
function GroupBlock({ group, first }: { group: CollectionGroup; first: boolean }) {
  return (
    <View style={{ marginTop: first ? 0 : 6 }} minPresenceAhead={44}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
          backgroundColor: pdfTokens.panel,
          paddingVertical: 3,
          paddingHorizontal: 4,
          marginBottom: 2,
        }}
      >
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>{group.label}</Text>
        <Text style={sharedStyles.muted}>
          {group.rows.length} {group.rows.length === 1 ? "student" : "students"} ·{" "}
          {rs(group.total)}
        </Text>
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
    </View>
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
      {/* ONE page set, not one page per group. The letterhead prints once, the
          column header repeats itself, and the groups flow — so a class of five
          is followed down the same sheet by the next class instead of ending
          it. */}
      <Page size="A4" orientation="landscape" style={sharedStyles.page} wrap>
        <SchoolLetterhead
          docTitleEn="Fees pending"
          docTitleHi="शुल्क शेष सूची"
          logo={logo}
        />

        <View style={sharedStyles.rule} />

        <View
          style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}
        >
          <Text style={sharedStyles.muted}>
            Session {input.sessionLabel} · {grandCount}{" "}
            {grandCount === 1 ? "student" : "students"} across {input.groups.length}{" "}
            {input.groups.length === 1 ? "list" : "lists"}
          </Text>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>Total {rs(grandTotal)}</Text>
        </View>

        <TableHead />

        {input.groups.map((group, index) => (
          <GroupBlock key={group.key} group={group} first={index === 0} />
        ))}

        {/* The office's reconciliation, at the end of the flow rather than on a
            page of its own — it only costs a sheet if it does not fit on the
            last one. Pointless when there is a single group to reconcile. */}
        {input.groups.length > 1 ? (
          <View style={{ marginTop: 14 }} minPresenceAhead={60}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 3 }}>
              Summary
            </Text>

            <View style={sharedStyles.tableHeader}>
              <HeaderCell label="List" flex={3} />
              <HeaderCell label="Students" flex={1} right />
              <HeaderCell label="Amount owed" flex={1.6} right />
            </View>

            {input.groups.map((group) => (
              <View key={group.key} style={sharedStyles.tableRow} wrap={false}>
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
          </View>
        ) : null}

        <Text style={sharedStyles.footer} fixed>
          {input.subtitle} · generated {input.generatedAt} · page{" "}
          <Text render={({ pageNumber }) => String(pageNumber)} />
        </Text>
      </Page>
    </Document>,
  );
}
