import { getDatabase } from '../db'
import { collectRegistrySnapshot } from './collect'
import type { ParsedRegistrySnapshot } from './parse'

export async function collectAndSaveRegistry(scanId: number): Promise<number> {
  const snapshot = await collectRegistrySnapshot()
  saveRegistrySnapshot(scanId, snapshot)
  return snapshot.apps.length
}

export function saveRegistrySnapshot(
  scanId: number,
  snapshot: ParsedRegistrySnapshot,
  db = getDatabase()
): void {
  const insertApp = db.prepare(`
    INSERT OR REPLACE INTO apps
      (id, name, publisher, version, installLocation, uninstallString, source, registryKeys,
       hidden, exePaths, publisherKeys, servicePaths, uwpPackage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertRegistry = db.prepare(`
    INSERT INTO registry_entries (scanId, hive, keyPath, valueName, valueData, appId)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  db.transaction(() => {
    db.prepare('DELETE FROM apps').run()
    db.prepare('DELETE FROM registry_entries WHERE scanId = ?').run(scanId)

    for (const app of snapshot.apps) {
      insertApp.run(
        app.id,
        app.name,
        app.publisher ?? null,
        app.version ?? null,
        app.installLocation ?? null,
        app.uninstallString ?? null,
        app.source,
        JSON.stringify(app.registryKeys),
        app.hidden ? 1 : 0,
        JSON.stringify(app.exePaths),
        JSON.stringify(app.publisherKeys),
        JSON.stringify(app.servicePaths),
        app.uwpPackage ?? null
      )
    }

    for (const entry of snapshot.registryEntries) {
      insertRegistry.run(
        scanId,
        entry.hive,
        entry.keyPath,
        entry.valueName ?? null,
        entry.valueData ?? null,
        entry.appId
      )
    }
  })()
}
