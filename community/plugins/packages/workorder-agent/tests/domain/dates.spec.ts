import { describe, expect, it } from 'vitest'
import { previousWeekRange, todayInShanghai } from '../../src/domain/dates.js'

describe('北京时间日期边界', () => {
  it('计算北京时间日期', () => {
    expect(todayInShanghai(new Date('2026-08-13T16:30:00Z'))).toBe('2026-08-14')
  })

  it('计算上一自然周周一至周日', () => {
    expect(previousWeekRange(new Date('2026-08-12T01:00:00Z'))).toEqual({
      startDate: '2026-08-03',
      endDate: '2026-08-09',
    })
  })
})
