import { useEffect, useMemo, useRef } from 'react'
import { useDateFormat } from '@/hooks/use-date-format'
import { useProjects } from '@/hooks/use-projects'
import { itemsOn, type CalendarItem } from '@/lib/calendar-items'
import { normalizeHex } from '@/lib/constants'
import { formatMonthYear } from '@/lib/date-display'
import { startOfLocalDay, type LocalDate } from '@/lib/due-dates'
import { t } from '@/lib/i18n'
import { AgendaDayGroup } from './AgendaDayGroup'
import { CalendarEmptyDay } from './CalendarEmptyDay'
import type { Task } from '@/lib/vikunja-types'

interface AgendaListProps {
  days: readonly LocalDate[]
  index: Map<LocalDate, CalendarItem<Task>[]>
  today: LocalDate
  onOpenTask: (task: Task) => void
  onOpenDay: (day: LocalDate) => void
  /** The span is spent: ask the page for the next run of days. */
  onMore: () => void
}

/**
 * The agenda: days going down, the month pinned while it scrolls, days with nothing folded to one
 * line (docs/calendar-views-plan.md 3.3). The span comes from the page, so the URL keeps saying
 * which days are on screen.
 */
export function AgendaList({ days, index, today, onOpenTask, onOpenDay, onMore }: AgendaListProps) {
  const fmt = useDateFormat()
  const { data: projects } = useProjects()
  const todayRef = useRef<HTMLDivElement | null>(null)

  const colors = useMemo(() => {
    const map = new Map<number, string>()
    for (const project of projects?.flat ?? []) {
      const color = normalizeHex(project.hex_color)
      if (color) map.set(project.id, color)
    }
    return map
  }, [projects])

  // The first days of each month, where a pinned heading goes.
  const monthStarts = useMemo(() => {
    const starts = new Set<LocalDate>()
    let current = ''
    for (const day of days) {
      const month = day.slice(0, 7)
      if (month !== current) {
        starts.add(day)
        current = month
      }
    }
    return starts
  }, [days])

  // Open on today when the range holds it, rather than at the top of the span.
  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: 'start' })
  }, [])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-agenda-scroller>
      {days.map((day) => {
        const items = itemsOn(index, day)
        const isToday = day === today
        return (
          <div key={day} ref={isToday ? todayRef : undefined}>
            {monthStarts.has(day) && (
              <div className="sticky top-0 z-10 border-b border-border bg-bg-page/95 px-4 py-1 text-caption font-semibold text-text-secondary">
                {formatMonthYear(startOfLocalDay(day), fmt)}
              </div>
            )}
            {items.length === 0 ? (
              <CalendarEmptyDay day={day} isToday={isToday} onOpenDay={onOpenDay} />
            ) : (
              <AgendaDayGroup
                day={day}
                items={items}
                isToday={isToday}
                colors={colors}
                onOpenTask={onOpenTask}
                onOpenDay={onOpenDay}
              />
            )}
          </div>
        )
      })}

      <div className="px-4 py-3">
        <button
          type="button"
          onClick={onMore}
          data-agenda-more
          className="w-full rounded-control border border-border px-3 py-1.5 text-meta font-medium text-text-secondary hover:bg-bg-hover hover:text-text"
        >
          {t('Later days')}
        </button>
      </div>
    </div>
  )
}
