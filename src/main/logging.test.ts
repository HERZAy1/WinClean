import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initLogger, logInfo, redactLog } from './logging'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('logging', () => {
  it('脱敏 API Key、Bearer 与用户名', () => {
    const username = process.env['USERNAME'] ?? os.userInfo().username
    const redacted = redactLog(
      `key=sk-1234567890 Bearer abcdefghijk C:\\Users\\${username}\\file`
    )
    expect(redacted).not.toContain('sk-1234567890')
    expect(redacted).not.toContain(username)
    expect(redacted).toContain('[REDACTED_API_KEY]')
  })

  it('写入 app.log 并按日期归档', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winclean-log-'))
    dirs.push(dir)
    fs.writeFileSync(path.join(dir, 'app.log'), 'old\n')
    fs.writeFileSync(path.join(dir, '.date'), '2020-01-01')
    initLogger(dir)
    logInfo('hello')

    const archived = fs
      .readdirSync(dir)
      .filter((name) => name.startsWith('app-') && name.endsWith('.log'))
    expect(archived).toHaveLength(1)
    expect(fs.readFileSync(path.join(dir, 'app.log'), 'utf8')).toContain('hello')
  })
})
