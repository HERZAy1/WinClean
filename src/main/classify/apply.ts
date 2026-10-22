import { getDatabase } from '../db'
import { sortRules, type ClassificationRule } from './rules'

export function applyClassification(
  scanId: number,
  rules: ClassificationRule[],
  db = getDatabase()
): number {
  const sorted = sortRules(rules)
  const reset = db.prepare(
    "UPDATE files SET owner = 'unknown', ownerReason = 'default-unknown' WHERE scanId = ?"
  )
  const exact = db.prepare(`
    UPDATE files SET owner = ?, ownerReason = ?
    WHERE scanId = ? AND ownerReason = 'default-unknown'
      AND path = ? COLLATE NOCASE
  `)
  const prefix = db.prepare(`
    UPDATE files SET owner = ?, ownerReason = ?
    WHERE scanId = ? AND ownerReason = 'default-unknown'
      AND (
        path = ? COLLATE NOCASE
        OR (
          length(path) > ?
          AND substr(path, 1, ?) = ? COLLATE NOCASE
          AND substr(path, ? + 1, 1) = ?
        )
      )
  `)
  const regexRows = db.prepare(
    "SELECT id, path FROM files WHERE scanId = ? AND ownerReason = 'default-unknown'"
  )
  const updateById = db.prepare('UPDATE files SET owner = ?, ownerReason = ? WHERE id = ?')
  const separator = '\\'

  return db.transaction(() => {
    let changes = reset.run(scanId).changes

    for (const rule of sorted) {
      if (rule.kind === 'regex') {
        let pattern: RegExp
        try {
          pattern = new RegExp(rule.pattern, 'i')
        } catch {
          continue
        }
        for (const row of regexRows.all(scanId) as { id: number; path: string }[]) {
          if (pattern.test(row.path)) {
            changes += updateById.run(rule.owner, rule.id, row.id).changes
          }
        }
        continue
      }

      if (rule.kind === 'exact') {
        changes += exact.run(rule.owner, rule.id, scanId, rule.pattern).changes
        continue
      }

      changes += prefix.run(
        rule.owner,
        rule.id,
        scanId,
        rule.pattern,
        rule.pattern.length,
        rule.pattern.length,
        rule.pattern,
        rule.pattern.length,
        separator
      ).changes
    }

    return changes
  })()
}
