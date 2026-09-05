/** Quote a CSV cell if it contains a comma, quote, or newline. */
export function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Join a header row and data rows into a CSV document (CRLF line endings). */
export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  return lines.join('\r\n');
}
