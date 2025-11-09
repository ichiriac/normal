// @ts-nocheck - TODO: Add proper type annotations


import { resolveRelationalPath, applyJoins  } from './joins';

/**
 * Collect all joins needed for relational paths in criteria.
 * This scans the criteria tree without applying any where clauses.
 * @param {import('../Model').Model} model
 * @param {object} criteria
 * @param {Set<string>} joins - Accumulated set of join keys
 */
function collectJoins(model, criteria, joins = new Set()) {
  if (!criteria || typeof criteria !== 'object' || !model) return joins;

  const keys = Object.keys(criteria);
  const logicKeys = new Set(['and', 'or', 'not']);

  for (const key of keys) {
    if (logicKeys.has(key)) {
      // Recursively collect joins from nested criteria
      if (key === 'not') {
        collectJoins(model, criteria[key], joins);
      } else if (Array.isArray(criteria[key])) {
        for (const sub of criteria[key]) {
          collectJoins(model, sub, joins);
        }
      }
    } else {
      // This is a field - check if it's a relational path
      if (key.includes('.') && !key.includes('::')) {
        try {
          const resolved = resolveRelationalPath(model, key);
          // Add each join to the set using a string key for uniqueness
          for (const join of resolved.joins) {
            const joinKey = `${join.fromTable}.${join.fromColumn}->${join.toTable}.${join.toColumn}`;
            joins.add(joinKey);
          }
        } catch (err) {
          // Not a relational path, ignore
        }
      }
    }
  }

  return joins;
}

/**
 * Apply a JSON-serializable criteria object to a Knex query builder.
 * Supported:
 *  - Logic: and, or, not
 *  - Field ops: eq, ne, gt, gte, lt, lte, in, nin, between, nbetween, like, ilike, null, notNull
 *  - Shorthand: { field: value } => eq
 *  - Qualify columns: "table.column"
 *  - Relational paths: "author.organization.name" (auto-joins)
 * @param {import('knex').Knex.QueryBuilder} qb
 * @param {object} criteria
 * @param {'and'|'or'} combine
 * @param {import('../Model').Model} [model] - Optional model for resolving relational paths
 */
function applyCriteria(qb, criteria, combine = 'and', model = null) {
  if (!criteria || typeof criteria !== 'object') return qb;

  // Get model from query context if not provided
  if (!model) {
    const context =
      qb.queryContext && typeof qb.queryContext === 'function' ? qb.queryContext() : null;
    model = context?.model;
  }

  // First pass: collect all joins needed from the entire criteria tree
  if (model) {
    const joinsSet = collectJoins(model, criteria);
    // Reconstruct join objects from string keys
    const joins = Array.from(joinsSet).map((joinKey) => {
      // Parse key format: "fromTable.fromColumn->toTable.toColumn"
      const [from, to] = joinKey.split('->');
      const [fromTable, fromColumn] = from.split('.');
      const [toTable, toColumn] = to.split('.');
      return { fromTable, fromColumn, toTable, toColumn };
    });
    applyJoins(qb, joins);
  }

  // Second pass: apply where clauses
  return applyCriteriaInternal(qb, criteria, combine, model);
}

/**
 * Internal function that applies criteria without collecting joins.
 * @param {import('knex').Knex.QueryBuilder} qb
 * @param {object} criteria
 * @param {'and'|'or'} combine
 * @param {import('../Model').Model} [model]
 */
function applyCriteriaInternal(qb, criteria, combine = 'and', model = null) {
  if (!criteria || typeof criteria !== 'object') return qb;

  const keys = Object.keys(criteria);
  const logicKeys = new Set(['and', 'or', 'not']);

  // Group logical parts to wrap them properly
  const logic = keys.filter((k) => logicKeys.has(k));
  const fields = keys.filter((k) => !logicKeys.has(k));

  // Apply field predicates
  for (const field of fields) {
    const spec = criteria[field];
    applyFieldPredicate(qb, combine, field, spec, model);
  }

  // Apply logical parts
  for (const k of logic) {
    if (k === 'and' || k === 'or') {
      const arr = Array.isArray(criteria[k]) ? criteria[k] : [];
      if (!arr.length) continue;
      const useOr = k === 'or';
      const wrap = (subQb) => {
        for (let i = 0; i < arr.length; i++) {
          const sub = arr[i];
          const subCombine = i === 0 ? 'and' : useOr ? 'or' : 'and';
          applyCriteriaInternal(subQb, sub, subCombine, model);
        }
      };
      if (combine === 'or') qb.orWhere(wrap);
      else qb.where(wrap);
    } else if (k === 'not') {
      const sub = criteria[k];
      const wrap = (subQb) => applyCriteriaInternal(subQb, sub, 'and', model);
      if (combine === 'or') qb.orWhereNot(wrap);
      else qb.whereNot(wrap);
    }
  }

  return qb;
}

function applyFieldPredicate(qb, combine, col, spec, model = null) {
  // Check if this is a relational path (contains dots)
  // Note: joins are already applied at the top level, we just need to resolve the column name
  if (model && col.includes('.') && !col.includes('::')) {
    // This might be a relational path, try to resolve it
    try {
      const resolved = resolveRelationalPath(model, col);
      // Use the resolved target column (qualified with table name)
      col = `${resolved.targetTable}.${resolved.targetColumn}`;
    } catch (err) {
      // If resolution fails, treat as a regular qualified column (e.g., "table.column")
      // and let Knex handle it
    }
  }

  // Shorthand scalar => eq
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return addCmp(qb, combine, col, 'eq', spec);
  }
  for (const op of Object.keys(spec)) {
    addCmp(qb, combine, col, op, spec[op]);
  }
}

function addCmp(qb, combine, col, op, val) {
  const or = combine === 'or';
  switch (op) {
    case 'eq':
      return or ? qb.orWhere(col, val) : qb.where(col, val);
    case 'ne':
      return or ? qb.orWhereNot(col, val) : qb.whereNot(col, val);
    case 'gt':
      return or ? qb.orWhere(col, '>', val) : qb.where(col, '>', val);
    case 'gte':
      return or ? qb.orWhere(col, '>=', val) : qb.where(col, '>=', val);
    case 'lt':
      return or ? qb.orWhere(col, '<', val) : qb.where(col, '<', val);
    case 'lte':
      return or ? qb.orWhere(col, '<=', val) : qb.where(col, '<=', val);
    case 'in':
      return or
        ? qb.orWhereIn(col, Array.isArray(val) ? val : [val])
        : qb.whereIn(col, Array.isArray(val) ? val : [val]);
    case 'nin':
      return or
        ? qb.orWhereNotIn(col, Array.isArray(val) ? val : [val])
        : qb.whereNotIn(col, Array.isArray(val) ? val : [val]);
    case 'between': {
      const v = Array.isArray(val) ? val : [undefined, undefined];
      return or ? qb.orWhereBetween(col, v) : qb.whereBetween(col, v);
    }
    case 'nbetween': {
      const v = Array.isArray(val) ? val : [undefined, undefined];
      return or ? qb.orWhereNotBetween(col, v) : qb.whereNotBetween(col, v);
    }
    case 'like': {
      return or ? qb.orWhere(col, 'like', val) : qb.where(col, 'like', val);
    }
    case 'ilike': {
      // Cross-dialect ILIKE: use whereILike for PG/Redshift; fallback to LOWER() LIKE
      const client = qb.client?.config?.client || '';
      if (client.includes('pg') || client.includes('redshift')) {
        return or ? qb.orWhereILike(col, val) : qb.whereILike(col, val);
      }
      const raw = qb.client.raw('LOWER(??) LIKE LOWER(?)', [col, val]);
      return or ? qb.orWhere(raw) : qb.where(raw);
    }
    case 'null': {
      return val
        ? or
          ? qb.orWhereNull(col)
          : qb.whereNull(col)
        : or
          ? qb.orWhereNotNull(col)
          : qb.whereNotNull(col);
    }
    case 'notNull': {
      return val
        ? or
          ? qb.orWhereNotNull(col)
          : qb.whereNotNull(col)
        : or
          ? qb.orWhereNull(col)
          : qb.whereNull(col);
    }
    default: {
      // Unknown op → ignore
      return qb;
    }
  }
}

export { applyCriteria  };
