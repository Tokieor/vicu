import { formatWeekdayShort } from '@/lib/date-display'
import { useDateFormat } from '@/hooks/use-date-format'
import { cn } from '@/lib/cn'
import { startOfLocalDay, type LocalDate } from '@/lib/due-dates'
import { t } from '@/lib/i18n'

interface CalendarEmptyDayProps {
  day: LocalDate
  isToday: boolean
  onOpenDay: (day: LocalDate) => void
}

/**
 * A day with nothing on it, folded to one line so a long agenda stays scannable. It keeps the same
 * two columns as a day with tasks — date on the left, words on the right — so the gutter rule and
 * the text line up down the whole page. Pressing it opens the day, which is also where a task gets
 * added to it.
 */
export function CalendarEmptyDay({ day, isToday, onOpenDay }: CalendarEmptyDayProps) {
  const fmt = useDateFormat()
  const date = startOfLocalDay(day)
  return (
    <button
      type="button"
      data-agenda-empty={day}
      onClick={() => onOpenDay(day)}
      className="grid w-full grid-cols-[3.25rem_1fr] gap-3 px-4 py-1.5 text-left text-caption hover:bg-bg-hover"
    >
      <span
        className={cn(
          'h-fit whitespace-nowrap text-right leading-none',
          isToday ? 'text-accent-blue' : 'text-text-secondary',
        )}
      >
        {date.getDate()} {formatWeekdayShort(date, fmt)}
      </span>
      <span className="min-w-0 truncate border-l border-border pl-3 text-text-secondary">{t('No plans')}</span>
    </button>
  )
}
