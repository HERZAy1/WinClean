import { beforeEach, describe, expect, it } from 'vitest'
import type { ProgressEvent } from '../../../shared/types'
import { useAnalysisStore } from './useAnalysis'

function progress(patch: Partial<ProgressEvent>): ProgressEvent {
  return {
    stage: 'llm-analysis',
    scannedBytes: 0,
    totalUsedBytes: 0,
    percent: 0.5,
    filesScanned: 0,
    message: 'AI 分析 3/16',
    ...patch
  }
}

beforeEach(() => {
  useAnalysisStore.setState({ ...useAnalysisStore.getInitialState() })
})

describe('useAnalysisStore', () => {
  it('运行中的进度事件把状态置为 running', () => {
    useAnalysisStore.getState().handleProgress(progress({ percent: 0.2 }))

    const state = useAnalysisStore.getState()
    expect(state.status).toBe('running')
    expect(state.active).toBe(true)
  })

  it('全部成功时结束状态为 done', () => {
    useAnalysisStore.getState().handleProgress(
      progress({
        message: 'AI 分析完成：16/16',
        percent: 1,
        completedBatches: 16,
        failedBatches: 0,
        batchTotal: 16
      })
    )

    const state = useAnalysisStore.getState()
    expect(state.status).toBe('done')
    expect(state.active).toBe(false)
    expect(state.completedBatches).toBe(16)
  })

  it('存在失败批次时结束状态为 partial 并保留错误摘要', () => {
    useAnalysisStore.getState().handleProgress(
      progress({
        message: 'AI 分析完成：成功 3/16，失败 13 批',
        percent: 1,
        completedBatches: 3,
        failedBatches: 13,
        batchTotal: 16,
        lastError: '模型输出被截断（达到 max_tokens 上限）'
      })
    )

    const state = useAnalysisStore.getState()
    expect(state.status).toBe('partial')
    expect(state.failedBatches).toBe(13)
    expect(state.lastError).toContain('截断')
  })

  it('取消与分析错误分别映射为 cancelled 与 failed', () => {
    useAnalysisStore.getState().handleProgress(progress({ stage: 'cancelled', message: 'AI 分析已取消' }))
    expect(useAnalysisStore.getState().status).toBe('cancelled')

    useAnalysisStore.getState().handleProgress(progress({ stage: 'error', message: '无法连接模型服务' }))
    expect(useAnalysisStore.getState().status).toBe('failed')
  })

  it('思考事件累计 token', () => {
    const handle = useAnalysisStore.getState().handleThinking
    handle({ batchIndex: 1, batchTotal: 2, status: 'done', focus: 'a', tokensIn: 10, tokensOut: 5 })
    handle({ batchIndex: 2, batchTotal: 2, status: 'done', focus: 'b', tokensIn: 3, tokensOut: 2 })

    const state = useAnalysisStore.getState()
    expect(state.tokensIn).toBe(13)
    expect(state.tokensOut).toBe(7)
  })
})
