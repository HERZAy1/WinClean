import Database from 'better-sqlite3'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    startedAt INTEGER NOT NULL,
    finishedAt INTEGER,
    drives TEXT NOT NULL,
    totalUsedBytes INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scanId INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    parentPath TEXT,
    name TEXT NOT NULL,
    isDir INTEGER NOT NULL CHECK (isDir IN (0, 1)),
    sizeBytes INTEGER NOT NULL CHECK (sizeBytes >= 0),
    mtimeMs INTEGER NOT NULL,
    owner TEXT NOT NULL DEFAULT 'unknown' CHECK (owner IN ('system', 'user', 'unknown')),
    ownerReason TEXT,
    appId TEXT,
    UNIQUE (scanId, path)
  );
  CREATE INDEX IF NOT EXISTS idx_files_scan_parent ON files(scanId, parentPath);
  CREATE INDEX IF NOT EXISTS idx_files_scan_app ON files(scanId, appId);

  CREATE TABLE IF NOT EXISTS registry_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scanId INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    hive TEXT NOT NULL CHECK (hive IN ('HKLM', 'HKCU')),
    keyPath TEXT NOT NULL,
    valueName TEXT,
    valueData TEXT,
    appId TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_registry_entries_scan ON registry_entries(scanId);

  CREATE TABLE IF NOT EXISTS apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    publisher TEXT,
    version TEXT,
    installLocation TEXT,
    uninstallString TEXT,
    source TEXT NOT NULL CHECK (source IN ('registry', 'uwp', 'portable-guess')),
    registryKeys TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS ownerships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scanId INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    targetType TEXT NOT NULL CHECK (targetType IN ('path', 'registry')),
    targetId TEXT NOT NULL,
    appId TEXT,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    source TEXT NOT NULL CHECK (source IN ('rule', 'llm')),
    reason TEXT NOT NULL,
    UNIQUE (scanId, targetType, targetId)
  );

  CREATE TABLE IF NOT EXISTS llm_cache (
    key TEXT PRIMARY KEY,
    response TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS unowned_explain (
    path TEXT NOT NULL,
    scanId INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    json TEXT NOT NULL,
    PRIMARY KEY (scanId, path)
  );

  CREATE TABLE IF NOT EXISTS size_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scanId INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    appId TEXT NOT NULL,
    path TEXT NOT NULL,
    sizeBytes INTEGER NOT NULL CHECK (sizeBytes >= 0),
    category TEXT NOT NULL CHECK (category IN ('body', 'essentialCache', 'disposableCache')),
    riskLevel TEXT NOT NULL CHECK (riskLevel IN ('low', 'medium', 'high')),
    reason TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('rule', 'llm'))
  );
  CREATE INDEX IF NOT EXISTS idx_size_items_scan_app ON size_items(scanId, appId);

  CREATE TABLE IF NOT EXISTS scan_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scanId INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    code TEXT NOT NULL,
    message TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scan_errors_scan ON scan_errors(scanId);

  CREATE TABLE IF NOT EXISTS clean_plans (
    planId TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clean_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    planId TEXT NOT NULL,
    path TEXT NOT NULL,
    sizeBytes INTEGER NOT NULL CHECK (sizeBytes >= 0),
    result TEXT NOT NULL CHECK (result IN ('trashed', 'deleted', 'skipped')),
    detail TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_clean_log_ts ON clean_log(ts);
`

let connection: Database.Database | null = null

export function initDatabase(): Database.Database {
  if (connection) {
    return connection
  }

  const databasePath = path.join(app.getPath('userData'), 'app.db')
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })

  const database = new Database(databasePath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
  database.exec(SCHEMA_SQL)

  connection = database
  return connection
}

export function getDatabase(): Database.Database {
  if (!connection) {
    throw new Error('数据库尚未初始化')
  }

  return connection
}

export function closeDatabase(): void {
  connection?.close()
  connection = null
}
