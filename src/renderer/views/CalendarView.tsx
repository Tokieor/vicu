import { useEffect, useMemo } from 'react'
import { Navigate, useNavigate, useSearch } from '@tanstack/react-router'
import { CalendarHeader } from '@/components/calendar/CalendarHeader'
import { AgendaList } from '@/components/calendar/AgendaList'
import { MonthGrid } from '@/components/calendar/MonthGrid'
import { WeekTimeline } from '@/components/calendar/WeekTimeline'
import { useAppConfig } from '@/hooks/use-app-config'
import { useSaveCalendarConfig } from '@/hooks/use-calendar-config'
import { useFilters } from '@/hooks/use-filters'
import { useTasks } from '@/hooks/use-tasks'
import { toTaskChanges } from '@/hooks/use-planner'
import { useUpdateTask } from '@/hooks/use-task-mutations'
import { useDayKey } from '@/stores/day-store'
import { useSelectionStore } from '@/stores/selection-store'
import { calendarIndex, type CalendarItem } from '@/lib/calendar-items'
import { calendarRange, calendarTitle, localeFor, shiftAnchor, type CalendarRange } from '@/lib/calendar-range'
import { useLocale, t } from '@/lib/i18n'
import type { LocalDate } from '@/lib/due-dates'
import {
  calendarShowsRoutines,
  isCalendarEnabled,
  readCalendarAgendaDays,
  readCalendarView,
  type AppConfig,
  type CalendarViewKind,
} from '@/lib/vikunja-types'
import type { Task } from '@/lib/vikunja-types'
import type { BlockChanges } from '../../shared/time-blocks'

/**
 * The calendar (docs/calendar-views-plan.md): the month, the week and the agenda over the same
 * tasks. It browses and makes light changes; the Plan screen is where a day is laid out.
 *
 * The view and the day are in the URL, so going back and reopening the window lands where the
 * person was; `calendar_view` only holds the default for a link that names no view.
 */
export function CalendarView() {
  const { data: config, isLoading } = useAppConfig()
  if (isLoading) return null
  // Off by default, and never on a server it cannot read dates from (the planner is the same).
  if (!config || !isCalendarEnabled(config)) return <Navigate to="/today" />
  return <CalendarScreen config={config} />
}

function CalendarScreen({ config }: { config: AppConfig }) {
  const search = useSearch({ from: '/calendar' })
  const navigate = useNavigate({ from: '/calendar' })
  const save = useSaveCalendarConfig()
  const today = useDayKey()
  const locale = useLocale()
  const update = useUpdateTask()

  const view: CalendarViewKind = search.view ?? readCalendarView(config)
  const anchor = search.d ?? today
  const agendaDays = readCalendarAgendaDays(config)
  const options = useMemo(() => ({ agendaDays, today }), [agendaDays, today])

  const range = useMemo(() => calendarRange(view, anchor, options), [view, anchor, options])
  const title = useMemo(() => calendarTitle(view, anchor, localeFor(locale)), [view, anchor, locale])

  const params = useFilters({ view: 'calendar' })
  const { data: tasks = [], isLoading: tasksLoading } = useTasks(params)
  const showCompleted = config.calendar_show_completed === true
  // One pass over the tasks per (tasks, switch) change; every view reads this by day.
  const index = useMemo(() => calendarIndex(tasks, { showCompleted }), [tasks, showCompleted])

  // The grid draws its own rows by day, so it needs each task once, not once per day it spans.
  const rangeTasks = useMemo(() => {
    const seen = new Map<number, Task>()
    for (const day of range.days) {
      for (const item of index.get(day) ?? []) seen.set(item.task.id, item.task)
    }
    return [...seen.values()]
  }, [index, range])

  const go = (next: { view?: CalendarViewKind; d?: string }) => {
    void navigate({ search: (prev) => ({ ...prev, ...next }) })
  }

  const setView = (next: CalendarViewKind) => {
    // Remembered for the next session; the URL keeps the current one.
    if (next !== config.calendar_view) save({ calendar_view: next })
    go({ view: next })
  }

  const change = (task: Task, changes: BlockChanges) => {
    update.mutate({ id: task.id, changes: toTaskChanges(changes), original: task })
  }

  // M / W / A switch the projection, the arrows turn the page, T comes back to today — the same
  // habits the Plan screen has (docs/calendar-views-plan.md 7).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const element = event.target as HTMLElement | null
      if (element?.closest('input, textarea, [contenteditable="true"], [role="textbox"]')) return

      switch (event.key.toLowerCase()) {
        case 'm':
          setView('month')
          break
        case 'w':
          setView('week')
          break
        case 'a':
          setView('agenda')
          break
        case 't':
          go({ d: today })
          break
        case 'arrowleft':
          go({ d: shiftAnchor(view, anchor, -1, options) })
          break
        case 'arrowright':
          go({ d: shiftAnchor(view, anchor, 1, options) })
          break
        default:
          return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="flex h-full min-h-0 flex-col" data-calendar-screen data-calendar-view-kind={view}>
      <CalendarHeader
        view={view}
        title={title}
        onViewChange={setView}
        onPrev={() => go({ d: shiftAnchor(view, anchor, -1, options) })}
        onNext={() => go({ d: shiftAnchor(view, anchor, 1, options) })}
        onToday={() => go({ d: today })}
        showingToday={range.days.includes(today)}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tasksLoading ? (
          <div className="flex flex-1 items-center justify-center text-meta text-text-secondary">
            {t('Loading calendar…')}
          </div>
        ) : (
          <CalendarBody
            view={view}
            range={range}
            anchor={anchor}
            tasks={rangeTasks}
            index={index}
            today={today}
            onChange={change}
            showRoutines={calendarShowsRoutines(config)}
            onOpenDay={(day) => go({ view: 'agenda', d: day })}
            onOpenTask={(task) => useSelectionStore.getState().requestOpenTask(task.id)}
            onMore={() => go({ d: shiftAnchor('agenda', anchor, 1, options) })}
          />
        )}
      </div>
    </div>
  )
}

interface CalendarBodyProps {
  view: CalendarViewKind
  range: CalendarRange
  anchor: LocalDate
  tasks: readonly Task[]
  index: Map<LocalDate, CalendarItem<Task>[]>
  today: LocalDate
  onChange: (task: Task, changes: BlockChanges) => void
  showRoutines: boolean
  /** Show one day on its own: the agenda scrolls to it (the month's day click). */
  onOpenDay: (day: LocalDate) => void
  /** Open a task where it lives, the way a reminder does. */
  onOpenTask: (task: Task) => void
  /** The agenda span is spent: turn to the next run of days. */
  onMore: () => void
}

function CalendarBody({
  view,
  range,
  anchor,
  tasks,
  index,
  today,
  onChange,
  showRoutines,
  onOpenDay,
  onOpenTask,
  onMore,
}: CalendarBodyProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-calendar-body={view}>
      {view === 'week' ? (
        <WeekTimeline
          days={range.days}
          selectedDay={anchor}
          tasks={tasks}
          onOpenDay={onOpenDay}
          onChange={onChange}
          showRoutines={showRoutines}
        />
      ) : view === 'agenda' ? (
        <AgendaList
          days={range.days}
          index={index}
          today={today}
          onOpenTask={onOpenTask}
          onOpenDay={onOpenDay}
          onMore={onMore}
        />
      ) : (
        <MonthGrid
          days={range.days}
          index={index}
          today={today}
          onOpenDay={onOpenDay}
          onOpenTask={onOpenTask}
          onChange={onChange}
        />
      )}
    </div>
  )
}
