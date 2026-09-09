import type Database from 'better-sqlite3'
import { migrateSchema } from './migrations.js'

/** 初始化持久化表，并以增量迁移保持旧数据兼容。 */
export function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, start_date TEXT NOT NULL,
      end_date TEXT NOT NULL, status TEXT NOT NULL, scanned INTEGER NOT NULL,
      violation_count INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deliveries (
      key TEXT PRIMARY KEY, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS previews (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, start_date TEXT NOT NULL,
      end_date TEXT NOT NULL, message TEXT NOT NULL, message_hash TEXT NOT NULL,
      result_json TEXT NOT NULL, expires_at TEXT NOT NULL, status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS webhook_events (
      trace_id TEXT PRIMARY KEY, issue_id INTEGER NOT NULL, project_id INTEGER NOT NULL,
      payload_json TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT, next_attempt_at TEXT, result_json TEXT, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    );
  `)
  migrateSchema(db)
}
