import { useMemo, useRef } from 'react'
import { Timeline } from '@/components/planner/Timeline'
import { usePlannerPrefs, usePlanRoutines } from '@/hooks/use-planner'
import { calendarTopRow } from '@/lib/calendar-items'
import { isoWeekday, type LocalDate } from '@/lib/due-dates'
import type { BlockChanges } from '../../../shared/time-blocks'
import type { Task } from '@/lib/vikunja-types'

interface WeekTimelineProps {
  days: readonly LocalDate[]
  /** The day the grid highlights; the calendar keeps it on the anchor. */
  selectedDay: LocalDate
  /** The tasks the range holds; the grid places each by its block or its due date. */
  tasks: readonly Task[]
  onOpenDay: (day: LocalDate) => void
  onChange: (task: Task, changes: BlockChanges) => void
  showRoutines: boolean
}

/**
 * The calendar's week: the Plan screen's timeline with the browsing differences from
 * docs/calendar-views-plan.md 3.2 — no source list on the left, no gear, a day header that opens
 * that day, and quieter weekends. Dragging and stretching a block work exactly as they do there.
 */
export function WeekTimeline({ days, selectedDay, tasks, onOpenDay, onChange, showRoutines }: WeekTimelineProps) {
  const prefs = usePlannerPrefs()
  const routines = usePlanRoutines(days, showRoutines)
  // No list to drag a block back onto: the grid only ever writes a time, never removes one.
  const emptyList = useRef<HTMLElement | null>(null)

  const dimDays = useMemo(
    () => new Set(days.filter((day) => isoWeekday(day) >= 6)),
    [days],
  )

  return (
    <Timeline
      days={days}
      selectedDay={selectedDay}
      onSelectDay={onOpenDay}
      tasks={tasks}
      routines={routines}
      defaultLength={prefs.defaultLength}
      hours={prefs.hours}
      isLoading={false}
      listRef={emptyList}
      onChange={onChange}
      dimDays={dimDays}
      topRowOf={(day) => calendarTopRow(tasks, day)}
    />
  )
}
