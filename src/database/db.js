const Database = require('better-sqlite3');
const path = require('path');
const logger = require('../utils/logger');

const rawPath = process.env.DB_PATH || './data/bot.db';
const dbPath  = rawPath === ':memory:' ? ':memory:' : path.resolve(rawPath);

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

logger.info(`Database connected: ${dbPath}`);

module.exports = db;
