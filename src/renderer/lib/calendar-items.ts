// What a task looks like on a calendar: one row per day it occupies. Pure and derived — nothing is
// stored, and every date goes through `due-dates` so a daylight-saving week cannot shift a task to
// the day before (docs/calendar-views-plan.md section 2).

import {
  addLocalDays,
  diffLocalDays,
  isDateOnly,
  isNoDueDate,
  localDateOf,
  toLocalDate,
  type LocalDate,
} from '../../shared/due-dates'
import { blockOf, minutesOfDay } from '../../shared/time-blocks'

/** A task may span a year at most before the calendar stops drawing every day of it. */
export const MAX_SPAN_DAYS = 366

/** The fields the calendar reads. A `Task` has all of them, so one can be passed as is. */
export interface CalendarTaskFields {
  id: number
  done: boolean
  due_date?: string | null
  start_date?: string | null
  end_date?: string | null
  priority: number
  project_id: number
}

interface CalendarItemBase<T> {
  task: T
  /** The day this projection sits on. */
  day: LocalDate
  /** A task spanning several days: this day is not its first. */
  continues: boolean
  /** A task spanning several days: this day is not its last. */
  endsLater: boolean
}

export type CalendarItem<T extends CalendarTaskFields = CalendarTaskFields> =
  | (CalendarItemBase<T> & { kind: 'timed'; startMin: number; endMin: number })
  | (CalendarItemBase<T> & { kind: 'dated'; atMin?: number })

export interface CalendarItemOptions {
  /** Show tasks that are already done (Settings → Calendar; off by default). */
  showCompleted: boolean
}

/**
 * The days a task occupies. A block wins over the dates (it says when the work is set aside), then
 * a start date with an optional end date, then the due date. Null when the task belongs to no day.
 */
export function taskDays(task: CalendarTaskFields): {
  days: LocalDate[]
  continues: boolean[]
  endsLater: boolean[]
} | null {
  const block = blockOf(task)
  if (block) return { days: [block.day], continues: [false], endsLater: [false] }

  if (!isNoDueDate(task.start_date)) {
    const start = localDateOf(task.start_date)
    // An end before the start (or none) means the start date alone.
    const end = isNoDueDate(task.end_date) ? null : localDateOf(task.end_date)
    const span = end ? diffLocalDays(start, end) : 0
    if (span < 0) return { days: [start], continues: [false], endsLater: [false] }
    // A task dated years apart would put a row on every day in between; stop at a year.
    const length = Math.min(span, MAX_SPAN_DAYS - 1)
    return {
      days: Array.from({ length: length + 1 }, (_, index) => addLocalDays(start, index)),
      continues: Array.from({ length: length + 1 }, (_, index) => index > 0),
      endsLater: Array.from({ length: length + 1 }, (_, index) => index < length),
    }
  }

  if (!isNoDueDate(task.due_date)) {
    return { days: [localDateOf(task.due_date)], continues: [false], endsLater: [false] }
  }
  return null
}

/** The rows a task puts on the calendar: none when it is done and done tasks are hidden. */
export function calendarItemsFor<T extends CalendarTaskFields>(
  task: T,
  options: CalendarItemOptions,
): CalendarItem<T>[] {
  if (task.done && !options.showCompleted) return []
  const occupied = taskDays(task)
  if (!occupied) return []

  const block = blockOf(task)
  if (block) {
    return [
      {
        kind: 'timed',
        task,
        day: occupied.days[0],
        continues: false,
        endsLater: false,
        startMin: minutesOfDay(block.start),
        endMin: minutesOfDay(block.end),
      },
    ]
  }

  return occupied.days.map((day, index) => ({
    kind: 'dated' as const,
    task,
    day,
    continues: occupied.continues[index],
    endsLater: occupied.endsLater[index],
    // A day the task names a clock for says so: the week draws a due time as a marker, and the
    // month cell and the agenda should not lose it.
    atMin: clockOn(task.due_date, day) ?? clockOn(task.start_date, day),
  }))
}

/** The minute of a stamp that carries a clock and falls on `day`; undefined for a date-only one. */
function clockOn(stamp: string | null | undefined, day: LocalDate): number | undefined {
  if (isNoDueDate(stamp) || isDateOnly(stamp as string)) return undefined
  const at = new Date(stamp as string)
  return toLocalDate(at) === day ? minutesOfDay(at) : undefined
}

/**
 * The minute of the day a row starts at, whether the clock came from a time block or from a
 * clocked due/start date. Null for a row that names a day but no clock. Both kinds name a moment
 * in the same day, so the calendar has to compare them on that moment, not on how it was stored.
 */
export function calendarItemMinute(item: CalendarItem): number | null {
  return item.kind === 'timed' ? item.startMin : (item.atMin ?? null)
}

/**
 * The clock first: rows naming a moment go in the order that moment arrives, whatever stored it.
 * Rows with no clock follow under the agenda's "No time" heading. Within a tie the urgent comes
 * first, then done ones sink, then the id keeps the order stable between renders.
 */
export function compareCalendarItems(a: CalendarItem, b: CalendarItem): number {
  const aMin = calendarItemMinute(a)
  const bMin = calendarItemMinute(b)
  if (aMin !== bMin) {
    if (aMin === null) return 1
    if (bMin === null) return -1
    return aMin - bMin
  }
  if (a.task.done !== b.task.done) return a.task.done ? 1 : -1
  if (a.task.priority !== b.task.priority) return b.task.priority - a.task.priority
  return a.task.id - b.task.id
}

/** The calendar's rows by day, each day sorted. Days with nothing are absent, not empty. */
export function calendarIndex<T extends CalendarTaskFields>(
  tasks: readonly T[],
  options: CalendarItemOptions,
): Map<LocalDate, CalendarItem<T>[]> {
  const index = new Map<LocalDate, CalendarItem<T>[]>()
  for (const task of tasks) {
    for (const item of calendarItemsFor(task, options)) {
      const day = index.get(item.day)
      if (day) day.push(item)
      else index.set(item.day, [item])
    }
  }
  for (const day of index.values()) day.sort(compareCalendarItems)
  return index
}

/**
 * The week view's row of tasks without a time. The Plan screen's `dayTopRow` takes only a
 * date-only due date, so a task with a clocked start date and no end — not a block, and not a due
 * marker either — is drawn nowhere and would fall out of the week the month view shows. The
 * calendar reads the same days `taskDays` does and leaves the grid's own rows to the grid
 * (docs/calendar-views-plan.md 3.2).
 */
export function calendarTopRow<T extends CalendarTaskFields>(tasks: readonly T[], day: LocalDate): T[] {
  return tasks
    .filter((task) => {
      if (blockOf(task)) return false
      // A due date with a clock is a marker on the grid, so it must not be here as well.
      if (!task.done && clockedDueOn(task, day)) return false
      return taskDays(task)?.days.includes(day) ?? false
    })
    .sort(compareTopRow)
}

/** A due date that carries a clock and lands on `day`: the grid draws it as a marker. */
function clockedDueOn(task: CalendarTaskFields, day: LocalDate): boolean {
  const due = task.due_date
  return !isNoDueDate(due) && !isDateOnly(due as string) && localDateOf(due) === day
}

/** All-day first, then the clock the task carries, then the id so the order is stable. */
function compareTopRow(a: CalendarTaskFields, b: CalendarTaskFields): number {
  const diff = clockOf(a) - clockOf(b)
  return diff !== 0 ? diff : a.id - b.id
}

/**
 * The minute a task names, or 0 when it names a day and no clock. A date-only date is stored at UTC
 * midnight, which reads as morning in the east: it must not push an all-day task down the row.
 */
function clockOf(task: CalendarTaskFields): number {
  const minute = minuteIfClocked(task.due_date)
  return minute > 0 ? minute : minuteIfClocked(task.start_date)
}

function minuteIfClocked(stamp: string | null | undefined): number {
  return isNoDueDate(stamp) || isDateOnly(stamp as string) ? 0 : minutesOfDay(new Date(stamp as string))
}

/**
 * A task that covers more than one day and has no time block: Vikunja's start and end dates as a
 * stretch of days. The calendar draws it as one bar across the week instead of a chip on each day
 * (docs/calendar-views-plan.md 3.2).
 */
export function isSpanningTask(task: CalendarTaskFields): boolean {
  const days = taskDays(task)?.days
  return !blockOf(task) && (days?.length ?? 0) > 1
}

/** One bar in the week's all-day row, already cut to the days on screen. */
export interface CalendarBand<T extends CalendarTaskFields = CalendarTaskFields> {
  task: T
  /** The first and last day of the part that is on screen. */
  from: LocalDate
  to: LocalDate
  /** The row the bar sits on; two bars that overlap never share one. */
  lane: number
  /** The task began before the first day shown, so the bar is cut at the left edge. */
  continuesLeft: boolean
  /** It goes on after the last day shown: cut at the right edge. */
  endsLater: boolean
}

/**
 * The bars a week draws. Each spanning task becomes one bar, cut to the days in `days`, and packed
 * into the first lane where it fits — the way a calendar stacks overlapping all-day events.
 */
export function calendarBands<T extends CalendarTaskFields>(
  tasks: readonly T[],
  days: readonly LocalDate[],
): CalendarBand<T>[] {
  if (days.length === 0) return []
  const first = days[0]
  const last = days[days.length - 1]

  const placed: { task: T; start: number; end: number; opens: boolean; closes: boolean }[] = []
  for (const task of tasks) {
    if (!isSpanningTask(task)) continue
    const all = taskDays(task)?.days ?? []
    const day = all[0]
    const until = all[all.length - 1]
    // Off screen entirely: the task ends before the first day, or starts after the last.
    if (diffLocalDays(first, until) < 0 || diffLocalDays(first, day) > days.length - 1) continue
    placed.push({
      task,
      start: Math.max(0, diffLocalDays(first, day)),
      end: Math.min(days.length - 1, diffLocalDays(first, until)),
      opens: diffLocalDays(first, day) < 0,
      closes: diffLocalDays(first, until) > days.length - 1,
    })
  }

  // Longest first so a week-long bar takes the top lane and the short ones tuck underneath.
  placed.sort((a, b) => a.start - b.start || b.end - a.end || a.task.id - b.task.id)
  const laneEnds: number[] = []
  return placed.map(({ task, start, end, opens, closes }) => {
    let lane = laneEnds.findIndex((taken) => taken < start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[lane] = end
    }
    return { task, from: days[start], to: days[end], lane, continuesLeft: opens, endsLater: closes }
  })
}

/** The rows on one day, or an empty list; the caller never has to check for undefined. */
export function itemsOn<T extends CalendarTaskFields>(
  index: Map<LocalDate, CalendarItem<T>[]>,
  day: LocalDate,
): CalendarItem<T>[] {
  return index.get(day) ?? []
}

/** How many rows a day holds, for the month cell's "+N". */
export function countOn<T extends CalendarTaskFields>(
  index: Map<LocalDate, CalendarItem<T>[]>,
  day: LocalDate,
): number {
  return index.get(day)?.length ?? 0
}
