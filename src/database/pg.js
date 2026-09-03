// Postgres connection for the shared "public subgraph" — members, projects,
// events, announcements and their dependent tables. The bot connects as the
// full-access `cbc_bot` role.
//
// Genuinely internal data (config, tickets, onboarding, invite tracking,
// event_thank_you) stays in SQLite — see ./db.js and ./schema.js.

const { Pool, types } = require('pg');
const logger = require('../utils/logger');

// Parse int8 (OID 20) as a JS number rather than a string. Every bigint we
// store is an epoch-seconds timestamp or a small identity id, all well within
// Number.MAX_SAFE_INTEGER. Discord snowflakes are stored as `text`, so there is
// no precision risk here.
types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  logger.error('DATABASE_URL is not set — the bot cannot reach the shared Postgres database.');
}

const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  logger.error(`Postgres pool error: ${err.message}`, err);
});

/** Run a query, returning the full pg result. */
function query(text, params) {
  return pool.query(text, params);
}

/** First row, or undefined. */
async function get(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0];
}

/** All rows. */
async function all(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

/** Run fn inside a transaction with a dedicated client. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Quick connectivity check for startup logging. */
async function ping() {
  await pool.query('select 1');
}

module.exports = { pool, query, get, all, tx, ping };
