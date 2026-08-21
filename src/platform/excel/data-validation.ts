// Real Excel dropdowns for the templates we hand to office staff.
//
// SheetJS (community build) cannot write data validations — its worksheet
// writer has a literal `/* dataValidations */` placeholder where that element
// would go. So we let SheetJS produce the workbook, then patch the resulting
// .xlsx (a zip of XML parts) on the way out:
//
//   1. inject <definedNames> into xl/workbook.xml
//   2. inject <dataValidations> into the target worksheet part
//
// Defined names rather than direct cross-sheet ranges: a plain
// `'Current Lists'!$B$2:$B$40` in a validation formula is rejected by older
// Excel and by some LibreOffice builds, while a named range works everywhere.

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export type ListValidation = {
  /** Worksheet that gets the dropdown. */
  sheetName: string;
  /** Worksheet holding the allowed values. */
  sourceSheetName: string;
  /** 1-based column index on `sourceSheetName` holding the values. */
  sourceColumn: number;
  /** First data row of the source list (1-based, usually 2 — row 1 is a header). */
  sourceFirstRow: number;
  /** Last row of the source list (1-based, inclusive). */
  sourceLastRow: number;
  /** 1-based column index on `sheetName` that gets the dropdown. */
  targetColumn: number;
  /** First row the dropdown applies to (1-based, usually 2). */
  targetFirstRow: number;
  /** Last row the dropdown applies to (1-based, inclusive). */
  targetLastRow: number;
  /** Unique workbook-wide name; must be a valid Excel defined name. */
  definedName: string;
  /** Tooltip shown when the cell is selected. */
  prompt?: string;
  /** Message shown when a typed value is not in the list. */
  error?: string;
  /**
   * When true a value outside the list is refused outright. When false Excel
   * warns but lets it through — the right default for lists that can legitimately
   * grow (a route added after the file was downloaded).
   */
  strict?: boolean;
};

export function columnLetter(index1Based: number): string {
  if (!Number.isInteger(index1Based) || index1Based < 1) {
    throw new Error(`Column index must be a positive integer, received ${index1Based}`);
  }

  let remaining = index1Based;
  let letters = "";

  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return letters;
}

function escapeXmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Excel quotes sheet names in references, doubling any embedded apostrophe. */
function sheetRef(sheetName: string) {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

/**
 * Elements that the spec requires to come AFTER dataValidations inside
 * <worksheet>. Excel refuses to open a file whose child order is wrong, so the
 * block is inserted before the first of these that appears.
 */
const ELEMENTS_AFTER_DATA_VALIDATIONS = [
  "<hyperlinks",
  "<printOptions",
  "<pageMargins",
  "<pageSetup",
  "<headerFooter",
  "<rowBreaks",
  "<colBreaks",
  "<customProperties",
  "<cellWatches",
  "<ignoredErrors",
  "<drawing",
  "<legacyDrawing",
  "<picture",
  "<tableParts",
  "<extLst",
];

function insertBeforeTrailingElements(worksheetXml: string, block: string) {
  let insertAt = -1;

  for (const tag of ELEMENTS_AFTER_DATA_VALIDATIONS) {
    const found = worksheetXml.indexOf(tag);

    if (found !== -1 && (insertAt === -1 || found < insertAt)) {
      insertAt = found;
    }
  }

  if (insertAt === -1) {
    insertAt = worksheetXml.lastIndexOf("</worksheet>");
  }

  if (insertAt === -1) {
    throw new Error("Worksheet XML has no </worksheet> close tag.");
  }

  return worksheetXml.slice(0, insertAt) + block + worksheetXml.slice(insertAt);
}

/** Maps each worksheet name to its part path inside the archive. */
function resolveSheetPaths(workbookXml: string, relsXml: string) {
  const targetByRelId = new Map<string, string>();
  const relPattern = /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g;

  for (let match = relPattern.exec(relsXml); match; match = relPattern.exec(relsXml)) {
    targetByRelId.set(match[1]!, match[2]!);
  }

  const pathBySheetName = new Map<string, string>();
  const sheetPattern = /<sheet\b[^>]*\/>/g;

  for (let match = sheetPattern.exec(workbookXml); match; match = sheetPattern.exec(workbookXml)) {
    const tag = match[0];
    const name = /\bname="([^"]*)"/.exec(tag)?.[1];
    const relId = /\br:id="([^"]+)"/.exec(tag)?.[1];

    if (!name || !relId) {
      continue;
    }

    const target = targetByRelId.get(relId);

    if (!target) {
      continue;
    }

    const normalised = target.replace(/^\/?xl\//, "").replace(/^\//, "");
    pathBySheetName.set(decodeXmlEntities(name), `xl/${normalised}`);
  }

  return pathBySheetName;
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Returns a new .xlsx buffer with list dropdowns applied. The input buffer is
 * not modified.
 */
export function applyListValidations(
  xlsxBuffer: Uint8Array,
  validations: readonly ListValidation[],
): Uint8Array {
  if (validations.length === 0) {
    return xlsxBuffer;
  }

  const archive = unzipSync(xlsxBuffer);

  const workbookPart = archive["xl/workbook.xml"];
  const relsPart = archive["xl/_rels/workbook.xml.rels"];

  if (!workbookPart || !relsPart) {
    throw new Error("Not a readable .xlsx: xl/workbook.xml or its rels part is missing.");
  }

  let workbookXml = strFromU8(workbookPart);
  const sheetPaths = resolveSheetPaths(workbookXml, strFromU8(relsPart));

  // ---- 1. Defined names, one per validation source range ------------------
  const seenNames = new Set<string>();
  const definedNames: string[] = [];

  for (const validation of validations) {
    if (seenNames.has(validation.definedName)) {
      throw new Error(`Duplicate defined name: ${validation.definedName}`);
    }
    seenNames.add(validation.definedName);

    if (!sheetPaths.has(validation.sourceSheetName)) {
      throw new Error(`Source sheet "${validation.sourceSheetName}" is not in the workbook.`);
    }

    const column = columnLetter(validation.sourceColumn);
    const ref = `${sheetRef(validation.sourceSheetName)}!$${column}$${validation.sourceFirstRow}:$${column}$${validation.sourceLastRow}`;

    definedNames.push(
      `<definedName name="${escapeXmlAttribute(validation.definedName)}">${escapeXmlAttribute(ref)}</definedName>`,
    );
  }

  const definedNamesBlock = `<definedNames>${definedNames.join("")}</definedNames>`;

  if (workbookXml.includes("<definedNames>")) {
    workbookXml = workbookXml.replace(
      "<definedNames>",
      `<definedNames>${definedNames.join("")}`,
    );
  } else if (workbookXml.includes("</sheets>")) {
    // definedNames must follow sheets in the CT_Workbook sequence.
    workbookXml = workbookXml.replace("</sheets>", `</sheets>${definedNamesBlock}`);
  } else {
    throw new Error("Workbook XML has no <sheets> element to anchor defined names to.");
  }

  archive["xl/workbook.xml"] = strToU8(workbookXml);

  // ---- 2. dataValidations, grouped per target worksheet -------------------
  const bySheet = new Map<string, ListValidation[]>();

  for (const validation of validations) {
    const group = bySheet.get(validation.sheetName) ?? [];
    group.push(validation);
    bySheet.set(validation.sheetName, group);
  }

  for (const [sheetName, sheetValidations] of bySheet) {
    const path = sheetPaths.get(sheetName);

    if (!path) {
      throw new Error(`Target sheet "${sheetName}" is not in the workbook.`);
    }

    const part = archive[path];

    if (!part) {
      throw new Error(`Worksheet part ${path} is missing from the archive.`);
    }

    const entries = sheetValidations.map((validation) => {
      const column = columnLetter(validation.targetColumn);
      const sqref = `${column}${validation.targetFirstRow}:${column}${validation.targetLastRow}`;
      const attributes = [
        'type="list"',
        // Blank stays legal — in these templates an empty cell means
        // "leave this value alone".
        'allowBlank="1"',
        'showInputMessage="1"',
        'showErrorMessage="1"',
        // "stop" refuses the entry; "warning" lets staff override for a value
        // added to the system after the file was downloaded.
        `errorStyle="${validation.strict ? "stop" : "warning"}"`,
        `sqref="${sqref}"`,
      ];

      if (validation.prompt) {
        attributes.push(
          `promptTitle="Pick from the list"`,
          `prompt="${escapeXmlAttribute(validation.prompt)}"`,
        );
      }

      if (validation.error) {
        attributes.push(
          `errorTitle="Not in the list"`,
          `error="${escapeXmlAttribute(validation.error)}"`,
        );
      }

      return `<dataValidation ${attributes.join(" ")}><formula1>${escapeXmlAttribute(
        validation.definedName,
      )}</formula1></dataValidation>`;
    });

    const block = `<dataValidations count="${entries.length}">${entries.join("")}</dataValidations>`;
    archive[path] = strToU8(insertBeforeTrailingElements(strFromU8(part), block));
  }

  return zipSync(archive);
}
