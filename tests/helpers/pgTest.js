'use strict';

// Test helper for the Postgres-backed parts of the bot. Point DATABASE_URL at a
// throwaway test database BEFORE requiring any bot code (src/database/pg.js
// reads it at module load). The website repo's `npm run db:setup` creates the
// `cbc_test` database this defaults to.

process.env.NODE_ENV = 'test';
process.env.DB_PATH = process.env.DB_PATH || ':memory:';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://cbc_bot:cbc_bot_dev@localhost:5433/cbc_test';

const pg = require('../../src/database/pg');

// Minimal schema — just the shared tables the tests exercise. Mirrors the
// website repo's db/migrations/0001_init.sql for these tables.
const DDL = `
  CREATE TABLE IF NOT EXISTS members (
    discord_id    text primary key,
    username      text not null,
    joined_at     bigint not null,
    onboarded_at  bigint,
    invite_code   text,
    left_at       bigint
  );

  CREATE TABLE IF NOT EXISTS projects (
    id                bigint generated always as identity primary key,
    name              text not null,
    description       text not null,
    github_url        text,
    builder_name      text not null,
    submitted_by      text not null,
    submitter_tag     text,
    submitted_at      bigint not null,
    built_with        text check (built_with in ('claude_code','claude_web','claude_api','other','none')),
    thumbnail_url     text,
    tags              text[] not null default '{}',
    guild_id          text,
    message_id        text,
    thread_id         text,
    review_message_id text,
    vote_ends_at      bigint,
    vote_closed       boolean not null default false,
    published         boolean not null default false,
    published_at      bigint
  );

  CREATE TABLE IF NOT EXISTS project_votes (
    project_id  bigint not null references projects (id) on delete cascade,
    discord_id  text not null,
    vote        text not null check (vote in ('up','down')),
    voted_at    bigint not null,
    primary key (project_id, discord_id)
  );
`;

async function initSchema() {
  try {
    await pg.query(DDL);
  } catch (err) {
    throw new Error(
      `Cannot reach the test Postgres database (${process.env.DATABASE_URL}).\n` +
      `Run "npm run db:setup" in the CBC-Website repo first, or set TEST_DATABASE_URL.\n` +
      `Original error: ${err.message}`,
    );
  }
}

async function resetTables() {
  await pg.query('TRUNCATE members, projects, project_votes RESTART IDENTITY CASCADE');
}

async function closePg() {
  await pg.pool.end();
}

module.exports = { pg, initSchema, resetTables, closePg };
