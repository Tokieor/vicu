// What a task looks like on a calendar: which days it occupies and in what order the rows sort.
// docs/calendar-views-plan.md section 2.

import { describe, expect, it } from 'vitest'
import { addLocalDays, dateOnlyDue, localDateOf } from '../../../shared/due-dates'
import { atClock } from '../../../shared/time-blocks'
import {
  MAX_SPAN_DAYS,
  calendarBands,
  calendarIndex,
  calendarTopRow,
  calendarItemsFor,
  compareCalendarItems,
  countOn,
  itemsOn,
  taskDays,
  type CalendarItem,
  type CalendarTaskFields,
} from '../calendar-items'

const SHOWN = { showCompleted: false }
const WITH_DONE = { showCompleted: true }

let nextId = 1
function task(fields: Partial<CalendarTaskFields> = {}): CalendarTaskFields {
  return {
    id: nextId++,
    done: false,
    priority: 0,
    project_id: 1,
    due_date: null,
    start_date: null,
    end_date: null,
    ...fields,
  }
}

/** A task due on a date, the way every date-only setter writes it. */
function dueOn(localDate: string, fields: Partial<CalendarTaskFields> = {}): CalendarTaskFields {
  return task({ due_date: dateOnlyDue(localDate), ...fields })
}

/** A task with a time block from `startMin` to `endMin` on a day. */
function blockOn(localDate: string, startMin: number, endMin: number, fields: Partial<CalendarTaskFields> = {}): CalendarTaskFields {
  return task({
    start_date: atClock(localDate, startMin).toISOString(),
    end_date: atClock(localDate, endMin).toISOString(),
    due_date: dateOnlyDue(localDate),
    ...fields,
  })
}

/** A task spanning several days through its start and end dates. */
function spanning(from: string, to: string, fields: Partial<CalendarTaskFields> = {}): CalendarTaskFields {
  return task({
    start_date: dateOnlyDue(from),
    end_date: dateOnlyDue(to),
    ...fields,
  })
}

describe('taskDays', () => {
  it('reads the due date when there is nothing else', () => {
    const days = taskDays(dueOn('2026-11-12'))
    expect(days?.days).toEqual(['2026-11-12'])
  })

  it('lets a block win over the due date', () => {
    const days = taskDays(blockOn('2026-11-12', 9 * 60, 10 * 60))
    expect(days?.days).toEqual(['2026-11-12'])
  })

  it('spreads a spanning task over every day, first and last flagged', () => {
    const days = taskDays(spanning('2026-11-10', '2026-11-13'))
    expect(days?.days).toEqual(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'])
    expect(days?.continues).toEqual([false, true, true, true])
    expect(days?.endsLater).toEqual([true, true, true, false])
  })

  it('takes a start date alone as one day', () => {
    expect(taskDays(spanning('2026-11-10', '2026-11-10'))?.days).toEqual(['2026-11-10'])
  })

  it('ignores an end date before the start', () => {
    expect(taskDays(spanning('2026-11-10', '2026-11-02'))?.days).toEqual(['2026-11-10'])
  })

  it('has no day for a task without any date', () => {
    expect(taskDays(task())).toBeNull()
    expect(calendarItemsFor(task(), SHOWN)).toEqual([])
  })

  it('stops a years-long span at a year of rows', () => {
    const days = taskDays(spanning('2020-01-01', '2030-01-01'))
    expect(days?.days).toHaveLength(MAX_SPAN_DAYS)
  })
})

describe('calendarItemsFor', () => {
  it('makes a timed row with the clock minutes of its block', () => {
    const items = calendarItemsFor(blockOn('2026-11-12', 14 * 60 + 30, 15 * 60), SHOWN)
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('timed')
    if (items[0].kind === 'timed') {
      expect(items[0].startMin).toBe(870)
      expect(items[0].endMin).toBe(900)
      expect(items[0].day).toBe('2026-11-12')
    }
  })

  it('sits a timed row on the block day, not on a later due date', () => {
    const items = calendarItemsFor(
      task({
        due_date: dateOnlyDue('2026-11-20'),
        start_date: atClock('2026-11-12', 9 * 60).toISOString(),
        end_date: atClock('2026-11-12', 10 * 60).toISOString(),
      }),
      SHOWN,
    )
    expect(items.map((item) => item.day)).toEqual(['2026-11-12'])
  })

  it('makes one dated row per day of a span', () => {
    const items = calendarItemsFor(spanning('2026-11-10', '2026-11-12'), SHOWN)
    expect(items.map((item) => item.day)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12'])
    expect(items.map((item) => item.continues)).toEqual([false, true, true])
    expect(items.map((item) => item.endsLater)).toEqual([true, true, false])
    expect(items.every((item) => item.kind === 'dated')).toBe(true)
  })

  it('hides done tasks unless asked', () => {
    const done = dueOn('2026-11-12', { done: true })
    expect(calendarItemsFor(done, SHOWN)).toEqual([])
    expect(calendarItemsFor(done, WITH_DONE)).toHaveLength(1)
  })

  it('keeps one row per day when a span crosses a month', () => {
    const items = calendarItemsFor(spanning('2026-10-30', '2026-11-02'), SHOWN)
    expect(items.map((item) => item.day)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    for (const item of items) expect(localDateOf(dateOnlyDue(item.day))).toBe(item.day)
  })
})

describe('compareCalendarItems', () => {
  const item = (fields: Partial<CalendarTaskFields>, kind: 'timed' | 'dated' = 'dated', startMin = 0): CalendarItem =>
    calendarItemsFor(kind === 'timed' ? blockOn('2026-11-12', startMin, startMin + 30, fields) : dueOn('2026-11-12', fields), WITH_DONE)[0]

  it('puts timed rows before date-only ones', () => {
    const timed = item({}, 'timed', 600)
    const dated = item({})
    expect(compareCalendarItems(timed, dated)).toBeLessThan(0)
    expect(compareCalendarItems(dated, timed)).toBeGreaterThan(0)
  })

  it('orders timed rows by the clock', () => {
    const early = item({}, 'timed', 540)
    const late = item({}, 'timed', 900)
    expect(compareCalendarItems(early, late)).toBeLessThan(0)
  })

  it('puts the urgent first and the done last', () => {
    const urgent = item({ priority: 4 })
    const plain = item({ priority: 1 })
    const done = item({ priority: 4, done: true })
    expect(compareCalendarItems(urgent, plain)).toBeLessThan(0)
    expect(compareCalendarItems(plain, done)).toBeLessThan(0)
  })

  it('falls back to the id so the order never flickers', () => {
    const first = item({ id: 3, priority: 2 })
    const second = item({ id: 9, priority: 2 })
    expect(compareCalendarItems(first, second)).toBeLessThan(0)
  })
})

describe('calendarIndex', () => {
  it('groups rows by day and sorts each day', () => {
    const tasks = [
      dueOn('2026-11-12', { id: 1, priority: 1 }),
      blockOn('2026-11-12', 15 * 60, 16 * 60, { id: 2 }),
      dueOn('2026-11-13', { id: 3 }),
      task({ id: 4 }),
    ]
    const index = calendarIndex(tasks, SHOWN)
    expect([...index.keys()].sort()).toEqual(['2026-11-12', '2026-11-13'])
    expect(itemsOn(index, '2026-11-12').map((entry) => entry.task.id)).toEqual([2, 1])
    expect(countOn(index, '2026-11-13')).toBe(1)
    expect(countOn(index, '2026-11-14')).toBe(0)
  })

  it('leaves out days nobody has a task on', () => {
    const index = calendarIndex([dueOn('2026-11-12')], SHOWN)
    expect(itemsOn(index, addLocalDays('2026-11-12', 1))).toEqual([])
    expect(index.size).toBe(1)
  })
})

describe('calendarTopRow', () => {
  it('takes the date-only task the Plan row would take too', () => {
    const tasks = [dueOn('2026-11-12', { id: 1 })]
    expect(calendarTopRow(tasks, '2026-11-12').map((entry) => entry.id)).toEqual([1])
  })

  it('leaves a due date with a clock to the grid, which draws it as a marker', () => {
    const tasks = [task({ id: 1, due_date: atClock('2026-11-12', 19 * 60).toISOString() })]
    expect(calendarTopRow(tasks, '2026-11-12')).toEqual([])
  })

  it('keeps a clocked start with no end, which is neither a block nor a marker', () => {
    const tasks = [task({ id: 1, start_date: atClock('2026-11-12', 9 * 60).toISOString() })]
    expect(calendarTopRow(tasks, '2026-11-12').map((entry) => entry.id)).toEqual([1])
  })

  it('leaves a block out of the row, whichever day it is asked about', () => {
    const tasks = [blockOn('2026-11-12', 9 * 60, 10 * 60, { id: 1 })]
    expect(calendarTopRow(tasks, '2026-11-12')).toEqual([])
  })

  it('shows a spanning task on each of its days', () => {
    const tasks = [spanning('2026-11-11', '2026-11-13', { id: 1 })]
    expect(calendarTopRow(tasks, '2026-11-12').map((entry) => entry.id)).toEqual([1])
  })

  it('puts all-day tasks before clocked ones, then by the clock', () => {
    const tasks = [
      task({ id: 1, start_date: atClock('2026-11-12', 18 * 60).toISOString() }),
      dueOn('2026-11-12', { id: 2 }),
      task({ id: 3, start_date: atClock('2026-11-12', 8 * 60).toISOString() }),
    ]
    expect(calendarTopRow(tasks, '2026-11-12').map((entry) => entry.id)).toEqual([2, 3, 1])
  })

  it('offers a done task whose due date has a clock, since no marker is drawn for it', () => {
    const tasks = [task({ id: 1, done: true, due_date: atClock('2026-11-12', 19 * 60).toISOString() })]
    expect(calendarTopRow(tasks, '2026-11-12').map((entry) => entry.id)).toEqual([1])
  })
})

describe('calendarBands', () => {
  const WEEK = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']

  it('draws one bar for a stretch inside the week', () => {
    const tasks = [spanning('2026-11-10', '2026-11-12', { id: 1 })]
    expect(calendarBands(tasks, WEEK)).toEqual([
      { task: tasks[0], from: '2026-11-10', to: '2026-11-12', lane: 0, continuesLeft: false, endsLater: false },
    ])
  })

  it('cuts a stretch that began before the week and marks the cut', () => {
    const tasks = [spanning('2026-11-05', '2026-11-11', { id: 1 })]
    const [band] = calendarBands(tasks, WEEK)
    expect(band.from).toBe('2026-11-09')
    expect(band.to).toBe('2026-11-11')
    expect(band.continuesLeft).toBe(true)
    expect(band.endsLater).toBe(false)
  })

  it('cuts both ends when the week sits inside a long stretch', () => {
    const tasks = [spanning('2026-10-01', '2026-12-01', { id: 1 })]
    const [band] = calendarBands(tasks, WEEK)
    expect([band.from, band.to, band.continuesLeft, band.endsLater]).toEqual(['2026-11-09', '2026-11-15', true, true])
  })

  it('leaves out a task that is not on these days at all', () => {
    expect(calendarBands([spanning('2026-10-01', '2026-10-05', { id: 1 })], WEEK)).toEqual([])
    expect(calendarBands([spanning('2026-12-01', '2026-12-05', { id: 1 })], WEEK)).toEqual([])
  })

  it('leaves out single days and time blocks, which the grid already draws', () => {
    const tasks = [dueOn('2026-11-10', { id: 1 }), blockOn('2026-11-10', 9 * 60, 10 * 60, { id: 2 })]
    expect(calendarBands(tasks, WEEK)).toEqual([])
  })

  it('packs overlapping stretches into lanes, longest first', () => {
    const tasks = [
      spanning('2026-11-10', '2026-11-11', { id: 1 }),
      spanning('2026-11-10', '2026-11-13', { id: 2 }),
      spanning('2026-11-12', '2026-11-13', { id: 3 }),
    ]
    const bands = calendarBands(tasks, WEEK)
    // The longest takes the top lane; the two short ones share the lane below without touching.
    expect(bands.map((band) => [band.task.id, band.lane])).toEqual([
      [2, 0],
      [1, 1],
      [3, 1],
    ])
  })
})

describe('the clock a dated row names', () => {
  it('takes the due clock when the due date carries one', () => {
    const [item] = calendarItemsFor(task({ due_date: atClock('2026-11-12', 10 * 60).toISOString() }), SHOWN)
    expect(item.kind).toBe('dated')
    expect(item.kind === 'dated' ? item.atMin : null).toBe(600)
  })

  it('says nothing about a date-only due date', () => {
    const [item] = calendarItemsFor(dueOn('2026-11-12'), SHOWN)
    expect(item.kind === 'dated' ? item.atMin : null).toBeUndefined()
  })

  it('falls back to a clocked start date', () => {
    const [item] = calendarItemsFor(task({ start_date: atClock('2026-11-12', 8 * 60).toISOString() }), SHOWN)
    expect(item.kind === 'dated' ? item.atMin : null).toBe(480)
  })

  it('leaves a time block to its own row', () => {
    const [item] = calendarItemsFor(blockOn('2026-11-12', 9 * 60, 10 * 60), SHOWN)
    expect(item.kind).toBe('timed')
  })
})
