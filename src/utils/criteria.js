'use strict';

/**
 * Apply a JSON-serializable criteria object to a Knex query builder.
 * Supported:
 *  - Logic: and, or, not
 *  - Field ops: eq, ne, gt, gte, lt, lte, in, nin, between, nbetween, like, ilike, null, notNull
 *  - Shorthand: { field: value } => eq
 *  - Qualify columns: "table.column"
 * @param {import('knex').Knex.QueryBuilder} qb
 * @param {object} criteria
 * @param {'and'|'or'} combine
 */
function applyCriteria(qb, criteria, combine = 'and') {
  if (!criteria || typeof criteria !== 'object') return qb;

  const keys = Object.keys(criteria);
  const logicKeys = new Set(['and', 'or', 'not']);

  // Group logical parts to wrap them properly
  const logic = keys.filter(k => logicKeys.has(k));
  const fields = keys.filter(k => !logicKeys.has(k));

  // Apply field predicates
  for (const field of fields) {
    const spec = criteria[field];
    applyFieldPredicate(qb, combine, field, spec);
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
          const subCombine = i === 0 ? 'and' : (useOr ? 'or' : 'and');
          applyCriteria(subQb, sub, subCombine);
        }
      };
      if (combine === 'or') qb.orWhere(wrap);
      else qb.where(wrap);
    } else if (k === 'not') {
      const sub = criteria[k];
      const wrap = (subQb) => applyCriteria(subQb, sub, 'and');
      if (combine === 'or') qb.orWhereNot(wrap);
      else qb.whereNot(wrap);
    }
  }

  return qb;
}

function applyFieldPredicate(qb, combine, col, spec) {
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
    case 'eq':    return or ? qb.orWhere(col, val) : qb.where(col, val);
    case 'ne':    return or ? qb.orWhereNot(col, val) : qb.whereNot(col, val);
    case 'gt':    return or ? qb.orWhere(col, '>', val) : qb.where(col, '>', val);
    case 'gte':   return or ? qb.orWhere(col, '>=', val) : qb.where(col, '>=', val);
    case 'lt':    return or ? qb.orWhere(col, '<', val) : qb.where(col, '<', val);
    case 'lte':   return or ? qb.orWhere(col, '<=', val) : qb.where(col, '<=', val);
    case 'in':    return or ? qb.orWhereIn(col, Array.isArray(val) ? val : [val]) : qb.whereIn(col, Array.isArray(val) ? val : [val]);
    case 'nin':   return or ? qb.orWhereNotIn(col, Array.isArray(val) ? val : [val]) : qb.whereNotIn(col, Array.isArray(val) ? val : [val]);
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
      return val ? (or ? qb.orWhereNull(col) : qb.whereNull(col))
                 : (or ? qb.orWhereNotNull(col) : qb.whereNotNull(col));
    }
    case 'notNull': {
      return val ? (or ? qb.orWhereNotNull(col) : qb.whereNotNull(col))
                 : (or ? qb.orWhereNull(col) : qb.whereNull(col));
    }
    default: {
      // Unknown op → ignore
      return qb;
    }
  }
}

module.exports = { applyCriteria };