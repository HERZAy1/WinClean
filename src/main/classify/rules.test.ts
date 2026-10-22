import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyClassification } from './apply'
import { buildRules, classifyPath } from './rules'

const rules = buildRules(['C', 'D'], 'Alice', 'C:\\Users\\Alice\\AppData\\Local')

const cases: [string, 'system' | 'user' | 'unknown', string?][] = [
  ['C:\\Windows', 'system'],
  ['C:\\Windows\\System32', 'system'],
  ['c:\\windows\\system32', 'system'],
  ['D:\\Windows\\Temp', 'system'],
  ['C:\\$Recycle.Bin', 'system'],
  ['C:\\System Volume Information', 'system'],
  ['C:\\Recovery', 'system'],
  ['C:\\Boot', 'system'],
  ['C:\\EFI', 'system'],
  ['C:\\ProgramData\\Microsoft\\Windows\\Start Menu', 'system'],
  ['C:\\pagefile.sys', 'system'],
  ['C:\\hiberfil.sys', 'system'],
  ['C:\\swapfile.sys', 'system'],
  ['C:\\Windows.old', 'system', 'system-windows-old-C'],
  ['C:\\Windows.old\\Windows', 'system', 'system-windows-old-C'],
  ['C:\\Users\\Alice\\AppData\\Local\\Microsoft\\Windows\\Explorer', 'system'],
  ['C:\\Users\\Alice\\AppData\\Local\\Microsoft\\Windows\\Defender', 'system'],
  ['C:\\Users\\Alice\\AppData\\Local\\Microsoft\\Windows Defender', 'unknown'],
  ['C:\\Users\\Alice\\Documents', 'user'],
  ['C:\\Users\\Alice\\Desktop', 'user'],
  ['C:\\Users\\Alice\\Pictures', 'user'],
  ['C:\\Users\\Alice\\Videos', 'user'],
  ['C:\\Users\\Alice\\Music', 'user'],
  ['C:\\Users\\Alice\\Downloads', 'user'],
  ['C:\\Users\\Alice\\OneDrive\\file.txt', 'user'],
  ['C:\\Users\\Alice\\notes.txt', 'user'],
  ['C:\\Users\\Public', 'user'],
  ['C:\\Users\\Public\\Downloads', 'user'],
  ['D:\\Users\\Alice\\Documents', 'user'],
  ['C:\\WindowsApps', 'unknown'],
  ['C:\\Windows.old2', 'unknown'],
  ['C:\\Program Files\\App', 'unknown'],
  ['C:\\Program Files (x86)\\App', 'unknown'],
  ['C:\\ProgramData\\Vendor', 'unknown'],
  ['C:\\Users\\Alice\\AppData', 'unknown'],
  ['C:\\Users\\Alice\\AppData\\Local\\Vendor', 'unknown'],
  ['C:\\Users\\Alice\\AppData\\Roaming\\Vendor', 'unknown'],
  ['C:\\ProgramData\\Microsoft\\WindowsApps', 'unknown'],
  ['C:\\pagefile.sys.bak', 'unknown'],
  ['C:\\', 'unknown'],
  ['C:\\Users', 'system'],
  ['C:\\Windows\\System32\\..\\notepad.exe', 'system'],
  ['C:\\Windows\\System32\\..\\..\\WindowsApps', 'unknown'],
  ['\\\\?\\C:\\Windows\\System32', 'system']
]

describe('classifyPath', () => {
  it.each(cases)('%s -> %s', (path, owner, ruleId) => {
    const result = classifyPath(path, rules)
    expect(result.owner).toBe(owner)
    if (ruleId) {
      expect(result.ruleId).toBe(ruleId)
    }
  })

  it('最长前缀优先于较短的用户目录规则', () => {
    expect(
      classifyPath('C:\\Users\\Alice\\AppData\\Local\\Microsoft\\Windows\\Temp', rules).owner
    ).toBe('system')
    expect(classifyPath('C:\\Users\\Alice\\AppData\\Local\\Vendor', rules).owner).toBe('unknown')
  })
})

describe('applyClassification', () => {
  it('按最长前缀写入 owner 与 ownerReason', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scanId INTEGER NOT NULL,
        path TEXT NOT NULL,
        owner TEXT NOT NULL DEFAULT 'unknown',
        ownerReason TEXT,
        isDir INTEGER NOT NULL DEFAULT 0,
        sizeBytes INTEGER NOT NULL DEFAULT 0
      );
    `)
    const insert = db.prepare(
      'INSERT INTO files (scanId, path, owner, ownerReason, isDir, sizeBytes) VALUES (1, ?, ?, NULL, 0, 1)'
    )
    insert.run('C:\\Windows\\System32\\kernel32.dll', 'unknown')
    insert.run('C:\\Users\\Alice\\Documents\\a.txt', 'unknown')
    insert.run('C:\\Users\\Alice\\AppData\\Local\\Vendor\\a.txt', 'unknown')
    insert.run('C:\\WindowsApps\\a.exe', 'unknown')

    applyClassification(1, rules, db)

    const rows = db
      .prepare('SELECT path, owner, ownerReason FROM files ORDER BY path')
      .all() as { path: string; owner: string; ownerReason: string }[]
    expect(rows.find((row) => row.path.includes('kernel32'))).toMatchObject({
      owner: 'system',
      ownerReason: 'system-windows-C'
    })
    expect(rows.find((row) => row.path.includes('Documents'))).toMatchObject({
      owner: 'user',
      ownerReason: 'user-documents-C'
    })
    expect(rows.find((row) => row.path.includes('Vendor'))).toMatchObject({
      owner: 'unknown',
      ownerReason: 'unknown-appdata-C'
    })
    expect(rows.find((row) => row.path.includes('WindowsApps'))).toMatchObject({
      owner: 'unknown',
      ownerReason: 'default-unknown'
    })
    db.close()
  })
})
