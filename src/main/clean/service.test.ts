import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsService } from '../settings/service'
import type { SecretStore } from '../settings/secret-store'
import { CleanService, validateSelectedPaths } from './service'

const tempDirs: string[] = []
const secretStore: SecretStore = {
  isAvailable: () => true,
  encrypt: (value) => Buffer.from(value).toString('base64'),
  decrypt: (value) => Buffer.from(value, 'base64').toString('utf8')
}

function makeSettings(): SettingsService {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winclean-clean-settings-'))
  tempDirs.push(dir)
  return new SettingsService(dir, secretStore)
}

function makeDb(installLocation: string): Database.Database {
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
    CREATE TABLE clean_plans (planId TEXT PRIMARY KEY, json TEXT NOT NULL, createdAt INTEGER NOT NULL);
    CREATE TABLE clean_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, planId TEXT NOT NULL,
      path TEXT NOT NULL, sizeBytes INTEGER NOT NULL, result TEXT NOT NULL, detail TEXT
    );
  `)
  db.prepare(
    "INSERT INTO apps (id, name, publisher, source, registryKeys, hidden, exePaths, publisherKeys, servicePaths, installLocation) VALUES ('acme', 'Acme', 'Acme', 'registry', '[]', 0, '[]', '[]', '[]', ?)"
  ).run(installLocation)
  const insertItem = db.prepare(
    'INSERT INTO size_items (scanId, appId, path, sizeBytes, category, riskLevel, reason, source) VALUES (1, ?, ?, ?, ?, ?, ?, ?)'
  )
  insertItem.run('acme', path.join(installLocation, 'Cache'), 100, 'disposableCache', 'low', '缓存', 'rule')
  insertItem.run('acme', path.join(installLocation, 'Data'), 50, 'essentialCache', 'high', '数据', 'rule')
  insertItem.run('acme', 'C:\\Windows\\Temp\\bad', 25, 'disposableCache', 'low', '缓存', 'rule')
  insertItem.run('acme', path.join(installLocation, 'app.exe'), 200, 'body', 'low', '本体', 'rule')

  const insertFile = db.prepare(
    'INSERT INTO files (scanId, path, parentPath, name, isDir, sizeBytes, owner, appId) VALUES (1, ?, ?, ?, ?, ?, ?, ?)'
  )
  insertFile.run(path.join(installLocation, 'Cache'), installLocation, 'Cache', 1, 100, 'unknown', 'acme')
  insertFile.run(path.join(installLocation, 'Cache', 'a.bin'), path.join(installLocation, 'Cache'), 'a.bin', 0, 100, 'unknown', 'acme')
  insertFile.run(path.join(installLocation, 'Data'), installLocation, 'Data', 1, 50, 'unknown', 'acme')
  insertFile.run(path.join(installLocation, 'app.exe'), installLocation, 'app.exe', 0, 200, 'unknown', 'acme')
  return db
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('CleanService', () => {
  it('预览只包含可清理项，硬拦截项计入 blockedCount', () => {
    const install = fs.mkdtempSync(path.join(os.tmpdir(), 'winclean-clean-install-'))
    tempDirs.push(install)
    const db = makeDb(install)
    const service = new CleanService(makeSettings(), { db })

    const result = service.preview(1, ['acme'], false)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.data.items).toHaveLength(1)
    expect(result.data.items[0].category).toBe('disposableCache')
    expect(result.data.blockedCount).toBe(1)
    expect(result.data.estimatedFreeBytes).toBe(100)

    const withEssential = service.preview(1, ['acme'], true)
    expect(withEssential.ok).toBe(true)
    if (withEssential.ok) {
      expect(withEssential.data.items).toHaveLength(2)
      expect(withEssential.data.estimatedFreeBytes).toBe(150)
    }
    db.close()
  })

  it('拒绝不在计划内的伪造路径', () => {
    const install = fs.mkdtempSync(path.join(os.tmpdir(), 'winclean-clean-install-'))
    tempDirs.push(install)
    const db = makeDb(install)
    const service = new CleanService(makeSettings(), { db })
    const result = service.preview(1, ['acme'], false)
    if (!result.ok) {
      throw new Error('preview failed')
    }
    expect(validateSelectedPaths(result.data, ['C:\\Windows\\System32\\cmd.exe'])).toBe(false)
    db.close()
  })

  it('执行成功写入日志并删除文件表记录', async () => {
    const install = fs.mkdtempSync(path.join(os.tmpdir(), 'winclean-clean-install-'))
    tempDirs.push(install)
    fs.mkdirSync(path.join(install, 'Cache'), { recursive: true })
    fs.writeFileSync(path.join(install, 'Cache', 'a.bin'), 'x')
    const db = makeDb(install)
    const remove = vi.fn().mockResolvedValue('trashed')
    const service = new CleanService(makeSettings(), { db, remove })
    const preview = service.preview(1, ['acme'], false)
    if (!preview.ok) {
      throw new Error('preview failed')
    }
    const target = preview.data.items[0].path

    const result = await service.execute(preview.data.planId, [target])

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.freedBytes).toBe(100)
      expect(result.data.succeeded).toEqual([target])
      expect(result.data.skipped).toHaveLength(0)
    }
    expect(remove).toHaveBeenCalledWith(target, 'recycle')
    expect(db.prepare('SELECT COUNT(*) AS n FROM clean_log').get()).toEqual({ n: 1 })
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM files WHERE path LIKE ?').get(`${target}%`)
    ).toEqual({ n: 0 })
    db.close()
  })

  it('执行拒绝伪造 selectedPaths', async () => {
    const install = fs.mkdtempSync(path.join(os.tmpdir(), 'winclean-clean-install-'))
    tempDirs.push(install)
    const db = makeDb(install)
    const service = new CleanService(makeSettings(), { db, remove: vi.fn() })
    const preview = service.preview(1, ['acme'], false)
    if (!preview.ok) {
      throw new Error('preview failed')
    }
    const result = await service.execute(preview.data.planId, ['C:\\Windows\\System32\\cmd.exe'])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('PATH_BLOCKED')
    }
    db.close()
  })
})
