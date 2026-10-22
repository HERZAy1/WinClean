import { shell } from 'electron'
import { CHANNELS } from '../../shared/channels'
import { fail, ok } from './result'
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

  handle(CHANNELS.shell.showItemInFolder, (_event, payload) => {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      typeof (payload as { path?: unknown }).path !== 'string'
    ) {
      return fail('INTERNAL', '路径参数无效')
    }
    shell.showItemInFolder((payload as { path: string }).path)
    return ok(undefined)
  })
}
