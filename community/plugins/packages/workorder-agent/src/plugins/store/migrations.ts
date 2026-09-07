import type Database from 'better-sqlite3'

interface ColumnRow { name: string }

export const LATEST_SCHEMA_VERSION = 3

function addColumn(db: Database.Database, table: string, definition: string): void {
  const name = definition.split(' ')[0] ?? ''
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnRow[]
  if (!columns.some((column) => column.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
}

/** 执行向前兼容迁移，保留旧数据库中的记录。 */
export function migrateSchema(db: Database.Database): void {
  const migrate = db.transaction(() => {
    addColumn(db, 'deliveries', 'lease_expires_at TEXT')
    addColumn(db, 'deliveries', 'lease_owner TEXT')
    addColumn(db, 'webhook_events', 'lease_expires_at TEXT')
    addColumn(db, 'webhook_events', 'lease_owner TEXT')
    addColumn(db, 'webhook_events', 'dead_lettered_at TEXT')
    addColumn(db, 'settings', 'updated_at TEXT')
    addColumn(db, 'settings', 'updated_by TEXT')
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL,
        action TEXT NOT NULL, subject TEXT NOT NULL, detail_json TEXT NOT NULL,
        actor TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_claim
        ON webhook_events(status, next_attempt_at, lease_expires_at, created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);
    `)
    db.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?)')
      .run(new Date().toISOString())
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_tasks (
        id TEXT PRIMARY KEY, delivery_key TEXT NOT NULL UNIQUE, source_type TEXT NOT NULL,
        source_id TEXT, actor TEXT NOT NULL, message TEXT NOT NULL, message_hash TEXT NOT NULL,
        status TEXT NOT NULL, chunk_count INTEGER NOT NULL CHECK(chunk_count>=0),
        sent_chunk_count INTEGER NOT NULL DEFAULT 0 CHECK(sent_chunk_count>=0 AND sent_chunk_count<=chunk_count),
        attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3,
        error TEXT, lease_owner TEXT, lease_expires_at TEXT, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, completed_at TEXT, dead_lettered_at TEXT
      );
      CREATE TABLE IF NOT EXISTS message_chunks (
        task_id TEXT NOT NULL, sequence INTEGER NOT NULL, content TEXT NOT NULL,
        content_hash TEXT NOT NULL, byte_length INTEGER NOT NULL, character_length INTEGER NOT NULL,
        status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, error TEXT, msg_id TEXT,
        sent_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(task_id,sequence), FOREIGN KEY(task_id) REFERENCES message_tasks(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_message_task_claim
        ON message_tasks(status,lease_expires_at,created_at);
      CREATE INDEX IF NOT EXISTS idx_message_task_source
        ON message_tasks(source_type,source_id,created_at);
      CREATE INDEX IF NOT EXISTS idx_message_task_created ON message_tasks(created_at);
    `)
    db.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(2, ?)')
      .run(new Date().toISOString())
    db.exec(`
      CREATE TABLE IF NOT EXISTS issues (
        id INTEGER PRIMARY KEY, project_name TEXT NOT NULL, subject TEXT NOT NULL,
        assignee_name TEXT NOT NULL, status_name TEXT NOT NULL, game_product TEXT NOT NULL,
        expected_delivery_date TEXT NOT NULL, art_category TEXT NOT NULL,
        delivery_channel TEXT NOT NULL, return_delivery_channel TEXT NOT NULL,
        ai_delivery_channel TEXT NOT NULL, ai_pipeline_time TEXT NOT NULL,
        total_hours TEXT NOT NULL, design_quantity TEXT NOT NULL, start_date TEXT NOT NULL,
        due_date TEXT NOT NULL, created_on TEXT NOT NULL, updated_on TEXT NOT NULL,
        closed_on TEXT NOT NULL, synced_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_issues_updated ON issues(updated_on);
    `)
    db.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(3, ?)')
      .run(new Date().toISOString())
  })
  migrate()
}
