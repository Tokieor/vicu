// What a task looks like on a calendar: one row per day it occupies. Pure and derived — nothing is
// stored, and every date goes through `due-dates` so a daylight-saving week cannot shift a task to
// the day before (docs/calendar-views-plan.md section 2).

import { addLocalDays, diffLocalDays, isDateOnly, isNoDueDate, localDateOf, type LocalDate } from '../../shared/due-dates'
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
  | (CalendarItemBase<T> & { kind: 'dated' })

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
  }))
}

/**
 * Timed rows first, by the clock; then the date-only ones. Within a group the urgent comes first,
 * then done ones sink, then the id keeps the order stable between renders.
 */
export function compareCalendarItems(a: CalendarItem, b: CalendarItem): number {
  if (a.kind !== b.kind) return a.kind === 'timed' ? -1 : 1
  if (a.kind === 'timed' && b.kind === 'timed' && a.startMin !== b.startMin) return a.startMin - b.startMin
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
