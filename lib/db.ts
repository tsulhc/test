import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

type CachedSettlementBlockRow = {
  height: number;
  block_time: string;
  events_json: string;
};

const defaultDbPath = path.join(process.cwd(), "data", "pocket-dashboard.sqlite");
const dbPath = process.env.POCKET_SQLITE_PATH ?? defaultDbPath;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS settlement_blocks (
    height INTEGER PRIMARY KEY,
    block_time TEXT NOT NULL,
    events_json TEXT NOT NULL,
    scanned_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dashboard_cache (
    window TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const selectSettlementBlocksStatement = db.prepare(
  `SELECT height, block_time, events_json FROM settlement_blocks WHERE height IN (${Array.from({ length: 999 }, () => "?").join(",")})`
);

const insertSettlementBlockStatement = db.prepare(
  `
    INSERT INTO settlement_blocks (height, block_time, events_json, scanned_at)
    VALUES (@height, @block_time, @events_json, @scanned_at)
    ON CONFLICT(height) DO UPDATE SET
      block_time = excluded.block_time,
      events_json = excluded.events_json,
      scanned_at = excluded.scanned_at
  `
);

const selectMetaStatement = db.prepare("SELECT value FROM meta WHERE key = ?");

const upsertMetaStatement = db.prepare(
  `
    INSERT INTO meta (key, value, updated_at)
    VALUES (@key, @value, @updated_at)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `
);

const selectDashboardCacheStatement = db.prepare(
  "SELECT payload_json, updated_at FROM dashboard_cache WHERE window = ?"
);

const upsertDashboardCacheStatement = db.prepare(
  `
    INSERT INTO dashboard_cache (window, payload_json, updated_at)
    VALUES (@window, @payload_json, @updated_at)
    ON CONFLICT(window) DO UPDATE SET
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `
);

export function getCachedSettlementBlocks(heights: number[]): Map<number, CachedSettlementBlockRow> {
  const result = new Map<number, CachedSettlementBlockRow>();

  for (let start = 0; start < heights.length; start += 999) {
    const batch = heights.slice(start, start + 999);
    if (batch.length === 0) continue;

    const rows = selectSettlementBlocksStatement.all(...batch, ...Array.from({ length: 999 - batch.length }, () => null)) as CachedSettlementBlockRow[];
    for (const row of rows) {
      if (row?.height) {
        result.set(row.height, row);
      }
    }
  }

  return result;
}

export function saveSettlementBlock(height: number, blockTime: string, eventsJson: string): void {
  insertSettlementBlockStatement.run({
    height,
    block_time: blockTime,
    events_json: eventsJson,
    scanned_at: new Date().toISOString()
  });
}

export function getMeta(key: string): string | null {
  const row = selectMetaStatement.get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  upsertMetaStatement.run({
    key,
    value,
    updated_at: new Date().toISOString()
  });
}

export function getDashboardCache(window: string): { payloadJson: string; updatedAt: string } | null {
  const row = selectDashboardCacheStatement.get(window) as { payload_json: string; updated_at: string } | undefined;
  if (!row) {
    return null;
  }

  return {
    payloadJson: row.payload_json,
    updatedAt: row.updated_at
  };
}

export function setDashboardCache(window: string, payloadJson: string): void {
  upsertDashboardCacheStatement.run({
    window,
    payload_json: payloadJson,
    updated_at: new Date().toISOString()
  });
}
