import { LlmError } from './errors'

interface QueueEntry<T> {
  task: (signal: AbortSignal) => Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

export class LlmQueue {
  private readonly queue: QueueEntry<unknown>[] = []
  private active = 0
  private controller = new AbortController()

  constructor(private readonly concurrency = 2) {}

  run<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.controller.signal.aborted) {
      return Promise.reject(new LlmError('CANCELLED'))
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        task,
        resolve: resolve as (value: unknown) => void,
        reject
      })
      this.pump()
    })
  }

  cancelAll(): void {
    this.controller.abort()
    const pending = this.queue.splice(0)
    for (const entry of pending) {
      entry.reject(new LlmError('CANCELLED'))
    }
  }

  reset(): void {
    this.cancelAll()
    this.controller = new AbortController()
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const entry = this.queue.shift()
      if (!entry) {
        return
      }

      this.active += 1
      void Promise.resolve()
        .then(() => entry.task(this.controller.signal))
        .then(entry.resolve, entry.reject)
        .finally(() => {
          this.active -= 1
          this.pump()
        })
    }
  }
}
