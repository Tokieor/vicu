import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDateFormat } from '@/hooks/use-date-format'
import { useProjects } from '@/hooks/use-projects'
import { cn } from '@/lib/cn'
import { normalizeHex } from '@/lib/constants'
import { addLocalDays, startOfLocalDay, type LocalDate } from '@/lib/due-dates'
import { formatWeekdayShort } from '@/lib/date-display'
import { itemsOn, type CalendarItem } from '@/lib/calendar-items'
import { moveToDay } from '@/lib/calendar-dnd'
import { MonthDayCell } from './MonthDayCell'
import type { BlockChanges } from '../../../shared/time-blocks'
import type { Task } from '@/lib/vikunja-types'

interface MonthGridProps {
  /** The 42 days of the grid, Monday first. */
  days: readonly LocalDate[]
  index: Map<LocalDate, CalendarItem<Task>[]>
  today: LocalDate
  onOpenDay: (day: LocalDate) => void
  onOpenTask: (task: Task) => void
  onChange: (task: Task, changes: BlockChanges) => void
}

/** A press has to travel this far before it counts as a drag rather than a click on the task. */
const DRAG_THRESHOLD_PX = 5

/** The day under the pointer, or null when the pointer left the grid. */
function dayAtPoint(x: number, y: number): LocalDate | null {
  const element = document.elementFromPoint(x, y)?.closest('[data-month-day]') as HTMLElement | null
  return (element?.dataset.monthDay as LocalDate | undefined) ?? null
}

/**
 * The month: six weeks of cells, three rows each and "+N more". A row can be dragged onto another
 * cell to change its day; a press without movement opens the task
 * (docs/calendar-views-plan.md 3.1).
 */
export function MonthGrid({ days, index, today, onOpenDay, onOpenTask, onChange }: MonthGridProps) {
  const fmt = useDateFormat()
  const { data: projects } = useProjects()
  const [overDay, setOverDay] = useState<LocalDate | null>(null)
  const [dragging, setDragging] = useState(false)
  // A drag ends with a pointerup that the browser also turns into a click; that click must not open.
  const suppressClick = useRef(false)
  const drag = useRef<{ task: Task; from: LocalDate; x: number; y: number; active: boolean } | null>(null)

  const colors = useMemo(() => {
    const map = new Map<number, string>()
    for (const project of projects?.flat ?? []) {
      const color = normalizeHex(project.hex_color)
      if (color) map.set(project.id, color)
    }
    return map
  }, [projects])

  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) => addLocalDays(days[0], index)), [days])

  const startDrag = useCallback((task: Task, from: LocalDate, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    drag.current = { task, from, x: event.clientX, y: event.clientY, active: false }
  }, [])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const current = drag.current
      if (!current) return
      if (!current.active) {
        if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < DRAG_THRESHOLD_PX) return
        current.active = true
        setDragging(true)
      }
      setOverDay(dayAtPoint(event.clientX, event.clientY))
    }

    const onUp = (event: PointerEvent) => {
      const current = drag.current
      drag.current = null
      if (!current?.active) {
        setDragging(false)
        setOverDay(null)
        return
      }
      const to = dayAtPoint(event.clientX, event.clientY)
      setDragging(false)
      setOverDay(null)
      if (to && to !== current.from) {
        const changes = moveToDay(current.task, to)
        if (changes) onChange(current.task, changes)
      }
      suppressClick.current = true
      // The click that follows this pointerup runs before the next frame.
      setTimeout(() => {
        suppressClick.current = false
      }, 0)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [onChange])

  const openTask = useCallback(
    (task: Task) => {
      if (suppressClick.current) return
      onOpenTask(task)
    },
    [onOpenTask],
  )

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', dragging && 'cursor-grabbing')} data-month-grid>
      <div className="grid shrink-0 grid-cols-7 border-b border-border">
        {weekdays.map((day) => (
          <div key={day} className="px-2 py-1 text-caption font-medium text-text-secondary">
            {formatWeekdayShort(startOfLocalDay(day), fmt)}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-px bg-border">
        {days.map((day) => (
          <MonthDayCell
            key={day}
            day={day}
            items={itemsOn(index, day)}
            isToday={day === today}
            isOtherMonth={day.slice(0, 7) !== days[14].slice(0, 7)}
            isDropTarget={overDay === day && dragging}
            colors={colors}
            onOpenDay={onOpenDay}
            onOpenTask={openTask}
            onStartDrag={startDrag}
          />
        ))}
      </div>
    </div>
  )
}
