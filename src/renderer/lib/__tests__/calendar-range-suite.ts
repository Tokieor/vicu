// The month grid across a daylight-saving change: 42 days, no repeats, no gaps, whatever the
// offset does that week. Two zones run it (calendar-range-auckland/new-york.test.ts), the same way
// the cross-app semantics suite does.

import { describe, expect, it } from 'vitest'
import { addLocalDays, diffLocalDays, isoWeekday, type LocalDate } from '../../../shared/due-dates'
import { MONTH_GRID_DAYS, addMonths, calendarRange, monthGridDays, shiftAnchor } from '../calendar-range'

export interface CalendarZoneCase {
  zone: string
  /** A day in the week the clocks change, so the grid spans it. */
  inDstWeek: LocalDate
  /** A day in the week the clocks change back. */
  outOfDstWeek: LocalDate
}

export function runCalendarRangeZoneSuite({ zone, inDstWeek, outOfDstWeek }: CalendarZoneCase): void {
  const options = { agendaDays: 7, today: '2026-11-12' }

  describe(`calendar range in ${zone}`, () => {
    for (const day of [inDstWeek, outOfDstWeek]) {
      it(`keeps ${MONTH_GRID_DAYS} distinct days around ${day}`, () => {
        const grid = monthGridDays(day)
        expect(grid).toHaveLength(MONTH_GRID_DAYS)
        expect(new Set(grid).size).toBe(MONTH_GRID_DAYS)
        for (let index = 1; index < grid.length; index += 1) {
          expect(diffLocalDays(grid[index - 1], grid[index]), `${grid[index - 1]} -> ${grid[index]}`).toBe(1)
        }
      })

      it(`starts every grid on a Monday and ends on a Sunday around ${day}`, () => {
        const grid = monthGridDays(day)
        expect(isoWeekday(grid[0])).toBe(1)
        expect(isoWeekday(grid[grid.length - 1])).toBe(7)
        expect(grid).toContain(day)
      })

      it(`turns the month page across the change around ${day}`, () => {
        const next = shiftAnchor('month', day, 1, options)
        const back = shiftAnchor('month', next, -1, options)
        // 31st clamps to the shorter month, so coming back may differ from the start; the day must
        // still exist and stay in the same month as the original.
        expect(back).toBe(day)
        expect(diffLocalDays(day, next)).toBeGreaterThan(27)
      })

      it(`walks a week forward and back around ${day}`, () => {
        const next = shiftAnchor('week', day, 1, options)
        expect(diffLocalDays(day, next)).toBe(7)
        expect(shiftAnchor('week', next, -1, options)).toBe(day)
      })

      it(`numbers the agenda days consecutively from ${day}`, () => {
        const { days } = calendarRange('agenda', day, { agendaDays: 14, today: day })
        expect(days).toHaveLength(14)
        for (let index = 1; index < days.length; index += 1) {
          expect(days[index]).toBe(addLocalDays(days[0], index))
        }
      })
    }

    it('adds a month without drifting when the target month is shorter', () => {
      expect(addMonths('2026-03-29', 1)).toBe('2026-04-29')
      expect(addMonths('2026-10-25', 1)).toBe('2026-11-25')
      expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    })
  })
}
