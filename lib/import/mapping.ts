import { ParsedStudentRow, RawImportRow } from "./types";

export interface ColumnMapping {
  targetField: keyof ParsedStudentRow;
  aliases: string[]; // Possible column headers in sheets (case-insensitive)
  transform?: (value: any) => any; // Custom parsing logic, e.g. dates or numbers
  required?: boolean;
}

// Map possible spreadsheet headers to our typed schema
export const studentColumnMapping: ColumnMapping[] = [
  {
    targetField: 'studentName',
    aliases: ['student name', 'name', 'full name', 'student'],
    required: true,
  },
  {
    targetField: 'class',
    aliases: ['class', 'grade', 'standard'],
    required: true,
  },
  {
    targetField: 'srNo',
    aliases: ['sr no', 'sr num', 'admission no', 'adm no', 'scholar no'],
    required: true,
    transform: (val) => String(val).trim(),
  },
  {
    targetField: 'dob',
    aliases: ['dob', 'date of birth', 'birth date'],
    transform: (val) => {
      // In future: Add date parser here to standardize YYYY-MM-DD
      return val ? String(val) : undefined;
    }
  },
  {
    targetField: 'fatherName',
    aliases: ['father name', 'father', 'fathers name'],
  },
  {
    targetField: 'motherName',
    aliases: ['mother name', 'mother', 'mothers name'],
  },
  {
    targetField: 'phones',
    aliases: ['mobile', 'phone', 'contact', 'whatsapp', 'phones'],
  },
  {
    targetField: 'transportRoute',
    aliases: ['transport route', 'route', 'bus route', 'transport'],
  },
  {
    targetField: 'status',
    aliases: ['status', 'active'],
    transform: (val): ParsedStudentRow['status'] => {
      const v = String(val).toLowerCase().trim();
      if (['active', 'yes', 'true', '1', ''].includes(v)) return 'active';
      if (['inactive', 'no', 'false', '0'].includes(v)) return 'inactive';
      if (['left'].includes(v)) return 'left';
      if (['graduated', 'passed'].includes(v)) return 'graduated';
      return 'active'; // default
    }
  },
  {
    targetField: 'tuitionOverride',
    aliases: ['tuition override', 'tuition discount', 'custom tuition'],
    transform: (val) => val ? Number(val) : undefined,
  },
  {
    targetField: 'transportOverride',
    aliases: ['transport override', 'transport discount', 'custom transport'],
    transform: (val) => val ? Number(val) : undefined,
  },
  {
    targetField: 'otherFeeHead',
    aliases: ['other fee head', 'fee head', 'custom fee name'],
  },
  {
    targetField: 'otherFeeAmount',
    aliases: ['other fee amount', 'fee amount'],
    transform: (val) => val ? Number(val) : undefined,
  }
];

export function mapRawRowToParsed(rawRow: RawImportRow, mappings: ColumnMapping[] = studentColumnMapping): Partial<ParsedStudentRow> {
  const result: Partial<ParsedStudentRow> = {};
  
  // Normalize raw keys to lowercase for matching
  const normalizedRawRow: Record<string, any> = {};
  for (const [key, value] of Object.entries(rawRow)) {
    normalizedRawRow[key.toLowerCase().trim()] = value;
  }

  for (const mapping of mappings) {
    let rawValue: any = undefined;
    
    // Find matching aliased column
    for (const alias of mapping.aliases) {
      if (normalizedRawRow[alias] !== undefined) {
        rawValue = normalizedRawRow[alias];
        break;
      }
    }
    
    if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
      result[mapping.targetField] = mapping.transform ? mapping.transform(rawValue) : rawValue;
    }
  }
  
  return result;
}
