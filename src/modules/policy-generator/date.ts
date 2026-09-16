function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Formats a Postgres DATE/TIMESTAMPTZ value (returned by `pg` as a Date, or as a string) as DD.MM.YYYY for the PDF templates. */
export function formatRuDate(value: string | Date | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return `${pad2(date.getUTCDate())}.${pad2(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
}
