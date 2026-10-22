import { describe, expect, it } from 'vitest'
import { segmentPercentages } from './StackedBar'

describe('segmentPercentages', () => {
  it('按三段总量计算百分比', () => {
    expect(segmentPercentages(50, 30, 20)).toEqual({ body: 50, essential: 30, disposable: 20 })
  })

  it('某段为 0 时仍保持总和 100', () => {
    const result = segmentPercentages(0, 80, 20)
    expect(result.body).toBe(0)
    expect(result.essential + result.disposable).toBe(100)
  })

  it('总量为 0 时全部为 0', () => {
    expect(segmentPercentages(0, 0, 0)).toEqual({ body: 0, essential: 0, disposable: 0 })
  })
})
