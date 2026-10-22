import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  getAllTreeRoots,
  getTreeNodeChildren,
  getUnownedList
} from './service'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE scans (id INTEGER PRIMARY KEY, startedAt INTEGER, drives TEXT, totalUsedBytes INTEGER);
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
    CREATE TABLE registry_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scanId INTEGER NOT NULL, hive TEXT NOT NULL,
      keyPath TEXT NOT NULL, valueName TEXT, valueData TEXT, appId TEXT
    );
    CREATE TABLE ownerships (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scanId INTEGER NOT NULL, targetType TEXT NOT NULL,
      targetId TEXT NOT NULL, appId TEXT, confidence REAL NOT NULL, source TEXT NOT NULL,
      reason TEXT NOT NULL, UNIQUE (scanId, targetType, targetId)
    );
    CREATE TABLE unowned_explain (path TEXT NOT NULL, scanId INTEGER NOT NULL, json TEXT NOT NULL, PRIMARY KEY (scanId, path));
  `)
  db.prepare('INSERT INTO scans (id, startedAt, drives, totalUsedBytes) VALUES (1, 1, ?, 1000)').run(
    '["C"]'
  )
  db.prepare(
    "INSERT INTO apps (id, name, publisher, source, registryKeys, hidden, exePaths, publisherKeys, servicePaths, installLocation) VALUES ('acme', 'Acme App', 'Acme', 'registry', '[]', 0, '[]', '[]', '[]', 'C:\\Program Files\\Acme')"
  ).run()
  const insertFile = db.prepare(
    'INSERT INTO files (scanId, path, parentPath, name, isDir, sizeBytes, owner, appId) VALUES (1, ?, ?, ?, ?, ?, ?, ?)'
  )
  insertFile.run('C:\\Program Files\\Acme', 'C:\\Program Files', 'Acme', 1, 1000, 'unknown', 'acme')
  insertFile.run(
    'C:\\Program Files\\Acme\\app.exe',
    'C:\\Program Files\\Acme',
    'app.exe',
    0,
    600,
    'unknown',
    'acme'
  )
  insertFile.run(
    'C:\\Users\\Alice\\AppData\\Local\\Acme',
    'C:\\Users\\Alice\\AppData\\Local',
    'Acme',
    1,
    500,
    'unknown',
    'acme'
  )
  insertFile.run(
    'C:\\Users\\Alice\\AppData\\Local\\Acme\\data.bin',
    'C:\\Users\\Alice\\AppData\\Local\\Acme',
    'data.bin',
    0,
    500,
    'unknown',
    'acme'
  )
  insertFile.run(
    'C:\\Users\\Alice\\AppData\\Local\\Temp\\Acme',
    'C:\\Users\\Alice\\AppData\\Local\\Temp',
    'Acme',
    1,
    200,
    'unknown',
    'acme'
  )
  insertFile.run(
    'C:\\Users\\Alice\\AppData\\Local\\Temp\\Acme\\cache.tmp',
    'C:\\Users\\Alice\\AppData\\Local\\Temp\\Acme',
    'cache.tmp',
    0,
    200,
    'unknown',
    'acme'
  )
  insertFile.run('C:\\Other\\Acme', 'C:\\Other', 'Acme', 1, 100, 'unknown', 'acme')
  insertFile.run('C:\\Other\\Acme\\other.log', 'C:\\Other\\Acme', 'other.log', 0, 100, 'unknown', 'acme')

  db.prepare(
    "INSERT INTO registry_entries (scanId, hive, keyPath, valueName, valueData, appId) VALUES (1, 'HKLM', 'SOFTWARE\\Acme', 'DisplayName', 'Acme App', 'acme')"
  ).run()

  db.prepare(
    "INSERT INTO files (scanId, path, parentPath, name, isDir, sizeBytes, owner, appId) VALUES (1, 'C:\\Unowned\\a.bin', 'C:\\Unowned', 'a.bin', 0, 300, 'unknown', NULL)"
  ).run()
  db.prepare(
    "INSERT INTO unowned_explain (path, scanId, json) VALUES ('C:\\Unowned\\a.bin', 1, ?)"
  ).run(
    JSON.stringify({
      path: 'C:\\Unowned\\a.bin',
      kind: 'other',
      summary: '测试',
      riskLevel: 'low',
      source: 'llm'
    })
  )

  const many = db.prepare(
    "INSERT INTO files (scanId, path, parentPath, name, isDir, sizeBytes, owner, appId) VALUES (1, ?, 'C:\\Many', ?, 0, 1, 'user', NULL)"
  )
  db.transaction(() => {
    for (let index = 0; index < 101; index += 1) {
      many.run(`C:\\Many\\f${index}.bin`, `f${index}.bin`)
    }
  })()
  return db
}

describe('tree service', () => {
  it('返回 App 与虚拟根，并按大小排序', () => {
    const db = createDb()
    const roots = getAllTreeRoots(1, db)
    expect(roots.some((root) => root.nodeId === 'app:acme')).toBe(true)
    expect(roots.some((root) => root.nodeId === 'virtual:system')).toBe(true)
    expect(roots.some((root) => root.nodeId === 'virtual:unowned')).toBe(true)
    db.close()
  })

  it('App 节点返回安装/用户数据/缓存/注册表分组', () => {
    const db = createDb()
    const groups = getTreeNodeChildren(1, 'app:acme', db)
    expect(groups.map((group) => group.label)).toEqual(
      expect.arrayContaining(['安装目录', '用户数据(AppData)', '缓存/临时', '其他', '注册表'])
    )
    db.close()
  })

  it('目录子节点最多 100 个并返回 +N 分页节点', () => {
    const db = createDb()
    const first = getTreeNodeChildren(1, 'dir:C:\\Many', db)
    expect(first.filter((node) => node.kind === 'file')).toHaveLength(100)
    const more = first.find((node) => node.nodeId.startsWith('more:'))
    expect(more?.label).toContain('1')
    const second = getTreeNodeChildren(1, more?.nodeId ?? '', db)
    expect(second).toHaveLength(1)
    db.close()
  })

  it('未归属列表分页并附带 explain', () => {
    const db = createDb()
    const page = getUnownedList(1, 0, 10, db)
    expect(page.total).toBe(1)
    expect(page.items[0].explain?.summary).toBe('测试')
    db.close()
  })
})
