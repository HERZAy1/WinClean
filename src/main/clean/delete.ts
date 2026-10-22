import fs from 'node:fs'
import { shell } from 'electron'

export type RemovalMode = 'recycle' | 'permanent'
export type RemovalResult = 'trashed' | 'deleted'

export async function removePath(
  target: string,
  mode: RemovalMode
): Promise<RemovalResult> {
  if (mode === 'recycle') {
    await shell.trashItem(target)
    return 'trashed'
  }

  await fs.promises.rm(target, { recursive: true, force: false })
  return 'deleted'
}
