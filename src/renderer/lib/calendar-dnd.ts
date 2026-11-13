// Dragging a calendar row to another day: what the task's dates become. Pure, so the month grid's
// one gesture is tested without a pointer (docs/calendar-views-plan.md 3.1).

import {
  addLocalDays,
  dateOnlyDue,
  diffLocalDays,
  isDateOnly,
  isNoDueDate,
  localDateOf,
  startOfLocalDay,
  type LocalDate,
} from '../../shared/due-dates'
import { blockOf, moveBlockToDay, type BlockChanges } from '../../shared/time-blocks'

/** The same value on another day: a date-only one stays date-only, one with a clock keeps its time. */
export function moveValueToDay(value: string, day: LocalDate): string {
  if (isDateOnly(value)) return dateOnlyDue(day)
  const from = new Date(value)
  const target = startOfLocalDay(day)
  target.setHours(from.getHours(), from.getMinutes(), from.getSeconds(), from.getMilliseconds())
  return target.toISOString()
}

/**
 * What dropping a task on `day` writes. A block moves as a block (same wall-clock time and length,
 * and the due rule that goes with it); otherwise the due date moves, or the start date when that is
 * all the task has, keeping the span of a task that covers several days. Null when there is nothing
 * to move.
 */
export function moveToDay(
  task: { due_date?: string | null; start_date?: string | null; end_date?: string | null },
  day: LocalDate,
): BlockChanges | null {
  const block = blockOf(task)
  if (block) return moveBlockToDay(task, day)

  if (!isNoDueDate(task.due_date)) {
    return { due_date: moveValueToDay(task.due_date as string, day) }
  }
  if (!isNoDueDate(task.start_date)) {
    const changes: BlockChanges = { start_date: moveValueToDay(task.start_date as string, day) }
    if (!isNoDueDate(task.end_date)) {
      const span = Math.max(0, diffLocalDays(localDateOf(task.start_date), localDateOf(task.end_date)))
      changes.end_date = moveValueToDay(task.end_date as string, addLocalDays(day, span))
    }
    return changes
  }
  return null
}
