const Database = require('better-sqlite3');
const path = require('path');
const logger = require('../utils/logger');

const dbPath = path.resolve(process.env.DB_PATH || './data/bot.db');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

logger.info(`Database connected: ${dbPath}`);

module.exports = db;
