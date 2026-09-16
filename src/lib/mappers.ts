/** Shared row -> JSON mappers for entities that are embedded in several endpoints. */

export function personSummary(row: Record<string, unknown>, prefix = 'person_') {
  return {
    id: row[`${prefix}id`] as string,
    last_name: row[`${prefix}last_name`] as string,
    first_name: row[`${prefix}first_name`] as string,
    patronymic: (row[`${prefix}patronymic`] as string | null) ?? null,
  };
}

export function federationSummary(row: Record<string, unknown>, prefix = 'federation_') {
  const id = row[`${prefix}id`];
  if (!id) {
    return null;
  }
  return {
    id: id as string,
    name: row[`${prefix}name`] as string,
  };
}

export function productSummary(row: Record<string, unknown>, prefix = 'product_') {
  return {
    id: row[`${prefix}id`] as string,
    name: row[`${prefix}name`] as string,
  };
}
