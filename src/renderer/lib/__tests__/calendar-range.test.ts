// The calendar's ranges: the month grid, the week, the agenda, and where the arrows go.
// docs/calendar-views-plan.md section 4.1.

import { describe, expect, it } from 'vitest'
import { dateOnlyDue, diffLocalDays, isoWeekday } from '../../../shared/due-dates'
import { atClock } from '../../../shared/time-blocks'
import type { CalendarTaskFields } from '../calendar-items'
import {
  AGENDA_BACK_DAYS,
  MONTH_GRID_DAYS,
  addMonths,
  agendaStart,
  calendarRange,
  calendarTitle,
  daysInMonth,
  isSameMonth,
  monthLabel,
  pickMonth,
  shiftAnchor,
  spanLabel,
  startOfMonth,
} from '../calendar-range'

const OPTIONS = { agendaDays: 7, today: '2026-11-12' }

describe('startOfMonth / daysInMonth', () => {
  it('lands on the first day and counts the month', () => {
    expect(startOfMonth('2026-11-12')).toBe('2026-11-01')
    expect(daysInMonth('2026-11-12')).toBe(30)
    expect(daysInMonth('2026-02-10')).toBe(28)
    expect(daysInMonth('2024-02-10')).toBe(29)
  })
})

describe('monthGridDays', () => {
  it('is six whole weeks, Monday first, holding the anchor', () => {
    const grid = calendarRange('month', '2026-11-12', OPTIONS).days
    expect(grid).toHaveLength(MONTH_GRID_DAYS)
    expect(grid[0]).toBe('2026-10-26')
    expect(isoWeekday(grid[0])).toBe(1)
    expect(grid).toContain('2026-11-12')
    expect(grid[grid.length - 1]).toBe('2026-12-06')
  })

  it('runs consecutively with no repeats', () => {
    const grid = calendarRange('month', '2026-02-15', OPTIONS).days
    expect(new Set(grid).size).toBe(MONTH_GRID_DAYS)
    for (let index = 1; index < grid.length; index += 1) {
      expect(diffLocalDays(grid[index - 1], grid[index])).toBe(1)
    }
  })

  it('spans the turn of the year', () => {
    const grid = calendarRange('month', '2026-12-31', OPTIONS).days
    expect(grid[0]).toBe('2026-11-30')
    expect(grid).toContain('2027-01-01')
  })

  it('puts a month that starts on a Monday in the top-left cell', () => {
    // 2027-02-01 is a Monday.
    const grid = calendarRange('month', '2027-02-10', OPTIONS).days
    expect(grid[0]).toBe('2027-02-01')
  })
})

describe('week and agenda ranges', () => {
  it('shows Monday to Sunday around the anchor', () => {
    const range = calendarRange('week', '2026-11-12', OPTIONS)
    expect(range.start).toBe('2026-11-09')
    expect(range.end).toBe('2026-11-15')
    expect(range.days).toHaveLength(7)
  })

  it('opens the agenda on the anchor with its span', () => {
    const range = calendarRange('agenda', '2026-11-20', { agendaDays: 14, today: '2026-11-12' })
    expect(range.start).toBe('2026-11-20')
    expect(range.days).toHaveLength(14)
    expect(range.end).toBe('2026-12-03')
  })

  it('never opens the agenda more than 30 days back', () => {
    expect(agendaStart('2026-01-01', '2026-11-12')).toBe('2026-10-13')
    expect(diffLocalDays('2026-11-12', agendaStart('2026-01-01', '2026-11-12'))).toBe(-AGENDA_BACK_DAYS)
    expect(agendaStart('2026-11-20', '2026-11-12')).toBe('2026-11-20')
  })
})

describe('shiftAnchor', () => {
  it('turns a month, a week or an agenda span', () => {
    expect(shiftAnchor('month', '2026-11-12', 1, OPTIONS)).toBe('2026-12-12')
    expect(shiftAnchor('month', '2026-11-12', -1, OPTIONS)).toBe('2026-10-12')
    expect(shiftAnchor('week', '2026-11-12', 1, OPTIONS)).toBe('2026-11-19')
    expect(shiftAnchor('week', '2026-11-12', -1, OPTIONS)).toBe('2026-11-05')
    expect(shiftAnchor('agenda', '2026-11-12', 1, { agendaDays: 14, today: '2026-11-12' })).toBe('2026-11-26')
  })

  it('clamps the day when the month it lands in is shorter', () => {
    expect(shiftAnchor('month', '2026-01-31', 1, OPTIONS)).toBe('2026-02-28')
    expect(shiftAnchor('month', '2024-01-31', 1, OPTIONS)).toBe('2024-02-29')
    expect(shiftAnchor('month', '2026-03-31', -1, OPTIONS)).toBe('2026-02-28')
  })
})

describe('addMonths / pickMonth', () => {
  it('keeps the day of the month and clamps at the end', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-05-31', 4)).toBe('2026-09-30')
  })

  it('picks a month and keeps the anchor day where it exists', () => {
    expect(pickMonth('2026-11-12', 2027, 3)).toBe('2027-03-12')
    expect(pickMonth('2026-01-31', 2026, 2)).toBe('2026-02-28')
  })
})

describe('isSameMonth', () => {
  it('compares the month, not the day', () => {
    expect(isSameMonth('2026-11-01', '2026-11-30')).toBe(true)
    expect(isSameMonth('2026-11-30', '2026-12-01')).toBe(false)
  })
})

describe('titles', () => {
  it('writes the month, the week range and the agenda day', () => {
    expect(calendarTitle('month', '2026-11-12', 'en-US')).toBe('November 2026')
    // Intl writes its own spaces around a range, so only the parts are asserted.
    expect(calendarTitle('week', '2026-11-12', 'en-US')).toMatch(/Nov\s?9\s?.{1,3}\s?15$/)
    expect(calendarTitle('agenda', '2026-11-12', 'en-US')).toBe('November 12, 2026')
  })

  it('writes them in Chinese too', () => {
    expect(calendarTitle('month', '2026-11-12', 'zh-CN')).toBe('2026年11月')
    expect(monthLabel('2026-11-12', 'zh-CN')).toBe('2026年11月')
    expect(calendarTitle('week', '2026-11-12', 'zh-CN')).toMatch(/^11月9日.{1,3}15日$/)
  })

  it('adds the year to a week that straddles New Year', () => {
    expect(calendarTitle('week', '2026-12-30', 'en-US')).toMatch(/Dec\s?28\s?.{1,3}\s?Jan\s?3,?\s?2027/)
  })
})

describe('spanLabel', () => {
  const ZH = { locale: 'zh-CN', hour12: false }
  const EN = { locale: 'en-US', hour12: false }

  /** A task covering several days through its start and end dates. */
  function spanning(start: string, end: string, extra: Partial<CalendarTaskFields> = {}) {
    return { id: 1, done: false, priority: 0, project_id: 1, start_date: start, end_date: end, due_date: null, ...extra }
  }

  it('writes both ends of a date-only stretch', () => {
    expect(spanLabel(spanning(dateOnlyDue('2026-11-10'), dateOnlyDue('2026-11-13')), ZH)).toBe('11/10 – 11/13')
    expect(spanLabel(spanning(dateOnlyDue('2026-11-10'), dateOnlyDue('2026-11-13')), EN)).toBe('11/10 – 11/13')
  })

  it('adds the clock when the date carries one', () => {
    const task = spanning(atClock('2026-11-10', 9 * 60).toISOString(), atClock('2026-11-13', 18 * 60).toISOString())
    // 'numeric' hours, as every other time in the app is written: "9:00", not "09:00".
    expect(spanLabel(task, ZH)).toBe('11/10 9:00 – 11/13 18:00')
  })

  it('carries the year only when the stretch crosses one', () => {
    expect(spanLabel(spanning(dateOnlyDue('2026-12-30'), dateOnlyDue('2027-01-02')), ZH)).toBe('2026/12/30 – 2027/1/2')
  })

  it('says nothing about a single day or a time block', () => {
    expect(spanLabel(spanning(dateOnlyDue('2026-11-10'), dateOnlyDue('2026-11-10')), ZH)).toBeNull()
    expect(
      spanLabel(spanning(atClock('2026-11-10', 9 * 60).toISOString(), atClock('2026-11-10', 10 * 60).toISOString()), ZH),
    ).toBeNull()
  })
})
