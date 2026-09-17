/** Common cell-reading and normalization helpers shared by every import row processor. */

export function textCell(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  if (value === null || value === undefined) return undefined;
  const str = String(value).trim();
  return str === '' ? undefined : str;
}

/** YYYY-MM-DD, from either an ExcelJS Date cell or a plain string cell. Returns 'invalid' on bad input. */
export function dateCell(raw: Record<string, unknown>, key: string): string | undefined | 'invalid' {
  const value = raw[key];
  if (value === null || value === undefined || value === '') return undefined;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(value).trim();
  if (str === '') return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str) || Number.isNaN(Date.parse(str))) return 'invalid';
  return str;
}

/** Non-negative number, tolerant of comma decimal separators. Returns 'invalid' on bad input. */
export function numberCell(raw: Record<string, unknown>, key: string): number | undefined | 'invalid' {
  const value = raw[key];
  if (value === null || value === undefined || value === '') return undefined;
  const num = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(num) || num < 0) return 'invalid';
  return num;
}

/** Positive integer. Returns 'invalid' on bad input. */
export function positiveIntCell(raw: Record<string, unknown>, key: string): number | undefined | 'invalid' {
  const num = numberCell(raw, key);
  if (num === undefined) return undefined;
  if (num === 'invalid' || !Number.isInteger(num) || num <= 0) return 'invalid';
  return num;
}

const GENDER_ALIASES: Record<string, string> = {
  male: 'male',
  m: 'male',
  м: 'male',
  муж: 'male',
  мужской: 'male',
  female: 'female',
  f: 'female',
  ж: 'female',
  жен: 'female',
  женский: 'female',
};

/** Accepts the canonical DB values plus common Russian data-entry aliases. */
export function genderCell(raw: Record<string, unknown>, key: string): string | undefined | 'invalid' {
  const value = textCell(raw, key);
  if (value === undefined) return undefined;
  const normalized = GENDER_ALIASES[value.toLowerCase()];
  return normalized ?? 'invalid';
}

const BOOLEAN_ALIASES: Record<string, boolean> = {
  true: true,
  '1': true,
  yes: true,
  y: true,
  да: true,
  активно: true,
  false: false,
  '0': false,
  no: false,
  n: false,
  нет: false,
  неактивно: false,
};

/** Accepts true/false, 1/0, yes/no, да/нет. Returns 'invalid' on bad input. */
export function booleanCell(raw: Record<string, unknown>, key: string): boolean | undefined | 'invalid' {
  const value = raw[key];
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = BOOLEAN_ALIASES[String(value).trim().toLowerCase()];
  return normalized ?? 'invalid';
}

const STATUS_ALIASES: Record<string, string> = {
  active: 'active',
  активен: 'active',
  активна: 'active',
  да: 'active',
  inactive: 'inactive',
  неактивен: 'inactive',
  неактивна: 'inactive',
  нет: 'inactive',
};

/** Accepts active/inactive plus common Russian aliases; defaults to 'active' when the cell is empty. */
export function statusCell(raw: Record<string, unknown>, key: string): string | 'invalid' {
  const value = textCell(raw, key);
  if (value === undefined) return 'active';
  const normalized = STATUS_ALIASES[value.toLowerCase()];
  return normalized ?? 'invalid';
}

const CATEGORY_ALIASES: Record<string, string> = {
  sport: 'sport',
  спорт: 'sport',
  travel: 'travel',
  путешествия: 'travel',
  туризм: 'travel',
  health: 'health',
  здоровье: 'health',
  auto: 'auto',
  авто: 'auto',
  property: 'property',
  недвижимость: 'property',
  business: 'business',
  бизнес: 'business',
};

export function categoryCell(raw: Record<string, unknown>, key: string): string | undefined | 'invalid' {
  const value = textCell(raw, key);
  if (value === undefined) return undefined;
  const normalized = CATEGORY_ALIASES[value.toLowerCase()];
  return normalized ?? 'invalid';
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Resolves a human-entered "federation" or "product" cell (slug/name for federations,
 * name for products) against a small in-memory directory built once per import run.
 * Exact match only, case-insensitive — never guesses between ambiguous matches.
 */
export function resolveByNameOrSlug<T extends { id: string; name: string; slug?: string }>(
  directory: T[],
  value: string,
): { match: T } | { ambiguous: true } | { notFound: true } {
  const needle = value.trim().toLowerCase();
  const matches = directory.filter(
    (item) => item.name.trim().toLowerCase() === needle || item.slug?.trim().toLowerCase() === needle,
  );
  if (matches.length === 0) return { notFound: true };
  if (matches.length > 1) return { ambiguous: true };
  return { match: matches[0] };
}
