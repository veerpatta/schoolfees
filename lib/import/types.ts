export type ImportStatus = 'pending' | 'validating' | 'validated' | 'importing' | 'completed' | 'failed';
export type RowStatus = 'valid' | 'invalid' | 'duplicate' | 'imported' | 'skipped';

export interface ImportBatch {
  id: string;
  filename: string;
  status: ImportStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  importedRows: number;
  createdAt: string;
  updatedAt: string;
}

export interface RawImportRow {
  [key: string]: string | number | boolean | null | undefined;
}

export interface ParsedStudentRow {
  // Required identity
  studentName: string;
  class: string;
  srNo: string; // Used as primary manual identifier
  
  // Optional identity / details
  dob?: string;
  fatherName?: string;
  motherName?: string;
  phones?: string; // Could be comma separated
  
  // Operational
  status: 'active' | 'inactive' | 'left' | 'graduated';
  transportRoute?: string;
  
  // Fee overrides
  tuitionOverride?: number;
  transportOverride?: number;
  
  // Flexible additions
  otherFeeHead?: string;
  otherFeeAmount?: number;
}

export interface RowError {
  column: string;
  message: string;
  code: string; 
}

export interface ProcessedRow {
  index: number; // Original row number in sheet
  raw: RawImportRow;
  parsed?: ParsedStudentRow;
  status: RowStatus;
  errors: RowError[];
  warnings: string[];
}

export interface DryRunResult {
  batchId: string;
  summary: {
    total: number;
    valid: number;
    invalid: number;
    duplicates: number;
  };
  rows: ProcessedRow[];
}
