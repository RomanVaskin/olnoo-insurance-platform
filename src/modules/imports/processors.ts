import type { Pool, PoolClient } from 'pg';
import type { RawImportRow } from './xlsx';
import {
  textCell,
  dateCell,
  numberCell,
  positiveIntCell,
  genderCell,
  booleanCell,
  statusCell,
  categoryCell,
  resolveByNameOrSlug,
  SLUG_RE,
} from './shared';

export type Queryable = Pool | PoolClient;

export type ImportRowResult<T> = {
  row_number: number;
  action: 'create' | 'update' | 'skip';
  matched_id: string | null;
  /** Normalized, for display in the preview UI. */
  data: T | null;
  /**
   * The original raw cell values for this row, unchanged. Commit re-validates from
   * this (not `data`) — several import types normalize field names on the way to
   * `data` (e.g. `federation` name/slug -> `federation_id` UUID, `base_price` rubles
   * -> `base_price_kopecks`), so re-running the validator against `data` as if it
   * were raw input would silently misread those fields. `raw` is always shaped
   * exactly like the source workbook's columns, so re-validating it reproduces
   * preview's result (or reflects whatever changed in the DB since).
   */
  raw: Record<string, unknown>;
  errors: string[];
  warnings: string[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Federations — columns: name, slug, status
// Match key: slug (stable, UNIQUE in the DB). Update overwrites name/status —
// slug is the natural key so there's nothing ambiguous to preserve.
// ---------------------------------------------------------------------------

export type FederationImportRow = { name: string; slug: string; status: string };

export async function processFederationRows(
  db: Queryable,
  rows: RawImportRow[],
): Promise<ImportRowResult<FederationImportRow>[]> {
  const results: ImportRowResult<FederationImportRow>[] = [];
  const seenSlugs = new Map<string, number>();

  for (const { row_number, raw } of rows) {
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = textCell(raw, 'name');
    if (!name) errors.push('name_required');

    const slugRaw = textCell(raw, 'slug');
    let slug: string | undefined;
    if (!slugRaw) {
      errors.push('slug_required');
    } else if (!SLUG_RE.test(slugRaw)) {
      errors.push('invalid_slug');
    } else {
      slug = slugRaw;
    }

    const status = statusCell(raw, 'status');
    if (status === 'invalid') errors.push('invalid_status');

    if (slug) {
      const firstSeenAt = seenSlugs.get(slug);
      if (firstSeenAt !== undefined) errors.push(`duplicate_slug_in_file:row_${firstSeenAt}`);
      else seenSlugs.set(slug, row_number);
    }

    let action: 'create' | 'update' = 'create';
    let matchedId: string | null = null;
    if (slug && errors.length === 0) {
      const existing = await db.query<{ id: string }>(`SELECT id FROM federations WHERE slug = $1`, [slug]);
      if (existing.rowCount === 1) {
        action = 'update';
        matchedId = existing.rows[0].id;
      }
    }

    const ok = errors.length === 0;
    results.push({
      row_number,
      action: ok ? action : 'skip',
      matched_id: matchedId,
      data: ok ? { name: name as string, slug: slug as string, status: status as string } : null,
      raw,
      errors,
      warnings,
    });
  }

  return results;
}

export async function commitFederationRow(client: PoolClient, row: ImportRowResult<FederationImportRow>): Promise<void> {
  const d = row.data as FederationImportRow;
  if (row.action === 'update' && row.matched_id) {
    await client.query(`UPDATE federations SET name = $1, status = $2, updated_at = now() WHERE id = $3`, [
      d.name,
      d.status,
      row.matched_id,
    ]);
  } else {
    await client.query(`INSERT INTO federations (name, slug, status) VALUES ($1, $2, $3)`, [d.name, d.slug, d.status]);
  }
}

// ---------------------------------------------------------------------------
// Athletes — columns: last_name, first_name, patronymic, birth_date, gender,
// email, phone, federation, club, coach, grade, weight, sport_name
//
// persons has no unique business key, so matching uses an exact tuple:
// (last_name, first_name, patronymic, birthdate) — all four must match an
// existing person exactly (NULLs included) or it's treated as a new person.
// More than one exact match => ambiguous, row is skipped (never guessed).
//
// Update rule: contact fields (email/phone/gender) and membership fields
// (club/coach/grade/weight/sport_name) only overwrite when the Excel cell is
// non-blank — a blank cell means "leave as is", never "clear this field".
// Assigning a federation the matched person doesn't already belong to ADDS a
// new membership (additive); it never touches or removes an existing one.
// ---------------------------------------------------------------------------

export type AthleteImportRow = {
  last_name: string;
  first_name: string;
  patronymic: string | null;
  birthdate: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  federation_id: string | null;
  club: string | null;
  coach: string | null;
  grade: string | null;
  weight: number | null;
  sport_name: string | null;
};

export async function processAthleteRows(
  db: Queryable,
  rows: RawImportRow[],
): Promise<ImportRowResult<AthleteImportRow>[]> {
  const results: ImportRowResult<AthleteImportRow>[] = [];

  const federationsResult = await db.query<{ id: string; name: string; slug: string }>(
    `SELECT id, name, slug FROM federations`,
  );
  const federationDirectory = federationsResult.rows;

  const seenPersonKeys = new Map<string, number>();

  for (const { row_number, raw } of rows) {
    const errors: string[] = [];
    const warnings: string[] = [];

    const lastName = textCell(raw, 'last_name');
    if (!lastName) errors.push('last_name_required');
    const firstName = textCell(raw, 'first_name');
    if (!firstName) errors.push('first_name_required');
    const patronymic = textCell(raw, 'patronymic') ?? null;

    const birthdateResult = dateCell(raw, 'birth_date');
    if (birthdateResult === 'invalid') errors.push('invalid_birth_date');
    const birthdate = birthdateResult === undefined || birthdateResult === 'invalid' ? null : birthdateResult;

    const genderResult = genderCell(raw, 'gender');
    if (genderResult === 'invalid') errors.push('invalid_gender');
    const gender = genderResult === undefined || genderResult === 'invalid' ? null : genderResult;

    const email = textCell(raw, 'email') ?? null;
    if (email && !EMAIL_RE.test(email)) errors.push('invalid_email');

    const phone = textCell(raw, 'phone') ?? null;

    const federationValue = textCell(raw, 'federation');
    let federationId: string | null = null;
    if (federationValue) {
      const resolved = resolveByNameOrSlug(federationDirectory, federationValue);
      if ('notFound' in resolved) errors.push('federation_not_found');
      else if ('ambiguous' in resolved) errors.push('ambiguous_federation_match');
      else federationId = resolved.match.id;
    }

    const club = textCell(raw, 'club') ?? null;
    const coach = textCell(raw, 'coach') ?? null;
    const grade = textCell(raw, 'grade') ?? null;
    const weightResult = numberCell(raw, 'weight');
    if (weightResult === 'invalid') errors.push('invalid_weight');
    const weight = weightResult === undefined || weightResult === 'invalid' ? null : weightResult;
    const sportName = textCell(raw, 'sport_name') ?? null;

    const wantsMembership = Boolean(club || coach || grade || weight !== null || sportName);
    if (wantsMembership && !federationValue) {
      errors.push('federation_required_for_membership');
    }

    let personKey: string | null = null;
    if (lastName && firstName) {
      personKey = [lastName.toLowerCase(), firstName.toLowerCase(), (patronymic ?? '').toLowerCase(), birthdate ?? ''].join(
        '|',
      );
      const firstSeenAt = seenPersonKeys.get(personKey);
      if (firstSeenAt !== undefined) errors.push(`duplicate_person_in_file:row_${firstSeenAt}`);
      else seenPersonKeys.set(personKey, row_number);
    }

    let action: 'create' | 'update' = 'create';
    let matchedId: string | null = null;
    if (errors.length === 0 && lastName && firstName) {
      const matchResult = await db.query<{ id: string }>(
        `SELECT id FROM persons
         WHERE last_name = $1 AND first_name = $2
           AND patronymic IS NOT DISTINCT FROM $3
           AND birthdate IS NOT DISTINCT FROM $4::date`,
        [lastName, firstName, patronymic, birthdate],
      );
      if (matchResult.rowCount === 1) {
        action = 'update';
        matchedId = matchResult.rows[0].id;
      } else if ((matchResult.rowCount ?? 0) > 1) {
        errors.push('ambiguous_person_match');
      }
    }

    const ok = errors.length === 0;
    results.push({
      row_number,
      action: ok ? action : 'skip',
      matched_id: matchedId,
      data: ok
        ? {
            last_name: lastName as string,
            first_name: firstName as string,
            patronymic,
            birthdate,
            gender,
            email,
            phone,
            federation_id: federationId,
            club,
            coach,
            grade,
            weight,
            sport_name: sportName,
          }
        : null,
      raw,
      errors,
      warnings,
    });
  }

  return results;
}

export async function commitAthleteRow(client: PoolClient, row: ImportRowResult<AthleteImportRow>): Promise<void> {
  const d = row.data as AthleteImportRow;
  let personId: string;

  if (row.action === 'update' && row.matched_id) {
    personId = row.matched_id;
    await client.query(
      `UPDATE persons SET email = COALESCE($1, email), phone = COALESCE($2, phone), gender = COALESCE($3, gender), updated_at = now()
       WHERE id = $4`,
      [d.email, d.phone, d.gender, personId],
    );
  } else {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO persons (last_name, first_name, patronymic, birthdate, gender, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [d.last_name, d.first_name, d.patronymic, d.birthdate, d.gender, d.phone, d.email],
    );
    personId = inserted.rows[0].id;
  }

  if (d.federation_id) {
    const existingMembership = await client.query<{ id: string }>(
      `SELECT id FROM federation_memberships WHERE person_id = $1 AND federation_id = $2`,
      [personId, d.federation_id],
    );
    if (existingMembership.rowCount === 1) {
      await client.query(
        `UPDATE federation_memberships
         SET club = COALESCE($1, club), coach = COALESCE($2, coach), grade = COALESCE($3, grade),
             weight = COALESCE($4, weight), sport_name = COALESCE($5, sport_name), updated_at = now()
         WHERE id = $6`,
        [d.club, d.coach, d.grade, d.weight, d.sport_name, existingMembership.rows[0].id],
      );
    } else {
      await client.query(
        `INSERT INTO federation_memberships (federation_id, person_id, club, coach, grade, weight, sport_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [d.federation_id, personId, d.club, d.coach, d.grade, d.weight, d.sport_name],
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Insurance products — columns: name, category, insurer_name, coverage_amount,
// validity_days, base_price, status
//
// base_price_kopecks is NOT NULL in the DB (required) even though the task's
// own example field list omitted it — included here because the schema
// requires it; every create/update row must supply it.
//
// Match key: exact case-insensitive name (no unique DB constraint on name,
// so >1 existing match is flagged ambiguous and skipped, never guessed).
// Update rule: full overwrite of category/insurer_name/coverage/validity/
// price/status — the Excel row is treated as the row's complete desired
// state (unlike athletes, where fields are sparse/optional per row).
// ---------------------------------------------------------------------------

export type ProductImportRow = {
  name: string;
  category: string;
  insurer_name: string | null;
  coverage_amount_kopecks: number | null;
  validity_days: number;
  base_price_kopecks: number;
  status: string;
};

export async function processProductRows(
  db: Queryable,
  rows: RawImportRow[],
): Promise<ImportRowResult<ProductImportRow>[]> {
  const results: ImportRowResult<ProductImportRow>[] = [];
  const seenNames = new Map<string, number>();

  for (const { row_number, raw } of rows) {
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = textCell(raw, 'name');
    if (!name) errors.push('name_required');

    const category = categoryCell(raw, 'category');
    if (category === undefined) errors.push('category_required');
    else if (category === 'invalid') errors.push('invalid_category');

    const insurerName = textCell(raw, 'insurer_name') ?? null;

    const coverageAmount = numberCell(raw, 'coverage_amount');
    if (coverageAmount === 'invalid') errors.push('invalid_coverage_amount');

    const validityDays = positiveIntCell(raw, 'validity_days');
    if (validityDays === undefined) errors.push('validity_days_required');
    else if (validityDays === 'invalid') errors.push('invalid_validity_days');

    const basePrice = numberCell(raw, 'base_price');
    if (basePrice === undefined) errors.push('base_price_required');
    else if (basePrice === 'invalid') errors.push('invalid_base_price');

    const status = statusCell(raw, 'status');
    if (status === 'invalid') errors.push('invalid_status');

    if (name) {
      const key = name.toLowerCase();
      const firstSeenAt = seenNames.get(key);
      if (firstSeenAt !== undefined) errors.push(`duplicate_name_in_file:row_${firstSeenAt}`);
      else seenNames.set(key, row_number);
    }

    let action: 'create' | 'update' = 'create';
    let matchedId: string | null = null;
    if (name && errors.length === 0) {
      const existing = await db.query<{ id: string }>(`SELECT id FROM insurance_products WHERE lower(name) = lower($1)`, [
        name,
      ]);
      if (existing.rowCount === 1) {
        action = 'update';
        matchedId = existing.rows[0].id;
      } else if ((existing.rowCount ?? 0) > 1) {
        errors.push('ambiguous_product_match');
      }
    }

    const ok = errors.length === 0;
    results.push({
      row_number,
      action: ok ? action : 'skip',
      matched_id: matchedId,
      data: ok
        ? {
            name: name as string,
            category: category as string,
            insurer_name: insurerName,
            coverage_amount_kopecks: coverageAmount === undefined ? null : Math.round((coverageAmount as number) * 100),
            validity_days: validityDays as number,
            base_price_kopecks: Math.round((basePrice as number) * 100),
            status: status as string,
          }
        : null,
      raw,
      errors,
      warnings,
    });
  }

  return results;
}

export async function commitProductRow(client: PoolClient, row: ImportRowResult<ProductImportRow>): Promise<void> {
  const d = row.data as ProductImportRow;
  if (row.action === 'update' && row.matched_id) {
    await client.query(
      `UPDATE insurance_products
       SET category = $1, insurer_name = $2, coverage_amount_kopecks = $3, validity_days = $4,
           base_price_kopecks = $5, status = $6, updated_at = now()
       WHERE id = $7`,
      [d.category, d.insurer_name, d.coverage_amount_kopecks, d.validity_days, d.base_price_kopecks, d.status, row.matched_id],
    );
  } else {
    await client.query(
      `INSERT INTO insurance_products (name, category, insurer_name, coverage_amount_kopecks, validity_days, base_price_kopecks, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [d.name, d.category, d.insurer_name, d.coverage_amount_kopecks, d.validity_days, d.base_price_kopecks, d.status],
    );
  }
}

// ---------------------------------------------------------------------------
// Federation-product assignments — columns: federation, product, price, active
//
// federation/product are resolved by exact case-insensitive name-or-slug
// match against the current directory; >1 match is ambiguous and skipped.
// Match key for create-vs-update: (federation_id, product_id) — mirrors the
// natural key a human would use ("this federation's price for this product").
//
// The DB only allows one *active* federation_products row per federation
// (uq_federation_products_one_active_per_federation) — rows that would
// violate this (within the file, or against existing DB state) are flagged
// federation_already_has_active_product and skipped, rather than left to
// fail as a raw constraint violation at commit time.
// ---------------------------------------------------------------------------

export type AssignmentImportRow = {
  federation_id: string;
  product_id: string;
  price_kopecks: number;
  active: boolean;
};

export async function processAssignmentRows(
  db: Queryable,
  rows: RawImportRow[],
): Promise<ImportRowResult<AssignmentImportRow>[]> {
  const results: ImportRowResult<AssignmentImportRow>[] = [];

  const federationsResult = await db.query<{ id: string; name: string; slug: string }>(
    `SELECT id, name, slug FROM federations`,
  );
  const federationDirectory = federationsResult.rows;
  const productsResult = await db.query<{ id: string; name: string }>(`SELECT id, name FROM insurance_products`);
  const productDirectory = productsResult.rows;

  const seenPairs = new Map<string, number>();
  const activeFederationsInFile = new Map<string, number>();

  for (const { row_number, raw } of rows) {
    const errors: string[] = [];
    const warnings: string[] = [];

    const federationValue = textCell(raw, 'federation');
    let federationId: string | undefined;
    if (!federationValue) {
      errors.push('federation_required');
    } else {
      const resolved = resolveByNameOrSlug(federationDirectory, federationValue);
      if ('notFound' in resolved) errors.push('federation_not_found');
      else if ('ambiguous' in resolved) errors.push('ambiguous_federation_match');
      else federationId = resolved.match.id;
    }

    const productValue = textCell(raw, 'product');
    let productId: string | undefined;
    if (!productValue) {
      errors.push('product_required');
    } else {
      const resolved = resolveByNameOrSlug(productDirectory, productValue);
      if ('notFound' in resolved) errors.push('product_not_found');
      else if ('ambiguous' in resolved) errors.push('ambiguous_product_match');
      else productId = resolved.match.id;
    }

    const price = numberCell(raw, 'price');
    if (price === undefined) errors.push('price_required');
    else if (price === 'invalid') errors.push('invalid_price');

    const activeResult = booleanCell(raw, 'active');
    if (activeResult === 'invalid') errors.push('invalid_active');
    const active = activeResult === undefined || activeResult === 'invalid' ? true : activeResult;

    if (federationId && productId) {
      const pairKey = `${federationId}|${productId}`;
      const firstSeenAt = seenPairs.get(pairKey);
      if (firstSeenAt !== undefined) errors.push(`duplicate_assignment_in_file:row_${firstSeenAt}`);
      else seenPairs.set(pairKey, row_number);
    }

    if (federationId && active === true) {
      const firstActiveAt = activeFederationsInFile.get(federationId);
      if (firstActiveAt !== undefined && firstActiveAt !== row_number) {
        errors.push(`duplicate_active_federation_in_file:row_${firstActiveAt}`);
      } else {
        activeFederationsInFile.set(federationId, row_number);
      }
    }

    let action: 'create' | 'update' = 'create';
    let matchedId: string | null = null;
    if (federationId && productId && errors.length === 0) {
      const existing = await db.query<{ id: string }>(
        `SELECT id FROM federation_products WHERE federation_id = $1 AND product_id = $2`,
        [federationId, productId],
      );
      if (existing.rowCount === 1) {
        action = 'update';
        matchedId = existing.rows[0].id;
      } else if ((existing.rowCount ?? 0) > 1) {
        errors.push('ambiguous_assignment_match');
      }
    }

    if (federationId && active === true && errors.length === 0) {
      const activeElsewhere = await db.query<{ id: string }>(
        `SELECT id FROM federation_products WHERE federation_id = $1 AND active = true`,
        [federationId],
      );
      const conflict = activeElsewhere.rows.find((r) => r.id !== matchedId);
      if (conflict) errors.push('federation_already_has_active_product');
    }

    const ok = errors.length === 0;
    results.push({
      row_number,
      action: ok ? action : 'skip',
      matched_id: matchedId,
      data: ok
        ? {
            federation_id: federationId as string,
            product_id: productId as string,
            price_kopecks: Math.round((price as number) * 100),
            active,
          }
        : null,
      raw,
      errors,
      warnings,
    });
  }

  return results;
}

export async function commitAssignmentRow(client: PoolClient, row: ImportRowResult<AssignmentImportRow>): Promise<void> {
  const d = row.data as AssignmentImportRow;
  if (row.action === 'update' && row.matched_id) {
    await client.query(`UPDATE federation_products SET price_kopecks = $1, active = $2, updated_at = now() WHERE id = $3`, [
      d.price_kopecks,
      d.active,
      row.matched_id,
    ]);
  } else {
    await client.query(
      `INSERT INTO federation_products (federation_id, product_id, price_kopecks, active) VALUES ($1, $2, $3, $4)`,
      [d.federation_id, d.product_id, d.price_kopecks, d.active],
    );
  }
}
