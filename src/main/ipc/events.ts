import { BrowserWindow } from 'electron'
import type { EventChannel } from '../../shared/channels'
import type { EventPayloadMap } from '../../preload/api'

export function sendToRenderers<K extends EventChannel>(
  channel: K,
  payload: EventPayloadMap[K]
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload)
  }
}
