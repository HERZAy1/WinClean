import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { buildBreakdowns, getBreakdown, listBreakdowns } from './service'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE apps (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, publisher TEXT, version TEXT,
      installLocation TEXT, uninstallString TEXT, source TEXT NOT NULL,
      registryKeys TEXT NOT NULL DEFAULT '[]', hidden INTEGER NOT NULL DEFAULT 0,
      exePaths TEXT NOT NULL DEFAULT '[]', publisherKeys TEXT NOT NULL DEFAULT '[]',
      servicePaths TEXT NOT NULL DEFAULT '[]', uwpPackage TEXT
    );
    CREATE TABLE files (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scanId INTEGER NOT NULL, path TEXT NOT NULL,
      parentPath TEXT, name TEXT NOT NULL, isDir INTEGER NOT NULL, sizeBytes INTEGER NOT NULL,
      mtimeMs INTEGER NOT NULL DEFAULT 0, owner TEXT NOT NULL DEFAULT 'unknown',
      ownerReason TEXT, appId TEXT
    );
    CREATE TABLE size_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scanId INTEGER NOT NULL, appId TEXT NOT NULL,
      path TEXT NOT NULL, sizeBytes INTEGER NOT NULL, category TEXT NOT NULL,
      riskLevel TEXT NOT NULL, reason TEXT NOT NULL, source TEXT NOT NULL
    );
  `)
  db.prepare(
    "INSERT INTO apps (id, name, publisher, source, registryKeys, hidden, exePaths, publisherKeys, servicePaths, installLocation) VALUES ('acme', 'Acme', 'Acme', 'registry', '[]', 0, '[]', '[]', '[]', 'C:\\Program Files\\Acme')"
  ).run()
  const insert = db.prepare(
    'INSERT INTO files (scanId, path, parentPath, name, isDir, sizeBytes, owner, appId) VALUES (1, ?, NULL, ?, 0, ?, ?, ?)'
  )
  insert.run('C:\\Program Files\\Acme\\app.exe', 'app.exe', 100, 'unknown', 'acme')
  insert.run('C:\\Program Files\\Acme\\Cache\\a.bin', 'a.bin', 50, 'unknown', 'acme')
  insert.run('C:\\Users\\Alice\\AppData\\Local\\Acme\\data.db', 'data.db', 200, 'unknown', 'acme')
  insert.run('C:\\Users\\Alice\\AppData\\Local\\Acme\\config', 'config', 30, 'unknown', 'acme')
  insert.run('C:\\Windows\\Temp\\Acme\\cache.tmp', 'cache.tmp', 25, 'unknown', 'acme')
  insert.run('C:\\Windows\\system.dll', 'system.dll', 999, 'system', null)
  return db
}

describe('breakdown service', () => {
  it('三段拆分恒等式成立，危险路径降级为 essential', () => {
    const db = createDb()
    buildBreakdowns(1, db)
    const breakdown = getBreakdown(1, 'acme', db)
    expect(breakdown).not.toBeNull()
    if (!breakdown) {
      return
    }
    expect(breakdown.totalBytes).toBe(405)
    expect(breakdown.bodyBytes).toBe(100)
    expect(breakdown.disposableCacheBytes).toBe(50)
    expect(breakdown.essentialCacheBytes).toBe(255)
    expect(breakdown.bodyBytes + breakdown.essentialCacheBytes + breakdown.disposableCacheBytes).toBe(
      breakdown.totalBytes
    )
    expect(breakdown.items.some((item) => item.path.includes('Windows\\Temp') && item.category === 'essentialCache')).toBe(
      true
    )
    const list = listBreakdowns(1, db)
    expect(list).toHaveLength(1)
    expect(list[0].items).toEqual([])
    db.close()
  })
})
