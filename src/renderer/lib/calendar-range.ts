// The calendar's ranges: which days a view shows, and where its arrows go. Pure — the clock is
// passed in — so the month grid and the agenda can be tested without a renderer
// (docs/calendar-views-plan.md section 4.1).

import {
  addLocalDays,
  diffLocalDays,
  isDateOnly,
  isNoDueDate,
  startOfLocalDay,
  startOfWeek,
  toLocalDate,
  type LocalDate,
} from '../../shared/due-dates'
import type { CalendarViewKind } from '../../shared/config-types'
import { blockOf } from '../../shared/time-blocks'
import type { DateFormat } from '../../shared/date-display'
import { taskDays, type CalendarTaskFields } from './calendar-items'
import { getLocale, type Locale } from '../../shared/i18n'

/** A month is always six weeks long, so turning the page never changes the grid's height. */
export const MONTH_GRID_WEEKS = 6
export const MONTH_GRID_DAYS = MONTH_GRID_WEEKS * 7
/** How far back the agenda can be scrolled before it asks for a date instead. */
export const AGENDA_BACK_DAYS = 30

export interface CalendarRange {
  /** The first day on screen. */
  start: LocalDate
  /** The last day on screen, inclusive. */
  end: LocalDate
  /** Every day from `start` to `end`, in order. */
  days: LocalDate[]
}

export interface CalendarOptions {
  /** Days the agenda covers from its anchor (7, 14 or 30). */
  agendaDays: number
  /** Today, for the agenda's floor; passed in so tests are stable. */
  today: LocalDate
}

/** The first day of the month `localDate` is in. */
export function startOfMonth(localDate: LocalDate): LocalDate {
  const date = startOfLocalDay(localDate)
  return toLocalDate(new Date(date.getFullYear(), date.getMonth(), 1))
}

/** The number of days in the month `localDate` is in. */
export function daysInMonth(localDate: LocalDate): number {
  const date = startOfLocalDay(localDate)
  // Day 0 of the next month is the last day of this one.
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

/**
 * `localDate` plus `months`, keeping the day of the month where it exists: 31 January plus a month
 * is 28 (29 in a leap year) February, not 3 March.
 */
export function addMonths(localDate: LocalDate, months: number): LocalDate {
  const date = startOfLocalDay(localDate)
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const day = Math.min(date.getDate(), daysInMonth(toLocalDate(target)))
  return toLocalDate(new Date(target.getFullYear(), target.getMonth(), day))
}

/** True when both dates are in the same calendar month. */
export function isSameMonth(a: LocalDate, b: LocalDate): boolean {
  return startOfMonth(a) === startOfMonth(b)
}

/** The 42 days of the month grid: whole weeks, Monday first, the month's own days inside them. */
export function monthGridDays(anchor: LocalDate): LocalDate[] {
  const start = startOfWeek(startOfMonth(anchor))
  return Array.from({ length: MONTH_GRID_DAYS }, (_, index) => addLocalDays(start, index))
}

/** The days a view shows. The agenda starts at its anchor, or today when the anchor is older. */
export function calendarRange(
  view: CalendarViewKind,
  anchor: LocalDate,
  options: CalendarOptions,
): CalendarRange {
  const days =
    view === 'month'
      ? monthGridDays(anchor)
      : view === 'week'
        ? Array.from({ length: 7 }, (_, index) => addLocalDays(startOfWeek(anchor), index))
        : view === 'day'
          ? [anchor]
          : Array.from({ length: Math.max(1, options.agendaDays) }, (_, index) =>
              addLocalDays(agendaStart(anchor, options.today), index)
            )
  return { start: days[0], end: days[days.length - 1], days }
}

/** The agenda never opens on a day older than 30 days back, so an old anchor lands on the floor. */
export function agendaStart(anchor: LocalDate, today: LocalDate): LocalDate {
  const floor = addLocalDays(today, -AGENDA_BACK_DAYS)
  return diffLocalDays(floor, anchor) < 0 ? floor : anchor
}

/** Where the arrows go: a month, a week, one day, or an agenda's worth of days either way. */
export function shiftAnchor(
  view: CalendarViewKind,
  anchor: LocalDate,
  direction: 1 | -1,
  options: CalendarOptions,
): LocalDate {
  if (view === 'month') return addMonths(anchor, direction)
  if (view === 'week') return addLocalDays(anchor, 7 * direction)
  if (view === 'day') return addLocalDays(anchor, direction)
  return addLocalDays(anchor, Math.max(1, options.agendaDays) * direction)
}

/** Pick a month from the title's menu: the anchor keeps its day where that month has it. */
export function pickMonth(anchor: LocalDate, year: number, month: number): LocalDate {
  const first = toLocalDate(new Date(year, month - 1, 1))
  const day = Math.min(startOfLocalDay(anchor).getDate(), daysInMonth(first))
  return toLocalDate(new Date(year, month - 1, day))
}

/** The title a view shows: "November 2026", "3–9 Nov 2026", "Fri 13 Nov 2026", "12 Nov 2026". */
export function calendarTitle(
  view: CalendarViewKind,
  anchor: LocalDate,
  locale: string,
): string {
  const date = startOfLocalDay(anchor)
  if (view === 'month') {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date)
  }
  if (view === 'week') {
    // The shared parts are written once: "Nov 9 – 15", "11月9日 – 15日". The year only shows when
    // the week straddles New Year, because the month and agenda views carry it anyway.
    const start = startOfLocalDay(startOfWeek(anchor))
    const end = startOfLocalDay(addLocalDays(startOfWeek(anchor), 6))
    const monthDay = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
    const dayOnly = new Intl.DateTimeFormat(locale, { day: 'numeric' })
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
    const endText = sameMonth ? dayOnly.format(end) : monthDay.format(end)
    const year = start.getFullYear() === end.getFullYear() ? '' : ` ${end.getFullYear()}`
    return `${monthDay.format(start)} – ${endText}${year}`
  }
  if (view === 'day') {
    return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  }
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

/** The month label an agenda pins while it scrolls: "November 2026". */
export function monthLabel(localDate: LocalDate, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(startOfLocalDay(localDate))
}

/**
 * The locale dates are written in, taken from the app's language so a Chinese session reads
 * "2026年11月" without a second table of month names.
 */
export const CALENDAR_LOCALE_TAGS: Record<Locale, string> = { en: 'en-US', zh: 'zh-CN' }

export function localeFor(locale: Locale = getLocale()): string {
  return CALENDAR_LOCALE_TAGS[locale] ?? CALENDAR_LOCALE_TAGS.en
}

/**
 * The stretch a task covers, written for a chip: "11/10 – 11/13", with the clock on each end when
 * the date carries one ("11/10 09:00 – 11/13 18:00"). Null when the task sits on a single day or on
 * a time block, which the grid already draws as itself.
 */
export function spanLabel(task: CalendarTaskFields, fmt: DateFormat): string | null {
  const days = taskDays(task)?.days
  if (!days || days.length < 2 || blockOf(task)) return null

  const from = days[0]
  const to = days[days.length - 1]
  // A year is only worth its two digits when the stretch straddles one.
  const withYear = from.slice(0, 4) !== to.slice(0, 4)
  const dayFormat = new Intl.DateTimeFormat(fmt.locale, {
    ...(withYear ? { year: 'numeric' as const } : {}),
    month: 'numeric',
    day: 'numeric',
  })
  const clockFormat = new Intl.DateTimeFormat(fmt.locale, { hour: 'numeric', minute: '2-digit', hour12: fmt.hour12 })

  const end = (day: LocalDate, stamp: string | null | undefined) => {
    const text = dayFormat.format(startOfLocalDay(day))
    // A date-only stamp is UTC midnight: it says nothing about the clock and must not show one.
    if (isNoDueDate(stamp) || isDateOnly(stamp as string)) return text
    return `${text} ${clockFormat.format(new Date(stamp as string))}`
  }

  return `${end(from, task.start_date)} – ${end(to, task.end_date)}`
}
