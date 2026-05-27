import { HttpError } from './http-error.js';

export function rowOrNotFound(result, entityName) {
  if (result.rowCount === 0) {
    throw new HttpError(404, `${entityName} was not found.`);
  }

  return result.rows[0];
}

export function addFilter(filters, values, column, value) {
  if (value !== undefined) {
    values.push(value);
    filters.push(`${column} = $${values.length}`);
  }
}

export function whereClause(filters) {
  return filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
}

export function updateStatement(table, id, fields, columns, returningColumns) {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);

  if (entries.length === 0) {
    throw new HttpError(400, 'At least one supported field must be provided.');
  }

  const values = entries.map(([, value]) => value);
  const assignments = entries.map(
    ([field], index) => `${columns[field]} = $${index + 1}`,
  );
  values.push(id);

  return {
    text: `UPDATE ${table} SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} RETURNING ${returningColumns}`,
    values,
  };
}
