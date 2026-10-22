// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CleanPlan, SizeBreakdown } from '../../../shared/types'
import { AppsPage } from './AppsPage'

const MB = 1024 * 1024
const apps: SizeBreakdown[] = [
  {
    appId: 'a1',
    appName: 'Alpha App',
    publisher: 'Alpha',
    totalBytes: 400 * MB,
    bodyBytes: 100 * MB,
    essentialCacheBytes: 100 * MB,
    disposableCacheBytes: 200 * MB,
    items: []
  },
  {
    appId: 'a2',
    appName: 'Beta App',
    publisher: 'Beta',
    totalBytes: 100 * MB,
    bodyBytes: 50 * MB,
    essentialCacheBytes: 50 * MB,
    disposableCacheBytes: 0,
    items: []
  }
]

const detail: SizeBreakdown = {
  ...apps[0],
  items: [
    {
      path: 'C:\\Users\\Alice\\AppData\\Local\\Alpha\\Cache',
      sizeBytes: 200 * MB,
      category: 'disposableCache',
      riskLevel: 'low',
      reason: '缓存',
      source: 'rule'
    }
  ]
}

const plan: CleanPlan = {
  planId: 'plan-1',
  createdAt: Date.now(),
  items: detail.items,
  estimatedFreeBytes: 200 * MB,
  mode: 'recycle'
}

beforeEach(() => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      scan: { latest: vi.fn().mockResolvedValue({ ok: true, data: { scanId: 1 } }) },
      apps: {
        list: vi.fn().mockResolvedValue({ ok: true, data: apps }),
        getBreakdown: vi.fn().mockResolvedValue({ ok: true, data: detail })
      },
      clean: {
        preview: vi.fn().mockResolvedValue({ ok: true, data: plan }),
        execute: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            planId: 'plan-1',
            freedBytes: 200 * MB,
            succeeded: ['C:\\Users\\Alice\\AppData\\Local\\Alpha\\Cache'],
            skipped: []
          }
        }),
        log: vi.fn().mockResolvedValue({ ok: true, data: [] })
      }
    }
  })
})

afterEach(() => {
  Reflect.deleteProperty(window, 'api')
})

describe('AppsPage', () => {
  it('排序、过滤、展开明细并打开预览对话框', async () => {
    const { container } = render(<AppsPage />)

    await screen.findByText('Alpha App')
    expect(screen.getByText('Beta App')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('排序'), { target: { value: 'name' } })
    await waitFor(() => {
      const names = [...container.querySelectorAll('.apps-row__name strong')].map(
        (node) => node.textContent
      )
      expect(names).toEqual(['Alpha App', 'Beta App'])
    })

    fireEvent.change(screen.getByLabelText('搜索软件名称或发布者'), {
      target: { value: 'Beta' }
    })
    await waitFor(() => expect(screen.queryByText('Alpha App')).not.toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('搜索软件名称或发布者'), { target: { value: '' } })
    fireEvent.click(
      screen.getByRole('switch', { name: '仅显示可清理量 > 100MB' })
    )
    await waitFor(() => expect(screen.queryByText('Beta App')).not.toBeInTheDocument())
    fireEvent.click(
      screen.getByRole('switch', { name: '仅显示可清理量 > 100MB' })
    )
    await waitFor(() => expect(screen.getByText('Beta App')).toBeInTheDocument())

    fireEvent.click(screen.getAllByRole('button', { name: '展开' })[0])
    await waitFor(() => {
      expect(
        screen.getByText('C:\\Users\\Alice\\AppData\\Local\\Alpha\\Cache')
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: '清理非必要缓存' })[0])
    const dialog = await screen.findByRole('dialog', { name: '清理预览' })
    expect(dialog).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '执行清理' }))
    await waitFor(() => {
      expect(window.api.clean.execute).toHaveBeenCalledWith({
        planId: 'plan-1',
        selectedPaths: ['C:\\Users\\Alice\\AppData\\Local\\Alpha\\Cache']
      })
    })
    expect(await screen.findByRole('dialog', { name: '清理结果' })).toBeInTheDocument()
  })
})
