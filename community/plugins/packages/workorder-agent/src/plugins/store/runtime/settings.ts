import type Database from 'better-sqlite3'
import type { AuditEvent, SettingRecord } from '../types.js'

/** 管理运行开关、配置记录与不可变审计事件。 */
export class StoreSettings {
  constructor(private readonly db: Database.Database) {}

  /** 写入类型化设置，并保留修改主体。 */
  set(setting: SettingRecord): void {
    const now = new Date().toISOString()
    this.db.prepare(`INSERT INTO settings(key,value,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).run(setting.key, setting.value, now, setting.updatedBy ?? 'system')
  }

  /** 读取设置；兼容旧 settings 表记录。 */
  get(key: string): SettingRecord | undefined {
    return this.db.prepare(`SELECT key,value,updated_at updatedAt,updated_by updatedBy FROM settings WHERE key=?`).get(key) as SettingRecord | undefined
  }

  /** 保存布尔开关。 */
  setFlag(key: string, enabled: boolean, actor: string): void { this.set({ key, value: String(enabled), updatedBy: actor }) }

  /** 读取布尔开关，缺失或非法值均使用默认值。 */
  getFlag(key: string, fallback: boolean): boolean {
    const value = this.get(key)?.value
    return value === 'true' ? true : value === 'false' ? false : fallback
  }

  /** 追加不可变审计事件。 */
  appendAudit(event: AuditEvent): void {
    this.db.prepare(`INSERT INTO audit_events(category,action,subject,detail_json,actor,created_at) VALUES(?,?,?,?,?,?)`).run(event.category, event.action, event.subject, JSON.stringify(event.detail), event.actor, event.createdAt ?? new Date().toISOString())
  }
}
