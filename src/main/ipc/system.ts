import { CHANNELS } from '../../shared/channels'
import { ok } from './result'
import { handle } from './registry'
import { isElevated, relaunchElevated } from '../win/elevation'
import { listDrives } from '../win/drives'

export function registerSystemIpc(): void {
  handle(CHANNELS.app.isElevated, async () => ok(await isElevated()))

  handle(CHANNELS.app.relaunchElevated, async () => {
    await relaunchElevated()
    return ok(undefined)
  })

  handle(CHANNELS.drives.list, async () => ok(await listDrives()))
}
