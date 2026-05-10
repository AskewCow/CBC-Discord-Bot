# CBC Discord Bot — Testing Reference

## Running Tests

```bash
npm test
```

This runs all 175 tests across 7 files using Node's built-in test runner (no extra dependencies required — Node ≥ 18 only).

---

## Structure

```
tests/
├── unit/
│   ├── embeds.test.js          — successEmbed / errorEmbed / infoEmbed
│   ├── projectUtils.test.js    — buildProjectEmbed, buildVoteRow, BUILT_WITH_LABELS
│   └── eventHandlers.test.js   — formatDuration, all event embed/button builders
└── integration/
    ├── config.test.js          — guild config CRUD (addValue, removeValue, getValues, getAllGrouped)
    ├── inviteUtils.test.js     — leaderboard queries, invite counts, persistence
    ├── onboarding.test.js      — flow/step/session management, button builders
    └── projectVotes.test.js    — getVoteCounts, vote upsert, schema constraints
```

**Unit tests** cover pure functions with no database dependency. They still set `DB_PATH=:memory:` because some modules (e.g. `eventHandlers.js`) import `db` at the module level, but none of the tested functions actually query the database.

**Integration tests** use an isolated in-memory SQLite database. Each file sets `process.env.DB_PATH = ':memory:'` before any imports, and calls `runSchema()` twice in `before()` — the first pass creates the tables, the second pass applies migrations that add columns to freshly-created tables.

---

## Coverage Summary

| File | Tests | Key edge cases |
|------|-------|----------------|
| `embeds.test.js` | 10 | Correct hex colors, title/description set, timestamp always present |
| `projectUtils.test.js` | 43 | `built_with: 'none'` omits field; vote-closed green vs grey (tie included); disabled button labels with counts |
| `eventHandlers.test.js` | 55 | `formatDuration` singular/plural (0–180 min); unknown event type falls back to brand blue; ended footer; `null` location → TBD; no organizers → N/A |
| `config.test.js` | 17 | Duplicate add returns `false`; cross-guild isolation; `removeValue` on missing entry returns `false` |
| `inviteUtils.test.js` | 17 | Departed members excluded from counts; live-scope cutoff; leaderboard capped at 10 |
| `onboarding.test.js` | 27 | `setWelcomeMsg` preserves `flow_type`; `upsertQuestionsFlow` preserves `welcome_msg`; `clearSteps` scoped to flow; `appendAnswer` accumulates JSON; disabled button styles |
| `projectVotes.test.js` | 11 | Direction change (up→down, down→up); per-project scoping; `CHECK` constraint rejects invalid vote values; PK prevents duplicate direct inserts |

---

## How Integration Tests Isolate State

Each integration test file opens its own in-memory database. Because `node --test` runs each file in a separate process, the module cache is fresh per file — setting `DB_PATH` at the top of the file guarantees that `db.js` sees the `:memory:` value before it is required.

```js
// Must be the very first lines, before any require()
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
```

The double `runSchema()` call in each `before()` block handles the chicken-and-egg in the migration system: migrations skip when tables don't exist yet, so a second pass is needed to apply the column additions.

---

## Adding New Tests

- Place pure-function tests in `tests/unit/`.
- Place tests that query the database in `tests/integration/`.
- Always set `DB_PATH` and `NODE_ENV` as the first two lines.
- Call `runSchema()` twice in `before()` for any integration test file.
- Add the new file path to the `test` script in `package.json`.
