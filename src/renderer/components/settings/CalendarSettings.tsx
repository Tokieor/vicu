import { Checkbox } from '@/components/shared/Checkbox'
import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'
import {
  CALENDAR_AGENDA_DAYS,
  calendarShowsRoutines,
  isCalendarEnabled,
  readCalendarAgendaDays,
  readCalendarView,
  type AppConfig,
  type CalendarAgendaDays,
  type CalendarViewKind,
} from '@/lib/vikunja-types'

interface CalendarSettingsProps {
  config: AppConfig
  onChange: (partial: Partial<AppConfig>) => void
}

const VIEWS: { value: CalendarViewKind; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'agenda', label: 'Agenda' },
]

/** Settings → General → Calendar. Off by default and per device (docs/calendar-views-plan.md 6). */
export function CalendarSettings({ config, onChange }: CalendarSettingsProps) {
  const enabled = isCalendarEnabled(config)
  const view = readCalendarView(config)
  const agendaDays = readCalendarAgendaDays(config)

  return (
    <div className="rounded-card border border-[var(--border-color)] bg-[var(--bg-primary)] p-5">
      <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Calendar</h2>
      <p className="mb-4 text-xs text-[var(--text-secondary)]">
        The month, the week and the agenda over the same tasks. Look and make light changes here; the Plan screen is
        where a day is laid out.
      </p>

      <label className="flex cursor-pointer items-center gap-2">
        <Checkbox
          checked={enabled}
          data-calendar-enable
          onChange={(event) => onChange({ calendar_enabled: event.target.checked })}
        />
        <span className="text-sm text-[var(--text-primary)]">Show the calendar in the sidebar</span>
      </label>

      {enabled && (
        <div className="mt-4 space-y-4 border-t border-[var(--border-color)] pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-[var(--text-primary)]">Default view</span>
            <div role="radiogroup" aria-label="Default view" className="flex rounded-full border border-[var(--border-color)] p-0.5">
              {VIEWS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={view === option.value}
                  data-calendar-default-view={option.value}
                  onClick={() => onChange({ calendar_view: option.value })}
                  className={cn(
                    'rounded-full px-3 py-0.5 text-xs font-medium',
                    view === option.value
                      ? 'bg-[var(--bg-selected)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                  )}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-[var(--text-primary)]">Agenda span</span>
            <div role="radiogroup" aria-label="Agenda span" className="flex rounded-full border border-[var(--border-color)] p-0.5">
              {CALENDAR_AGENDA_DAYS.map((days: CalendarAgendaDays) => (
                <button
                  key={days}
                  type="button"
                  role="radio"
                  aria-checked={agendaDays === days}
                  data-calendar-agenda-days={days}
                  onClick={() => onChange({ calendar_agenda_days: days })}
                  className={cn(
                    'rounded-full px-3 py-0.5 text-xs font-medium',
                    agendaDays === days
                      ? 'bg-[var(--bg-selected)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                  )}
                >
                  {t('{0} days', days)}
                </button>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={config.calendar_show_completed === true}
              data-calendar-show-completed
              onChange={(event) => onChange({ calendar_show_completed: event.target.checked })}
            />
            <span className="text-sm text-[var(--text-primary)]">Show completed tasks</span>
          </label>

          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={calendarShowsRoutines(config)}
              data-calendar-show-routines
              disabled={config.routines_enabled === false}
              onChange={(event) => onChange({ calendar_show_routines: event.target.checked })}
            />
            <span className={cn('text-sm', config.routines_enabled === false ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]')}>
              Show routines on the week and agenda
            </span>
          </label>
        </div>
      )}
    </div>
  )
}
