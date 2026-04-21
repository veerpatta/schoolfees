import { ParsedStudentRow, RowError } from './types';

export interface ValidationRule {
  field: keyof ParsedStudentRow;
  validate: (
    value: ParsedStudentRow[keyof ParsedStudentRow] | undefined,
    row: Partial<ParsedStudentRow>,
  ) => boolean;
  message: string;
  code: string;
}

export const studentValidationRules: ValidationRule[] = [
  {
    field: 'studentName',
    validate: (val) => typeof val === 'string' && val.trim().length > 0,
    message: 'Student name is required',
    code: 'ERR_MISSING_NAME',
  },
  {
    field: 'class',
    validate: (val) => typeof val === 'string' && val.trim().length > 0,
    message: 'Class is required',
    code: 'ERR_MISSING_CLASS',
  },
  {
    field: 'srNo',
    validate: (val) => typeof val === 'string' && val.trim().length > 0,
    message: 'SR number is required',
    code: 'ERR_MISSING_SR_NO',
  },
  {
    field: 'tuitionOverride',
    validate: (val) => val === undefined || (typeof val === 'number' && val >= 0),
    message: 'Tuition override must be a positive number',
    code: 'ERR_INVALID_TUITION_OVERRIDE',
  },
  {
    field: 'transportOverride',
    validate: (val) => val === undefined || (typeof val === 'number' && val >= 0),
    message: 'Transport override must be a positive number',
    code: 'ERR_INVALID_TRANSPORT_OVERRIDE',
  },
  {
    field: 'otherFeeAmount',
    validate: (val, row) => {
      // If otherFeeHead is present, otherFeeAmount should be a valid number >= 0
      if (row.otherFeeHead && (val === undefined || typeof val !== 'number' || val < 0)) {
        return false;
      }
      return true;
    },
    message: 'Other fee amount is required and must be valid if a Custom Fee Head is specified',
    code: 'ERR_MISSING_FEE_AMOUNT',
  }
];

export function validateRow(parsedRow: Partial<ParsedStudentRow>, rules: ValidationRule[] = studentValidationRules): RowError[] {
  const errors: RowError[] = [];

  for (const rule of rules) {
    const value = parsedRow[rule.field];
    if (!rule.validate(value, parsedRow)) {
      errors.push({
        column: rule.field as string,
        message: rule.message,
        code: rule.code,
      });
    }
  }

  return errors;
}
