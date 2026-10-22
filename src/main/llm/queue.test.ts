import { describe, expect, it } from 'vitest'
import { LlmError } from './errors'
import { LlmQueue } from './queue'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('LlmQueue', () => {
  it('限制并发数并保持任务结果', async () => {
    const queue = new LlmQueue(2)
    let active = 0
    let maxActive = 0

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        queue.run(async () => {
          active += 1
          maxActive = Math.max(maxActive, active)
          await sleep(10)
          active -= 1
          return index
        })
      )
    )

    expect(results).toEqual([0, 1, 2, 3, 4])
    expect(maxActive).toBe(2)
  })

  it('取消全部会中止在途任务并拒绝排队任务', async () => {
    const queue = new LlmQueue(1)

    const activeTask = queue.run(
      (signal) =>
        new Promise<number>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new LlmError('CANCELLED')), {
            once: true
          })
        })
    )
    const queuedTask = queue.run(async () => 2)

    await sleep(5)
    queue.cancelAll()

    await expect(activeTask).rejects.toMatchObject({ code: 'CANCELLED' })
    await expect(queuedTask).rejects.toMatchObject({ code: 'CANCELLED' })
  })
})
