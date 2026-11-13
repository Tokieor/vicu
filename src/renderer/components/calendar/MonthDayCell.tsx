import { cn } from '@/lib/cn'
import { startOfLocalDay, type LocalDate } from '@/lib/due-dates'
import { t } from '@/lib/i18n'
import { CalendarTaskChip } from './CalendarTaskChip'
import type { CalendarItem } from '@/lib/calendar-items'
import type { Task } from '@/lib/vikunja-types'

/** How many rows a cell shows before "+N more"; three fit at the smallest useful window height. */
export const MONTH_CELL_ROWS = 3

interface MonthDayCellProps {
  day: LocalDate
  items: readonly CalendarItem<Task>[]
  isToday: boolean
  /** A day of the month before or after the one on screen, shown to fill the grid's first and last week. */
  isOtherMonth: boolean
  /** The day a drag is hovering, drawn as the drop target. */
  isDropTarget: boolean
  colors: Map<number, string>
  onOpenDay: (day: LocalDate) => void
  onOpenTask: (task: Task) => void
  onStartDrag: (task: Task, from: LocalDate, event: React.PointerEvent<HTMLButtonElement>) => void
}

/**
 * One day of the month grid: its number, up to three rows, and "+N more". The number opens the day;
 * a row opens its task, or starts a drag onto another cell.
 */
export function MonthDayCell({
  day,
  items,
  isToday,
  isOtherMonth,
  isDropTarget,
  colors,
  onOpenDay,
  onOpenTask,
  onStartDrag,
}: MonthDayCellProps) {
  const visible = items.slice(0, MONTH_CELL_ROWS)
  const hidden = items.length - visible.length

  return (
    <div
      data-month-day={day}
      data-month-other={isOtherMonth || undefined}
      className={cn(
        'flex min-h-0 min-w-0 flex-col gap-0.5 overflow-hidden bg-bg-page px-1 pb-1 pt-0.5',
        isOtherMonth && 'bg-bg-hover/30',
        isDropTarget && 'ring-2 ring-inset ring-accent-blue/70',
      )}
    >
      <button
        type="button"
        onClick={() => onOpenDay(day)}
        aria-label={day}
        className="flex w-fit shrink-0 items-center rounded-full"
      >
        <span
          className={cn(
            'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-caption tabular-nums',
            isToday
              ? 'bg-accent-blue font-semibold text-white'
              : isOtherMonth
                ? 'text-text-secondary'
                : 'text-text',
          )}
        >
          {startOfLocalDay(day).getDate()}
        </span>
      </button>

      {visible.map((item) => (
        <CalendarTaskChip
          key={`${item.task.id}-${item.day}`}
          item={item}
          color={colors.get(item.task.project_id) ?? null}
          variant="month"
          onOpen={onOpenTask}
          onPointerDown={(event) => onStartDrag(item.task, day, event)}
        />
      ))}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => onOpenDay(day)}
          className="w-fit shrink-0 rounded-control px-1.5 text-left text-caption text-text-secondary hover:bg-bg-hover hover:text-text"
        >
          {t('{0} more', hidden)}
        </button>
      )}
    </div>
  )
}
