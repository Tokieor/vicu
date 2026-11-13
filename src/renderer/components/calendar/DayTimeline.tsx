import { useMemo, useRef } from 'react'
import { Timeline } from '@/components/planner/Timeline'
import { usePlanRoutines, usePlannerPrefs } from '@/hooks/use-planner'
import { calendarTopRow } from '@/lib/calendar-items'
import type { LocalDate } from '@/lib/due-dates'
import type { BlockChanges } from '../../../shared/time-blocks'
import type { Task } from '@/lib/vikunja-types'

interface DayTimelineProps {
  /** The one day on screen. The calendar keeps it on the anchor. */
  day: LocalDate
  /** Only the tasks that touch this day (the view's range is one day). */
  tasks: readonly Task[]
  onOpenTask: (task: Task) => void
  onChange: (task: Task, changes: BlockChanges) => void
  showRoutines: boolean
}

/**
 * The calendar's day view (docs/calendar-views-plan.md 3.2): one column of the planner's
 * timeline. Every hour has a label on the left; a task's time block is a full-width wash of its
 * project colour for as long as it lasts ("13:00–18:00" fills five hours), and tasks with no
 * time sit in the row above the grid. Dragging or stretching a block works as it does on Plan.
 *
 * Unlike the week, a single day has no weekend shading and no cross-day bars: a task that spans
 * several days simply shows up in the top row on the day being looked at.
 */
export function DayTimeline({ day, tasks, onOpenTask, onChange, showRoutines }: DayTimelineProps) {
  const prefs = usePlannerPrefs()
  const days = useMemo(() => [day], [day])
  const routines = usePlanRoutines(days, showRoutines)
  // No source list on the left: the grid only ever writes a time, never removes one.
  const emptyList = useRef<HTMLElement | null>(null)

  return (
    <Timeline
      days={days}
      selectedDay={day}
      onSelectDay={() => {}}
      tasks={tasks}
      routines={routines}
      defaultLength={prefs.defaultLength}
      hours={prefs.hours}
      isLoading={false}
      listRef={emptyList}
      onChange={onChange}
      topRowOf={(on) => calendarTopRow(tasks, on)}
      onPressBand={onOpenTask}
      onPressBlock={(task) => onOpenTask(task)}
    />
  )
}
