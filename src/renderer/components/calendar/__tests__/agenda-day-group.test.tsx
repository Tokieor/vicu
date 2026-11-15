// The agenda's one-day group: it must read in the order things happen, and only rows with no
// clock belong under the "No time" heading (docs/calendar-views-plan.md 3.3).

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgendaDayGroup } from '../AgendaDayGroup'
import { t } from '@/lib/i18n'
import { calendarIndex, itemsOn } from '@/lib/calendar-items'
import { dateOnlyDue } from '../../../../shared/due-dates'
import { atClock } from '../../../../shared/time-blocks'
import type { Task } from '@/lib/vikunja-types'

function row(fields: Record<string, unknown>): Task {
  return {
    id: 0,
    title: '',
    done: false,
    priority: 0,
    project_id: 1,
    due_date: null,
    start_date: null,
    end_date: null,
    ...fields,
  } as unknown as Task
}

const DAY = '2026-11-13'

/** The exact case reported: an 11:00 due date and a 14:00 time block on the same day. */
const TASKS = [
  row({ id: 1, title: '无时刻任务', due_date: dateOnlyDue(DAY) }),
  row({
    id: 2,
    title: '工作时间',
    start_date: atClock(DAY, 14 * 60).toISOString(),
    end_date: atClock(DAY, 18 * 60).toISOString(),
    due_date: dateOnlyDue(DAY),
  }),
  row({ id: 3, title: '渲染视频并发布', due_date: atClock(DAY, 11 * 60).toISOString() }),
]

function markup(): string {
  const index = calendarIndex(TASKS, { showCompleted: false })
  return renderToStaticMarkup(
    <AgendaDayGroup
      day={DAY}
      items={itemsOn(index, DAY)}
      isToday={false}
      colors={new Map()}
      onOpenTask={() => {}}
      onOpenDay={() => {}}
    />,
  )
}

describe('AgendaDayGroup', () => {
  it('puts the 11:00 due date before the 14:00 block', () => {
    const html = markup()
    expect(html.indexOf('11:00')).toBeGreaterThanOrEqual(0)
    expect(html.indexOf('14:00')).toBeGreaterThanOrEqual(0)
    expect(html.indexOf('11:00')).toBeLessThan(html.indexOf('14:00'))
  })

  it('gives both clocked rows a dot and leaves the clockless one under "No time"', () => {
    const html = markup()
    expect(html.match(/rounded-full bg-accent-blue/g) ?? []).toHaveLength(2)
    const noTime = html.indexOf(t('No time'))
    const clockless = html.indexOf('无时刻任务')
    expect(noTime).toBeGreaterThan(html.indexOf('14:00'))
    expect(clockless).toBeGreaterThan(noTime)
  })
})
