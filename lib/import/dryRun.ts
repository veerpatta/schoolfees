import { RawImportRow, ProcessedRow, DryRunResult } from './types';
import { studentColumnMapping, mapRawRowToParsed } from './mapping';
import { validateRow } from './validation';
import { detectDuplicates, ExistingRecord } from './duplicates';

/**
 * Simulates an import without writing any data to the database.
 * This should be called by the API/Server Action with the raw rows parsed from CSV/XLSX.
 */
export async function executeDryRun(
  batchId: string,
  rawRows: RawImportRow[],
  existingRecordsFetcher: (srNos: string[]) => Promise<ExistingRecord[]>
): Promise<DryRunResult> {
  // 1. Initial mapping and row-level validation
  let processedRows: ProcessedRow[] = rawRows.map((raw, index) => {
    // Map raw spreadsheet row to our strong types
    const parsed = mapRawRowToParsed(raw, studentColumnMapping) as any;
    
    // Validate individual fields
    const errors = validateRow(parsed);
    
    const rowStatus = errors.length > 0 ? 'invalid' : 'valid';

    return {
      index: index + 1, // 1-indexed for user display
      raw,
      parsed,
      errors,
      status: rowStatus,
      warnings: []
    };
  });

  // 2. Fetch existing records for duplicate checking
  // Optimization: Only fetch SR Numbers that were present in the sheet
  const parsedSrNos = processedRows
    .filter(r => r.parsed?.srNo)
    .map(r => r.parsed!.srNo as string);
    
  let existingRecords: ExistingRecord[] = [];
  if (parsedSrNos.length > 0) {
    existingRecords = await existingRecordsFetcher(parsedSrNos);
  }

  // 3. Detect Intra-batch and Inter-batch duplicates
  processedRows = detectDuplicates(processedRows, existingRecords);

  // 4. Summarize Results
  const summary = {
    total: processedRows.length,
    valid: processedRows.filter(r => r.status === 'valid').length,
    invalid: processedRows.filter(r => r.status === 'invalid').length,
    duplicates: processedRows.filter(r => r.status === 'duplicate').length,
  };

  return {
    batchId,
    summary,
    rows: processedRows
  };
}
