import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_CHANNELS } from './channels'

function readContractChannels(): string[] {
  const contract = readFileSync(path.resolve(process.cwd(), 'docs/CONTRACT.md'), 'utf8')
  const sectionStart = contract.indexOf('## 5. IPC 通道')
  const sectionEnd = contract.indexOf('## 6. SQLite 表')

  if (sectionStart === -1 || sectionEnd === -1) {
    throw new Error('CONTRACT.md 中找不到 IPC 通道章节')
  }

  const section = contract.slice(sectionStart, sectionEnd)
  const channelPattern =
    /`((?:app|settings|llm|drives|scan|analysis|tree|unowned|apps|clean|event):[^`]+)`/g

  return [...new Set([...section.matchAll(channelPattern)].map((match) => match[1]))].sort()
}

describe('IPC 通道契约', () => {
  it('channels.ts 与 CONTRACT.md 的通道表完全一致', () => {
    const expectedChannels = readContractChannels()
    const actualChannels = [...new Set(ALL_CHANNELS)].sort()

    expect(actualChannels).toEqual(expectedChannels)
  })

  it('通道名不重复', () => {
    expect(new Set(ALL_CHANNELS).size).toBe(ALL_CHANNELS.length)
  })
})
