// @ts-nocheck - TODO: Add proper type annotations

/**
 * Build a LEFT JOIN chain from a root model through a dependency path.
 * Supports many-to-one/reference-like fields: currentModel.field → refModel (FK join).
 *
 * Example:
 *   rootModel = Orders (alias t0)
 *   path = "customer.address.city"
 *   Joins:
 *     t0.customer_id = t1.id (Customers)
 *     t1.address_id  = t2.id (Addresses)
 *
 * @param {import('../Model').Model} rootModel
 * @param {string} dependencyPath dot-separated path, e.g. "customer.address.city"
 * @returns {{
 *   aliases: string[],
 *   models: any[],
 *   relations: any[],
 *   joins: Array<{ left: string, right: string, table: string, alias: string }>,
 *   leafModel: any,
 *   leafField: string
 * }}
 */
function buildJoinChain(rootModel, dependencyPath) {
  if (!dependencyPath || typeof dependencyPath !== 'string') {
    throw new Error('buildJoinChain: dependencyPath must be a non-empty string');
  }
  const parts = dependencyPath.split('.');
  if (parts.length < 2) {
    throw new Error(
      `Dependency path must include at least one relation and a field, got '${dependencyPath}'`
    );
  }

  const aliases = [];
  const models = [];
  const joins = [];
  const relations = [];

  let currentModel = rootModel;
  let currentAlias = 't0';
  aliases.push(currentAlias);
  models.push(currentModel);

  // Traverse relations (all but last segment)
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i];
    const field = currentModel.fields && currentModel.fields[seg];
    if (!field) {
      throw new Error(
        `Unknown relation segment '${seg}' on model '${currentModel.name}' for path '${dependencyPath}'`
      );
    }
    let nextModel = field.refModel;
    if (!nextModel && field.definition && field.definition.model) {
      // Resolve lazily from definition if refModel not hydrated
      nextModel = currentModel.repo.get(field.definition.model);
    }
    if (!nextModel) {
      throw new Error(
        `Segment '${seg}' on model '${currentModel.name}' is not a reference/many-to-one field`
      );
    }
    const nextAlias = `t${i + 1}`;

    // Default FK join should link the FK on the current model to the PK on the next (referenced) model
    // Example: Comments.post_id (FK on Comments) -> Posts.id (PK on Posts)
    const currentFkCol = field.column || `${seg}_id`;
    const nextPkCol = nextModel.primaryField?.column || 'id';
    joins.push({
      table: nextModel.table,
      alias: nextAlias,
      left: `${currentAlias}.${currentFkCol}`,
      right: `${nextAlias}.${nextPkCol}`,
    });

    currentModel = nextModel;
    currentAlias = nextAlias;
    // Track the relation field name used at each hop for in-memory traversal fallbacks
    relations.push(field.refFieldName || currentFkCol);
    aliases.push(currentAlias);
    models.push(currentModel);
  }

  const leafField = parts[parts.length - 1];
  return { aliases, models, joins, leafModel: currentModel, leafField, relations };
}

/**
 * Select distinct root ids using a single SELECT with LEFT JOIN chain, filtering by leaf record id.
 * @param {import('../Model').Model} rootModel
 * @param {string} dependencyPath
 * @param {import('../Record').Record} leafRecord
 * @returns {Promise<number[]>}
 */
async function selectRootIdsByLeafRecord(rootModel, dependencyPath, leafRecord) {
  const { joins, relations } = buildJoinChain(rootModel, dependencyPath);

  if (!leafRecord.id) {
    // not yet saved, compute parents from in-memory only
    let parentRecord = leafRecord;
    for (let i = relations.length - 1; i >= 0; i--) {
      const rel = relations[i];
      parentRecord = await parentRecord[rel].ready();
    }
    return [parentRecord];
  }

  const knex = rootModel.repo.cnx;
  const rootAlias = 't0';
  const leafAlias = `t${joins.length}`;
  const rootIdCol = `${rootAlias}.id`;

  const qb = knex.from({ [rootAlias]: rootModel.table }).distinct(rootIdCol);
  for (const j of joins) {
    qb.leftJoin({ [j.alias]: j.table }, j.left, j.right);
  }

  // Filter at the leaf by its id (most robust irrespective of which leaf field changed)
  const leafId = leafRecord && leafRecord.id;
  if (leafId == null) return [];
  qb.where(`${leafAlias}.id`, leafId);

  const rows = await qb;
  return await rootModel.lookup(rows.map((r) => r.id));
}

export { buildJoinChain, selectRootIdsByLeafRecord };
