import { ChevronLeft, ChevronRight } from 'lucide-react'
import { SmartListIcon } from '@/components/shared/SmartListIcon'
import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'
import type { CalendarViewKind } from '@/lib/vikunja-types'

const VIEWS: { value: CalendarViewKind; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'agenda', label: 'Agenda' },
]

interface CalendarHeaderProps {
  view: CalendarViewKind
  /** The date range the view is showing, already written for the reader. */
  title: string
  onViewChange: (view: CalendarViewKind) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  /** The view already shows today, so the button reads as a state. */
  showingToday: boolean
  /** Filters and switches that belong to the view on screen. */
  children?: React.ReactNode
}

/** The calendar's one header: which projection, which range, and the arrows between ranges. */
export function CalendarHeader({
  view,
  title,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  showingToday,
  children,
}: CalendarHeaderProps) {
  return (
    // Below the window's drag band, so every control can be pressed (the Plan screen does the same).
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 pb-3 pt-8">
      <div className="flex items-center gap-2">
        <SmartListIcon list="calendar" className="h-5 w-5" />
        <h1 className="text-page-title text-text">{t('Calendar')}</h1>
      </div>

      <div role="radiogroup" aria-label={t('Calendar view')} className="flex rounded-full border border-border p-0.5">
        {VIEWS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={view === option.value}
            data-calendar-view={option.value}
            onClick={() => onViewChange(option.value)}
            className={cn(
              'rounded-full px-3 py-0.5 text-meta font-medium',
              view === option.value ? 'bg-bg-selected text-text' : 'text-text-secondary hover:text-text',
            )}
          >
            {t(option.label)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label={t('Previous page')}
          data-calendar-prev
          onClick={onPrev}
          className="flex h-7 w-7 items-center justify-center rounded-control text-text-secondary hover:bg-bg-hover"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t('Next page')}
          data-calendar-next
          onClick={onNext}
          className="flex h-7 w-7 items-center justify-center rounded-control text-text-secondary hover:bg-bg-hover"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-calendar-today
          onClick={onToday}
          aria-pressed={showingToday}
          className={cn(
            'rounded-control px-2 py-1 text-meta font-medium hover:bg-bg-hover',
            showingToday ? 'text-text-secondary' : 'text-text',
          )}
        >
          {t('Today')}
        </button>
      </div>

      <h2 className="text-meta font-semibold text-text" data-calendar-title>
        {title}
      </h2>

      {children}
    </header>
  )
}
