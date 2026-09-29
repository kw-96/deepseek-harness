const DAY_MS = 86_400_000

function dateOnly(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(date)
}

/** 返回北京时间当天日期。 */
export function todayInShanghai(now = new Date()): string {
  return dateOnly(now)
}

/** 返回上一自然周周一至周日。 */
export function previousWeekRange(now = new Date()): { startDate: string; endDate: string } {
  const [year, month, day] = todayInShanghai(now).split('-').map(Number)
  const localNoonUtc = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 12))
  const weekday = localNoonUtc.getUTCDay() || 7
  const thisMonday = new Date(localNoonUtc.getTime() - (weekday - 1) * DAY_MS)
  const lastMonday = new Date(thisMonday.getTime() - 7 * DAY_MS)
  const lastSunday = new Date(thisMonday.getTime() - DAY_MS)
  return { startDate: dateOnly(lastMonday), endDate: dateOnly(lastSunday) }
}
