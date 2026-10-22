import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { parseRegistrySnapshot } from './parse'
import { saveRegistrySnapshot } from './service'

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
      source TEXT NOT NULL CHECK (source IN ('registry', 'uwp', 'portable-guess')),
      registryKeys TEXT NOT NULL DEFAULT '[]',
      hidden INTEGER NOT NULL DEFAULT 0,
      exePaths TEXT NOT NULL DEFAULT '[]',
      publisherKeys TEXT NOT NULL DEFAULT '[]',
      servicePaths TEXT NOT NULL DEFAULT '[]',
      uwpPackage TEXT
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

describe('saveRegistrySnapshot', () => {
  it('写入 registry 与 uwp 两类应用并保留 registry 条目', () => {
    const db = createDb()
    const snapshot = parseRegistrySnapshot({
      uninstall: [
        {
          Hive: 'HKLM',
          KeyPath: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\App',
          DisplayName: 'Acme App',
          Publisher: 'Acme',
          DisplayVersion: '1.0',
          InstallLocation: 'C:\\Program Files\\Acme'
        }
      ],
      uwp: [
        {
          Name: 'Microsoft.Test',
          PackageFullName: 'Microsoft.Test_1.0.0_x64__test',
          InstallLocation: 'C:\\Program Files\\WindowsApps\\Test',
          Publisher: 'CN=Microsoft'
        }
      ]
    })

    saveRegistrySnapshot(1, snapshot, db)

    const rows = db.prepare('SELECT source, COUNT(*) AS n FROM apps GROUP BY source').all()
    expect(rows).toEqual([
      { source: 'registry', n: 1 },
      { source: 'uwp', n: 1 }
    ])
    expect(db.prepare('SELECT COUNT(*) AS n FROM registry_entries').get()).toEqual({ n: 1 })
    db.close()
  })
})
