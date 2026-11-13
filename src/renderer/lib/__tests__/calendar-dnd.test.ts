// Dropping a task on another day in the month grid: which dates move, and how they keep their shape.

import { describe, expect, it } from 'vitest'
import { dateOnlyDue, isDateOnly, localDateOf } from '../../../shared/due-dates'
import { atClock } from '../../../shared/time-blocks'
import { moveToDay, moveValueToDay } from '../calendar-dnd'

describe('moveValueToDay', () => {
  it('keeps a date-only value date-only on the new day', () => {
    const moved = moveValueToDay(dateOnlyDue('2026-11-12'), '2026-11-20')
    expect(isDateOnly(moved)).toBe(true)
    expect(localDateOf(moved)).toBe('2026-11-20')
  })

  it('keeps the clock of a value that has one', () => {
    const at9 = atClock('2026-11-12', 9 * 60 + 30).toISOString()
    const moved = moveValueToDay(at9, '2026-11-20')
    const date = new Date(moved)
    expect(localDateOf(moved)).toBe('2026-11-20')
    expect(date.getHours()).toBe(9)
    expect(date.getMinutes()).toBe(30)
  })
})

describe('moveToDay', () => {
  it('moves a block to the same wall-clock time on the new day', () => {
    const task = {
      due_date: dateOnlyDue('2026-11-12'),
      start_date: atClock('2026-11-12', 14 * 60).toISOString(),
      end_date: atClock('2026-11-12', 15 * 60 + 30).toISOString(),
    }
    const changes = moveToDay(task, '2026-11-20')
    expect(changes).not.toBeNull()
    expect(localDateOf(changes?.start_date ?? '')).toBe('2026-11-20')
    expect(localDateOf(changes?.end_date ?? '')).toBe('2026-11-20')
    const start = new Date(changes?.start_date as string)
    const end = new Date(changes?.end_date as string)
    expect(start.getHours()).toBe(14)
    expect((end.getTime() - start.getTime()) / 60_000).toBe(90)
    expect(localDateOf(changes?.due_date ?? '')).toBe('2026-11-20')
  })

  it('moves a due date that carries no time', () => {
    const changes = moveToDay({ due_date: dateOnlyDue('2026-11-12') }, '2026-11-20')
    expect(isDateOnly(changes?.due_date as string)).toBe(true)
    expect(localDateOf(changes?.due_date ?? '')).toBe('2026-11-20')
  })

  it('keeps the time of a due date that has one', () => {
    const due = atClock('2026-11-12', 18 * 60).toISOString()
    const changes = moveToDay({ due_date: due }, '2026-11-20')
    const moved = new Date(changes?.due_date as string)
    expect(localDateOf(changes?.due_date ?? '')).toBe('2026-11-20')
    expect(moved.getHours()).toBe(18)
  })

  it('moves a start date when that is all the task has', () => {
    const changes = moveToDay({ start_date: dateOnlyDue('2026-11-10') }, '2026-11-20')
    expect(changes?.start_date).toBeDefined()
    expect(localDateOf(changes?.start_date ?? '')).toBe('2026-11-20')
    expect(changes?.due_date).toBeUndefined()
  })

  it('keeps the span of a task covering several days', () => {
    const changes = moveToDay(
      { start_date: dateOnlyDue('2026-11-10'), end_date: dateOnlyDue('2026-11-13') },
      '2026-11-20',
    )
    expect(localDateOf(changes?.start_date ?? '')).toBe('2026-11-20')
    expect(localDateOf(changes?.end_date ?? '')).toBe('2026-11-23')
  })

  it('writes nothing for a task with no date at all', () => {
    expect(moveToDay({}, '2026-11-20')).toBeNull()
    expect(moveToDay({ due_date: '', start_date: null, end_date: null }, '2026-11-20')).toBeNull()
  })
})
