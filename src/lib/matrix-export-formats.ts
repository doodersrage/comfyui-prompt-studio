import { downloadTextFile } from './history-export-formats';

export type MatrixExportRow = {
  rowLabel?: string;
  colLabel?: string;
  prompt: string;
  seed?: string;
  error?: string;
};

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportMatrixCsv(rows: MatrixExportRow[]): string {
  const header = ['row', 'column', 'seed', 'prompt', 'error'];
  const lines = rows.map(row =>
    [
      csvEscape(row.rowLabel ?? ''),
      csvEscape(row.colLabel ?? ''),
      csvEscape(row.seed ?? ''),
      csvEscape(row.prompt),
      csvEscape(row.error ?? ''),
    ].join(',')
  );
  return [header.join(','), ...lines].join('\n');
}

export function downloadMatrixCsv(
  rows: MatrixExportRow[],
  filename = 'variation-matrix.csv'
): void {
  downloadTextFile(exportMatrixCsv(rows), filename, 'text/csv;charset=utf-8');
}
