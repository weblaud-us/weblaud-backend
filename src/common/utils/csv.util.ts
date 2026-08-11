/**
 * Neutralizes spreadsheet formula injection in exported CSV cells.
 *
 * Excel, LibreOffice and Google Sheets evaluate any cell whose text begins with
 * =, +, - or @ as a formula. An applicant who submits the name
 * `=cmd|'/c calc'!A1` gets code execution on whichever machine opens the
 * export — and the file arrives as a trusted internal download, which is
 * exactly why it works.
 *
 * Prefixing with an apostrophe forces the spreadsheet to treat the value as
 * literal text. The apostrophe is not shown in the cell once parsed.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * True for C0/C1 control characters, excluding tab (0x09), newline (0x0A) and
 * carriage return (0x0D) which are legitimate inside a quoted CSV field.
 *
 * Written as a code-point test rather than a regex character class so the
 * source file contains no literal control characters of its own.
 */
function isStrippableControlChar(code: number): boolean {
  if (code <= 0x08) return true;
  if (code === 0x0b || code === 0x0c) return true;
  if (code >= 0x0e && code <= 0x1f) return true;
  return code === 0x7f;
}

/**
 * Removed before the trigger check so a leading control character cannot push
 * `=` out of first position here while still leading the cell once the
 * spreadsheet parses it.
 */
function stripControlChars(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code !== undefined && isStrippableControlChar(code)) continue;
    out += ch;
  }
  return out;
}

export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  const text = value instanceof Date ? value.toISOString() : String(value);
  const cleaned = stripControlChars(text);

  return FORMULA_TRIGGER.test(cleaned) ? `'${cleaned}` : cleaned;
}

/** Applies sanitizeCsvCell to every value of a row object. */
export function sanitizeCsvRow<T extends Record<string, unknown>>(
  row: T,
): Record<keyof T, string> {
  const safe = {} as Record<keyof T, string>;
  for (const key of Object.keys(row) as (keyof T)[]) {
    safe[key] = sanitizeCsvCell(row[key]);
  }
  return safe;
}
