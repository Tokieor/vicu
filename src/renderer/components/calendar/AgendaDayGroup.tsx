import { cn } from '@/lib/cn'
import { formatWeekdayShort } from '@/lib/date-display'
import { useDateFormat } from '@/hooks/use-date-format'
import { t } from '@/lib/i18n'
import { startOfLocalDay, type LocalDate } from '@/lib/due-dates'
import { CalendarTaskChip } from './CalendarTaskChip'
import type { CalendarItem } from '@/lib/calendar-items'
import type { Task } from '@/lib/vikunja-types'

interface AgendaDayGroupProps {
  day: LocalDate
  items: readonly CalendarItem<Task>[]
  isToday: boolean
  colors: Map<number, string>
  onOpenTask: (task: Task) => void
  onOpenDay: (day: LocalDate) => void
}

/**
 * One day of the agenda: the date on the left, its tasks on the right. Tasks with a time keep a
 * dot on the line; the ones with no time follow them under their own small heading, so a day reads
 * in the order it will happen (docs/calendar-views-plan.md 3.3).
 */
export function AgendaDayGroup({ day, items, isToday, colors, onOpenTask, onOpenDay }: AgendaDayGroupProps) {
  const fmt = useDateFormat()
  const date = startOfLocalDay(day)
  const timed = items.filter((item) => item.kind === 'timed')
  const dated = items.filter((item) => item.kind === 'dated')

  return (
    <div
      data-agenda-day={day}
      className={cn('grid grid-cols-[3.25rem_1fr] gap-3 px-4 py-2', isToday && 'bg-accent-blue/[0.04]')}
    >
      <button
        type="button"
        onClick={() => onOpenDay(day)}
        aria-label={day}
        className="group h-fit rounded-control pt-0.5 text-right"
      >
        <div className={cn('text-section leading-none', isToday ? 'text-accent-blue' : 'text-text')}>
          {date.getDate()}
        </div>
        <div className="mt-0.5 text-caption text-text-secondary group-hover:text-text">
          {formatWeekdayShort(date, fmt)}
        </div>
      </button>

      <div className="min-w-0 space-y-0.5 border-l border-border pl-3">
        {timed.map((item) => (
          <div key={`${item.task.id}-${item.day}`} className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-blue" />
            <CalendarTaskChip
              item={item}
              color={colors.get(item.task.project_id) ?? null}
              variant="agenda"
              onOpen={onOpenTask}
            />
          </div>
        ))}

        {timed.length > 0 && dated.length > 0 && (
          <div className="pt-1 text-caption text-text-secondary">{t('No time')}</div>
        )}

        {dated.map((item) => (
          <div key={`${item.task.id}-${item.day}`} className="flex min-w-0 items-center pl-[0.9rem]">
            <CalendarTaskChip
              item={item}
              color={colors.get(item.task.project_id) ?? null}
              variant="agenda"
              onOpen={onOpenTask}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
