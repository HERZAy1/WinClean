import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { COMMAND_CHANNELS, type CommandChannel } from '../../shared/channels'
import type { Result } from '../../shared/types'
import { errorMessage, fail } from './result'

export type IpcHandler = (event: IpcMainInvokeEvent, payload: unknown) => unknown

const handledChannels = new Set<CommandChannel>()

export function handle(channel: CommandChannel, handler: IpcHandler): void {
  if (handledChannels.has(channel)) {
    throw new Error(`IPC handler already registered: ${channel}`)
  }

  handledChannels.add(channel)
  ipcMain.handle(channel, async (event, payload: unknown) => {
    try {
      return await handler(event, payload)
    } catch (error) {
      return fail('INTERNAL', '操作失败', errorMessage(error))
    }
  })
}

export function registerFallbackHandlers(): void {
  for (const channel of COMMAND_CHANNELS) {
    if (handledChannels.has(channel)) {
      continue
    }

    ipcMain.handle(
      channel,
      (): Result<never> =>
        fail('INTERNAL', '未实现')
    )
  }
}
