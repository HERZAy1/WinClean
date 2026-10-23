// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AnalysisPanel } from './AnalysisPanel'
import { useAnalysisStore } from '../../stores/useAnalysis'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  useAnalysisStore.setState({ ...useAnalysisStore.getInitialState() })
})

describe('AnalysisPanel', () => {
  it('未开始时只显示“尚未开始”，不再出现“分析完成”', () => {
    render(<AnalysisPanel />)

    expect(screen.getAllByText('尚未开始').length).toBeGreaterThan(0)
    expect(screen.queryByText('已完成')).not.toBeInTheDocument()
    expect(screen.queryByText('AI 分析完成')).not.toBeInTheDocument()
    expect(screen.getByText('Tokens：0/0')).toBeInTheDocument()
  })

  it('部分失败时展示成功/失败批次数与最近错误', () => {
    useAnalysisStore.setState({
      status: 'partial',
      active: false,
      batchTotal: 16,
      completedBatches: 3,
      failedBatches: 13,
      tokensIn: 7711,
      tokensOut: 5462,
      lastError: '模型输出被截断（达到 max_tokens 上限）',
      progress: {
        stage: 'llm-analysis',
        scannedBytes: 0,
        totalUsedBytes: 0,
        percent: 1,
        filesScanned: 0,
        message: 'AI 分析完成：成功 3/16，失败 13 批',
        batchTotal: 16,
        completedBatches: 3,
        failedBatches: 13
      },
      thinking: []
    })

    render(<AnalysisPanel />)

    expect(screen.getAllByText('部分失败').length).toBeGreaterThan(0)
    expect(screen.getByText(/共 16 · 成功 3 · 失败 13/)).toBeInTheDocument()
    expect(screen.getByText(/最近错误：模型输出被截断/)).toBeInTheDocument()
    expect(screen.getByText('Tokens：7711/5462')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
  })
})
