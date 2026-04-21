import { ParsedStudentRow, ProcessedRow, RowError } from './types';

// Represents an existing student record fetched from the database for comparison
export interface ExistingRecord {
  id: string; // Database ID
  srNo?: string;
  studentName: string;
  class?: string;
  dob?: string;
}

/**
 * Validates a batch of rows against themselves (intra-batch) and existing records (inter-batch).
 * Uses SR No as the primary unique key. If SR No is missing, can fall back to Name + Class + DOB logic if needed.
 */
export function detectDuplicates(
  processedRows: ProcessedRow[],
  existingRecords: ExistingRecord[]
): ProcessedRow[] {
  const srNoSet = new Set<string>();
  
  // Create quick lookup for existing records by SR No
  const existingSrNos = new Set<string>();
  for (const record of existingRecords) {
    if (record.srNo) {
      existingSrNos.add(record.srNo.toLowerCase().trim());
    }
  }

  return processedRows.map(row => {
    // Only check rows that haven't already failed prior validation
    if (row.status === 'invalid' || !row.parsed) {
      return row;
    }

    const currentSrNo = row.parsed.srNo?.toLowerCase()?.trim();
    
    if (!currentSrNo) {
      // It should have failed validation if required, but just in case
      return row;
    }

    const errors: RowError[] = [...row.errors];
    let isDuplicate = false;

    // 1. Check for intra-batch duplicate (duplicate SR No in the same spreadsheet)
    if (srNoSet.has(currentSrNo)) {
      isDuplicate = true;
      errors.push({
        column: 'srNo',
        message: `Duplicate SR Number within the import file: ${row.parsed.srNo}`,
        code: 'ERR_DUPLICATE_FILE_SR',
      });
    } else {
      srNoSet.add(currentSrNo);
    }

    // 2. Check for inter-batch duplicate (duplicate SR No against existing DB records)
    if (existingSrNos.has(currentSrNo)) {
      isDuplicate = true;
      errors.push({
        column: 'srNo',
        message: `Student with this SR Number already exists in the database: ${row.parsed.srNo}`,
        code: 'ERR_DUPLICATE_DB_SR',
      });
    }
    
    if (isDuplicate) {
      return {
        ...row,
        status: 'duplicate',
        errors
      };
    }

    return row;
  });
}
