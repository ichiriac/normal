'use strict';

/**
 * WeakMap to track joins per query builder to avoid modifying Knex internals
 */
const joinTracker = new WeakMap();

/**
 * Parse a relational field path and resolve the necessary joins.
 * Example: "author.organization.name" =>
 *   - Join users table via author_id
 *   - Join organizations table via organization_id
 *   - Target column: organizations.name
 *
 * @param {import('../Model').Model} model - The starting model
 * @param {string} fieldPath - Dot-notation field path (e.g., "author.organization.name")
 * @returns {{ joins: Array<{fromTable: string, fromColumn: string, toTable: string, toColumn: string}>, targetTable: string, targetColumn: string, targetField: import('../Fields').Field }}
 */
function resolveRelationalPath(model, fieldPath) {
  const parts = fieldPath.split('.');

  // If no dots, it's a direct field
  if (parts.length === 1) {
    const field = model.fields[fieldPath];
    if (!field) {
      throw new Error(`Field '${fieldPath}' not found in model '${model.name}'`);
    }
    return {
      joins: [],
      targetTable: model.table,
      targetColumn: field.column,
      targetField: field,
    };
  }

  const joins = [];
  let currentModel = model;
  let currentTable = model.table;

  // Walk through the path, building joins
  for (let i = 0; i < parts.length - 1; i++) {
    const fieldName = parts[i];
    const field = currentModel.fields[fieldName];

    if (!field) {
      throw new Error(
        `Field '${fieldName}' not found in model '${currentModel.name}' while resolving path '${fieldPath}'`
      );
    }

    // Handle many-to-one relationships
    if (field.type === 'many-to-one') {
      const targetModel = field.refModel;
      const foreignKeyColumn = field.column; // e.g., "author_id"

      joins.push({
        fromTable: currentTable,
        fromColumn: foreignKeyColumn,
        toTable: targetModel.table,
        toColumn: 'id', // Foreign keys reference the id column
      });

      currentModel = targetModel;
      currentTable = targetModel.table;
    }
    // Handle one-to-many relationships (reverse lookup)
    else if (field.type === 'one-to-many') {
      const targetModel = field.refModel;
      const foreignKeyFieldName = field.refFieldName; // e.g., "author_id"
      const foreignKeyField = targetModel.fields[foreignKeyFieldName];

      if (!foreignKeyField) {
        throw new Error(
          `Foreign key field '${foreignKeyFieldName}' not found in model '${targetModel.name}'`
        );
      }

      joins.push({
        fromTable: currentTable,
        fromColumn: 'id',
        toTable: targetModel.table,
        toColumn: foreignKeyField.column,
      });

      currentModel = targetModel;
      currentTable = targetModel.table;
    }
    // Handle many-to-many relationships
    else if (field.type === 'many-to-many') {
      throw new Error(
        `Many-to-many relationships are not yet supported in relational filters (field '${fieldName}' in path '${fieldPath}')`
      );
    } else {
      throw new Error(
        `Field '${fieldName}' in model '${currentModel.name}' is not a relational field (type: ${field.type}). Cannot traverse path '${fieldPath}'.`
      );
    }
  }

  // Get the final field
  const finalFieldName = parts[parts.length - 1];
  const finalField = currentModel.fields[finalFieldName];

  if (!finalField) {
    throw new Error(
      `Field '${finalFieldName}' not found in model '${currentModel.name}' while resolving path '${fieldPath}'`
    );
  }

  return {
    joins,
    targetTable: currentTable,
    targetColumn: finalField.column,
    targetField: finalField,
  };
}

/**
 * Apply joins to a Knex query builder based on resolved paths.
 * Ensures joins are only added once (deduplication).
 *
 * @param {import('knex').Knex.QueryBuilder} qb - Knex query builder
 * @param {Array<{fromTable: string, fromColumn: string, toTable: string, toColumn: string}>} joins - Array of join specifications
 */
function applyJoins(qb, joins) {
  // Track which joins have been applied to avoid duplicates
  if (!joinTracker.has(qb)) {
    joinTracker.set(qb, new Set());
  }

  const appliedJoins = joinTracker.get(qb);

  for (const join of joins) {
    // Create a unique key for this join
    const joinKey = `${join.fromTable}.${join.fromColumn}->${join.toTable}.${join.toColumn}`;

    if (!appliedJoins.has(joinKey)) {
      qb.join(
        join.toTable,
        `${join.fromTable}.${join.fromColumn}`,
        `${join.toTable}.${join.toColumn}`
      );
      appliedJoins.add(joinKey);
    }
  }
}

module.exports = {
  resolveRelationalPath,
  applyJoins,
};
