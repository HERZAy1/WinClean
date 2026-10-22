// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileNode, UnownedExplain } from '../../../../shared/types'
import { UnownedPanel } from './UnownedPanel'

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const items: FileNode[] = [
  {
    id: 1,
    scanId: 1,
    path: 'C:\\Temp\\a.bin',
    parentPath: 'C:\\Temp',
    name: 'a.bin',
    isDir: false,
    sizeBytes: 100,
    mtimeMs: 0,
    owner: 'unknown',
    appId: null
  },
  {
    id: 2,
    scanId: 1,
    path: 'C:\\Other\\b.bin',
    parentPath: 'C:\\Other',
    name: 'b.bin',
    isDir: false,
    sizeBytes: 50,
    mtimeMs: 0,
    owner: 'unknown',
    appId: null
  }
]

const explain: UnownedExplain = {
  path: 'C:\\Temp\\a.bin',
  kind: 'temp-or-cache',
  summary: '已分析',
  riskLevel: 'low',
  source: 'llm'
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      unowned: {
        list: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            items: [{ ...items[0], explain }, items[1]],
            total: 2
          }
        }),
        explain: vi.fn().mockResolvedValue({ ok: true, data: [explain] })
      }
    }
  })
})

afterEach(() => {
  Reflect.deleteProperty(window, 'api')
  vi.unstubAllGlobals()
})

describe('UnownedPanel', () => {
  it('筛选未归属类型并触发单条分析', async () => {
    render(
      <UnownedPanel
        scanId={1}
        virtualize={false}
      />
    )

    expect(await screen.findByText('C:\\Temp\\a.bin')).toBeInTheDocument()
    expect(screen.getByText('C:\\Other\\b.bin')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('类型'), { target: { value: 'temp-or-cache' } })
    await waitFor(() => {
      expect(screen.queryByText('C:\\Other\\b.bin')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '分析' }))
    await waitFor(() => {
      expect(window.api.unowned.explain).toHaveBeenCalledWith({ paths: ['C:\\Temp\\a.bin'] })
    })
  })
})
