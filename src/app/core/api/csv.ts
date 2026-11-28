/** Builds CSV text. Cells starting with = + - @ are prefixed with ' so spreadsheets never run them as formulas. */
export function toCsv(columns: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined): string => {
    let s = v === null || v === undefined ? '' : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
