import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyRuleOwnership } from './apply'
import type { OwnershipApp } from './engine'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      publisher TEXT,
      version TEXT,
      installLocation TEXT,
      uninstallString TEXT,
      source TEXT NOT NULL,
      registryKeys TEXT NOT NULL DEFAULT '[]',
      hidden INTEGER NOT NULL DEFAULT 0,
      exePaths TEXT NOT NULL DEFAULT '[]',
      publisherKeys TEXT NOT NULL DEFAULT '[]',
      servicePaths TEXT NOT NULL DEFAULT '[]',
      uwpPackage TEXT
    );
    CREATE TABLE files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scanId INTEGER NOT NULL,
      path TEXT NOT NULL,
      owner TEXT NOT NULL DEFAULT 'unknown',
      appId TEXT,
      isDir INTEGER NOT NULL,
      sizeBytes INTEGER NOT NULL
    );
    CREATE TABLE ownerships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scanId INTEGER NOT NULL,
      targetType TEXT NOT NULL,
      targetId TEXT NOT NULL,
      appId TEXT,
      confidence REAL NOT NULL,
      source TEXT NOT NULL,
      reason TEXT NOT NULL,
      UNIQUE (scanId, targetType, targetId)
    );
    CREATE TABLE registry_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scanId INTEGER NOT NULL,
      hive TEXT NOT NULL,
      keyPath TEXT NOT NULL,
      valueName TEXT,
      valueData TEXT,
      appId TEXT
    );
  `)
  return db
}

const apps: OwnershipApp[] = [
  {
    id: 'adobe',
    name: 'Adobe',
    publisher: 'Adobe Inc.',
    installLocation: 'C:\\Program Files\\Adobe',
    exePaths: [],
    registryKeys: ['HKLM:SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Adobe'],
    publisherKeys: ['Adobe'],
    source: 'registry',
    hidden: false
  },
  {
    id: 'acrobat',
    name: 'Adobe Acrobat',
    publisher: 'Adobe Inc.',
    installLocation: 'C:\\Program Files\\Adobe Acrobat',
    exePaths: [],
    registryKeys: [],
    publisherKeys: ['Adobe'],
    source: 'registry',
    hidden: false
  },
  {
    id: 'chrome',
    name: 'Google Chrome',
    publisher: 'Google LLC',
    installLocation: 'C:\\Program Files\\Google\\Chrome',
    exePaths: [],
    registryKeys: [],
    publisherKeys: ['Google'],
    source: 'registry',
    hidden: false
  }
]

describe('applyRuleOwnership', () => {
  it('写入安装目录归属、目录继承、注册表归属与歧义', () => {
    const db = createDb()
    const insertFile = db.prepare(
      'INSERT INTO files (scanId, path, owner, appId, isDir, sizeBytes) VALUES (1, ?, ?, NULL, ?, ?)'
    )
    insertFile.run('C:\\Program Files\\Adobe', 'unknown', 1, 1000)
    insertFile.run('C:\\Program Files\\Adobe\\a.dll', 'unknown', 0, 100)
    insertFile.run('C:\\Users\\Alice\\AppData\\Local\\Adobe', 'unknown', 1, 500)
    insertFile.run('C:\\Users\\Alice\\AppData\\Local\\Adobe\\cache', 'unknown', 0, 50)
    insertFile.run('C:\\Windows\\sys.dll', 'system', 0, 999)
    insertFile.run('C:\\Random', 'unknown', 1, 20)
    insertFile.run('C:\\Random\\file.txt', 'unknown', 0, 20)

    const insertRegistry = db.prepare(
      'INSERT INTO registry_entries (scanId, hive, keyPath, valueName, valueData, appId) VALUES (1, ?, ?, NULL, NULL, NULL)'
    )
    insertRegistry.run(
      'HKLM',
      'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Adobe'
    )
    insertRegistry.run('HKLM', 'SOFTWARE\\Google\\Update')

    const stats = applyRuleOwnership(1, apps, db)

    const files = db
      .prepare('SELECT path, appId FROM files ORDER BY path')
      .all() as { path: string; appId: string | null }[]
    expect(files.find((file) => file.path === 'C:\\Program Files\\Adobe')?.appId).toBe('adobe')
    expect(files.find((file) => file.path.endsWith('a.dll'))?.appId).toBe('adobe')
    expect(files.find((file) => file.path.endsWith('cache'))?.appId).toBeNull()
    expect(files.find((file) => file.path.endsWith('sys.dll'))?.appId).toBeNull()

    const registry = db
      .prepare('SELECT keyPath, appId FROM registry_entries ORDER BY id')
      .all() as { keyPath: string; appId: string | null }[]
    expect(registry[0].appId).toBe('adobe')
    expect(registry[1].appId).toBe('chrome')

    const ambiguous = db
      .prepare('SELECT appId, reason FROM ownerships WHERE appId IS NULL')
      .all() as { appId: null; reason: string }[]
    expect(ambiguous).toHaveLength(1)
    expect(ambiguous[0].reason).toContain('歧义')

    expect(stats.totalBytes).toBe(170)
    expect(stats.assignedBytes).toBe(100)
    expect(stats.assignedRatio).toBeCloseTo(100 / 170)
    expect(stats.unownedTop[0].path).toBe('C:\\Users\\Alice\\AppData\\Local\\Adobe')
    db.close()
  })
})
