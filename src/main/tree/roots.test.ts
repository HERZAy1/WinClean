import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { getTreeRoots } from './roots'

describe('getTreeRoots', () => {
  it('返回系统/用户/未归属三个虚拟根，只汇总文件字节', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scanId INTEGER NOT NULL,
        path TEXT NOT NULL,
        owner TEXT NOT NULL,
        isDir INTEGER NOT NULL,
        sizeBytes INTEGER NOT NULL
      );
    `)
    const insert = db.prepare(
      'INSERT INTO files (scanId, path, owner, isDir, sizeBytes) VALUES (1, ?, ?, ?, ?)'
    )
    insert.run('C:\\Windows\\a', 'system', 0, 100)
    insert.run('C:\\Windows', 'system', 1, 1000)
    insert.run('C:\\Users\\Alice\\a', 'user', 0, 50)
    insert.run('C:\\Users\\Alice', 'user', 1, 50)
    insert.run('C:\\Temp\\a', 'unknown', 0, 25)

    const roots = getTreeRoots(1, db)

    expect(roots.map((root) => root.kind)).toEqual(['system', 'user', 'unowned'])
    expect(roots[0]).toMatchObject({ nodeId: 'virtual:system', totalBytes: 100, childCount: 2 })
    expect(roots[1]).toMatchObject({ nodeId: 'virtual:user', totalBytes: 50, childCount: 2 })
    expect(roots[2]).toMatchObject({ nodeId: 'virtual:unowned', totalBytes: 25, childCount: 1 })
    db.close()
  })
})
