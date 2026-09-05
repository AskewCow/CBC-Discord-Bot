// Shared primitives for the two admin-configurable "ordered step" flows
// (onboarding questions and ticket-category flows). The runners stay separate —
// they are genuinely different state machines (onboarding records answers,
// pauses for DM replies and supports an early stop; tickets do none of that) —
// but the ordering helper and the CRUD shape are identical.

const db = require('../database/db');

/** Steps after `step` in (step_order, id) order — the tail still to run. */
const stepsAfter = (steps, step) =>
  steps.filter(
    (s) => s.step_order > step.step_order || (s.step_order === step.step_order && s.id > step.id),
  );

/**
 * CRUD for an ordered step table keyed by a single parent column.
 *
 * @param {object} o
 * @param {string} o.table      e.g. 'onboarding_steps'
 * @param {string} o.parentCol  e.g. 'flow_id'
 * @param {string[]} o.columns  insertable columns after the parent + step_order,
 *                              in order, e.g. ['step_type','content','yes_content','no_content']
 */
function stepTable({ table, parentCol, columns }) {
  const insertCols = [parentCol, 'step_order', ...columns].join(', ');
  const insertQ = `INSERT INTO ${table} (${insertCols}) VALUES (${
    [parentCol, 'step_order', ...columns].map(() => '?').join(', ')
  })`;
  const maxOrderQ = `SELECT COALESCE(MAX(step_order), -1) AS m FROM ${table} WHERE ${parentCol} = ?`;
  const listQ = `SELECT * FROM ${table} WHERE ${parentCol} = ? ORDER BY step_order, id`;
  const getQ = `SELECT * FROM ${table} WHERE id = ?`;
  const removeQ = `DELETE FROM ${table} WHERE id = ?`;
  const clearQ = `DELETE FROM ${table} WHERE ${parentCol} = ?`;

  // better-sqlite3 caches prepared statements by SQL text, so preparing per
  // call is cheap — and it means the table need not exist at module load.
  return {
    list: (parentId) => db.prepare(listQ).all(parentId),
    get: (id) => db.prepare(getQ).get(id),
    add: (parentId, ...values) => {
      const order = db.prepare(maxOrderQ).get(parentId).m + 1;
      // Normalise undefined/'' → null for the nullable content columns.
      const normalised = values.map((v) => (v === undefined || v === '' ? null : v));
      return db.prepare(insertQ).run(parentId, order, ...normalised).lastInsertRowid;
    },
    remove: (id) => db.prepare(removeQ).run(id),
    clear: (parentId) => db.prepare(clearQ).run(parentId),
  };
}

module.exports = { stepsAfter, stepTable };
