import { cn } from '@/lib/cn'
import { formatBlockRange, type DateFormat } from '@/lib/date-display'
import { useDateFormat } from '@/hooks/use-date-format'
import { atClock } from '../../../shared/time-blocks'
import type { CalendarItem } from '@/lib/calendar-items'
import type { Task } from '@/lib/vikunja-types'

/** The clock time a row starts at, in the reader's 12 or 24 hour setting. */
function clockText(day: string, minutes: number, fmt: DateFormat): string {
  return new Intl.DateTimeFormat(fmt.locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: fmt.hour12,
  }).format(atClock(day, minutes))
}

interface CalendarTaskChipProps {
  item: CalendarItem<Task>
  /** The project's colour as #rrggbb: the bar on the left and the wash behind the row. */
  color: string | null
  /** The month grid shows the start time only; the agenda shows the range. */
  variant: 'month' | 'agenda'
  onOpen?: (task: Task) => void
  /** The month grid starts a drag here; a press without movement still opens the task. */
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void
}

/**
 * One task on the calendar, in the month grid and in the agenda. It wears its project's colour the
 * way a Plan block does — a solid bar on the left over a faint wash — so a column of tasks shows at
 * a glance which project each belongs to. A task spanning several days says so with an arrow: `↳`
 * carries on from an earlier day, `→` goes on to a later one (docs/calendar-views-plan.md 3.1).
 */
export function CalendarTaskChip({ item, color, variant, onOpen, onPointerDown }: CalendarTaskChipProps) {
  const fmt = useDateFormat()
  const { task } = item
  const time =
    item.kind === 'timed'
      ? variant === 'month'
        ? clockText(item.day, item.startMin, fmt)
        : formatBlockRange(atClock(item.day, item.startMin), atClock(item.day, item.endMin), fmt)
      : null
  const arrow = item.continues ? '↳' : item.endsLater ? '→' : null

  return (
    <button
      type="button"
      data-calendar-item={task.id}
      data-calendar-color={color ?? undefined}
      title={time ? `${time} ${task.title}` : task.title}
      onClick={() => onOpen?.(task)}
      onPointerDown={onPointerDown}
      style={{ borderLeftColor: color ?? 'var(--border-color)' }}
      className={cn(
        'relative flex w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-control border-l-[3px] py-0.5 pl-1.5 pr-1 text-left text-caption hover:bg-bg-hover',
        variant === 'agenda' && 'py-1',
        task.done && 'opacity-55',
      )}
    >
      {/* The wash sits over the row's own hover colour but under the text, so a hover still reads. */}
      {color && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundColor: `${color}1f` }} />
      )}
      <span className="relative flex min-w-0 flex-1 items-center gap-1.5">
        {time && (
          <span className={cn('shrink-0 tabular-nums text-text-secondary', task.done && 'line-through')}>{time}</span>
        )}
        <span className={cn('min-w-0 flex-1 truncate text-text', task.done && 'line-through')}>
          {arrow && <span className="mr-0.5 text-text-secondary">{arrow}</span>}
          {task.title}
        </span>
      </span>
    </button>
  )
}
