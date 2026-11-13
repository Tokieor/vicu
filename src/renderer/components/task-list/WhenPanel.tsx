import { useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { CalendarRange, X } from 'lucide-react'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/cn'
import { startOfLocalDay, toLocalDate, type LocalDate } from '@/lib/due-dates'
import { formatDateDisplay, formatDaySpan } from '@/lib/date-display'
import { useDateFormat } from '@/hooks/use-date-format'
import { useParserConfig } from '@/hooks/use-parser-config'
import { readsChineseDates } from '@/lib/task-parser'
import { MonthCalendar } from './MonthCalendar'
import {
  TIME_CHOICES,
  focusStaysInside,
  parseTimeText,
  parseWhenText,
  quickChoices,
  spanDays,
  timeLabel,
  whenText,
  withDate,
  withTime,
  type WhenValue,
} from '@/lib/when-logic'

export interface WhenPanelChange {
  /** True when the pick finishes the job (a quick choice, Enter in the text field). */
  commit: boolean
}

interface WhenPanelProps {
  /** The picked day and time. The panel shows it; the caller keeps it. */
  value: WhenValue
  onChange: (value: WhenValue, options: WhenPanelChange) => void
  /** "Now" for the quick choices and for reading typed text. Defaults to the time the panel opened. */
  now?: Date
  /**
   * 显示「时间段」一行：开始日期与结束日期（结束就是截止日期）。任务已经排了 time block 时不显示，
   * 免得一次点击把时间块换成一段日期。
   */
  withSpan?: boolean
}

/**
 * The When panel (card 3.4a1): a text field read by the quick-add parser with a live preview, quick
 * choices, a month grid and a row of times. It has no popover of its own; WhenPopover and the
 * reminder picker put it in one. A day without a time is date-only; the caller turns the value
 * into a due date with `dueOfWhenValue`.
 *
 * With `withSpan` it also carries a span of days: the start date, and an end date that is the same
 * value as the due date (`11月10日到11月15日`, or the two fields). Picking days then fills the field
 * that is highlighted, starting with the start day.
 */
export function WhenPanel({ value, onChange, now: nowProp, withSpan = false }: WhenPanelProps) {
  const fmt = useDateFormat()
  // 中文只在「中文」语法模式下读，与任务文本解析用同一个开关（设置页的语法模式）。
  const zhGrammar = readsChineseDates(useParserConfig().syntaxMode)
  const [opened] = useState(() => new Date())
  const now = nowProp ?? opened
  const today = toLocalDate(now)
  const ids = useId()

  const [text, setText] = useState(() => whenText(value, now, fmt))
  // What the text reads as while the user types. It is shown in the grid and the time row but only
  // reaches the caller on Enter.
  const [typed, setTyped] = useState<WhenValue | null>(null)
  /** 手打出来的时间段（"11月10日到11月15日"）：只用来把预览写成两端。 */
  const [typedSpan, setTypedSpan] = useState<{ start: LocalDate; end: LocalDate } | null>(null)
  const selected = typed ?? value

  // A day chosen or typed turns the month grid to it.
  const [reveal, setReveal] = useState<{ date: LocalDate } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const [customTime, setCustomTime] = useState('')
  const [customInvalid, setCustomInvalid] = useState(false)
  /** 日历点下去填哪一头：先开始，再结束。 */
  const [spanTarget, setSpanTarget] = useState<'start' | 'end'>('start')

  const choices = useMemo(() => quickChoices(today, fmt), [today, fmt])

  const showDay = (date: LocalDate) => setReveal({ date })

  const apply = (next: WhenValue, commit: boolean) => {
    setTyped(null)
    setTypedSpan(null)
    setText(whenText(next, now, fmt))
    if (next.date) showDay(next.date)
    onChange(next, { commit })
  }

  const onText = (raw: string) => {
    setText(raw)
    const parsed = parseWhenText(raw, now, fmt.locale, value.date, zhGrammar)
    // 文本没提时间段时保留原来那个：改个时刻不该把开始那天弄丢。
    setTyped(parsed ? { ...parsed.value, span: parsed.span ? { start: parsed.span.start } : selected.span } : null)
    setTypedSpan(parsed?.span ?? null)
    if (parsed?.value.date) showDay(parsed.value.date)
  }

  const onTextKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (typed) apply(typed, true)
  }

  // Enter confirms the typed time. Leaving the field for another control of the same popover (Tab to
  // Repeat, a click on a day) confirms it too; Escape and a press outside blur it with focus going
  // elsewhere, and discard it.
  const onCustomBlur = (event: FocusEvent<HTMLInputElement>) => {
    const surface = panelRef.current?.closest('[popover]') ?? panelRef.current
    if (focusStaysInside(surface, event.relatedTarget)) commitCustomTime()
  }

  const commitCustomTime = () => {
    if (!customTime.trim()) {
      setCustomInvalid(false)
      return
    }
    const time = parseTimeText(customTime, zhGrammar)
    setCustomInvalid(time === null)
    if (time === null) return
    setCustomTime('')
    apply(withTime(selected, time, today), false)
  }

  const typedHint = (() => {
    if (!text.trim() || text === whenText(selected, now, fmt)) return null
    if (!typed) return 'No date found'
    // 读到时间段就直接报两端（"11月10日 – 11月15日"），比只说结束那天清楚。
    if (typedSpan) {
      return `${formatDaySpan(startOfLocalDay(typedSpan.start), startOfLocalDay(typedSpan.end), now, fmt)}, Enter to set`
    }
    return `${whenText(typed, now, fmt)}, Enter to set`
  })()

  const timeIsPreset = selected.time !== null && (TIME_CHOICES as readonly string[]).includes(selected.time)

  // --- 时间段 ------------------------------------------------------------------
  const spanOn = selected.span != null
  const band = spanDays(selected)
  const dayLabel = (day: LocalDate | null, empty: string) =>
    day ? formatDateDisplay('header.day', startOfLocalDay(day), now, true, fmt) : empty

  /** 打开时间段：结束先与截止日期对齐（没有日期就今天），开始那格等着填。 */
  const enableSpan = () => {
    const day = selected.date ?? today
    setSpanTarget('start')
    apply({ ...selected, date: day, span: { start: day } }, false)
  }

  /** 关闭时间段：开始与结束都撤掉，截止日期留着。 */
  const clearSpan = () => apply({ ...selected, span: null }, false)

  const pickDay = (date: LocalDate) => {
    if (!selected.span) {
      apply(withDate(selected, date), false)
      return
    }
    if (spanTarget === 'start') {
      const end = selected.date && selected.date > date ? selected.date : date
      apply({ ...selected, date: end, span: { start: date } }, false)
      // 填完开始就接着填结束，两次点击画出一段。
      setSpanTarget('end')
      return
    }
    const start = selected.span.start && selected.span.start < date ? selected.span.start : date
    apply({ ...selected, date, span: { start } }, false)
  }

  return (
    // Plain keys stay in the panel: the list behind it has window-level shortcuts (Enter opens a task,
    // the arrows move its focus) that would otherwise act on a key meant for the grid.
    <div ref={panelRef} className="flex flex-col gap-2" onKeyDown={keepInPanel}>
      <div>
        <input
          type="text"
          data-autofocus
          aria-label="Date and time"
          aria-describedby={`${ids}-preview`}
          aria-invalid={typedHint === 'No date found'}
          placeholder="Type a day, a date or a time"
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={onTextKey}
          onFocus={(e) => e.currentTarget.select()}
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded-control border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2 py-1.5 text-meta text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
        />
        <p id={`${ids}-preview`} role="status" aria-live="polite" className="mt-1 min-h-4 px-0.5 text-caption text-[var(--text-secondary)]" data-testid="when-preview">
          {typedHint}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-1" role="group" aria-label="Quick choices">
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            onClick={() => apply(withDate(selected, choice.date), true)}
            className="flex min-h-7 items-center justify-between gap-2 rounded-control px-2 py-1 text-left text-meta text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          >
            <span>{t(choice.label)}</span>
            <span className="text-[var(--text-secondary)]">{choice.hint}</span>
          </button>
        ))}
      </div>

      <div className="border-t border-[var(--border-color)] pt-2">
        <MonthCalendar
          selected={selected.date}
          today={today}
          reveal={reveal}
          band={band}
          onPick={pickDay}
        />
      </div>

      {withSpan && (
        <div className="border-t border-[var(--border-color)] pt-2" role="group" aria-label="Start and end dates">
          {!spanOn ? (
            <button
              type="button"
              data-span-enable
              onClick={enableSpan}
              className="flex min-h-7 w-full items-center gap-1.5 rounded-control px-2 text-meta text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <CalendarRange className="h-3.5 w-3.5" />
              <span>{t('Start and end dates')}</span>
            </button>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <SpanField
                  label={t('Start')}
                  value={dayLabel(selected.span?.start ?? null, t('Not set'))}
                  pressed={spanTarget === 'start'}
                  onClick={() => setSpanTarget('start')}
                />
                <span aria-hidden className="text-caption text-[var(--text-secondary)]">–</span>
                <SpanField
                  label={t('End')}
                  value={dayLabel(selected.date, t('Not set'))}
                  pressed={spanTarget === 'end'}
                  onClick={() => setSpanTarget('end')}
                />
                <button
                  type="button"
                  onClick={clearSpan}
                  aria-label={t('Clear the start and end dates')}
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-control text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-danger"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1 px-0.5 text-caption text-[var(--text-secondary)]">
                {t('The end date is the due date. Pick a start day, then an end day.')}
              </p>
            </>
          )}
        </div>
      )}
      <div className="border-t border-[var(--border-color)] pt-2" role="group" aria-label="Time">
        <div className="flex flex-wrap items-center gap-1">
          <TimeChip pressed={selected.time === null} onClick={() => apply(withTime(selected, null, today), false)}>
            None
          </TimeChip>
          {TIME_CHOICES.map((time) => (
            <TimeChip key={time} pressed={selected.time === time} onClick={() => apply(withTime(selected, time, today), false)}>
              {timeLabel(time, fmt)}
            </TimeChip>
          ))}
          <input
            type="text"
            aria-label="Custom time"
            aria-invalid={customInvalid}
            placeholder={selected.time !== null && !timeIsPreset ? timeLabel(selected.time, fmt) : 'Custom time'}
            value={customTime}
            onChange={(e) => { setCustomTime(e.target.value); setCustomInvalid(false) }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
              e.preventDefault()
              commitCustomTime()
            }}
            onBlur={onCustomBlur}
            autoComplete="off"
            spellCheck={false}
            className={cn(
              'h-7 min-w-[5.5rem] flex-1 rounded-chip border bg-[var(--bg-secondary)] px-2.5 text-chip text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]',
              selected.time !== null && !timeIsPreset ? 'border-[var(--accent-blue)] placeholder:text-[var(--text-primary)]' : 'border-[var(--border-color)]',
              customInvalid && 'border-danger',
            )}
          />
        </div>
      </div>

    </div>
  )
}

/** 时间段的一头：字段名 + 那一天；按下时日历就填这一头。 */
function SpanField({ label, value, pressed, onClick }: { label: string; value: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={`${label}: ${value}`}
      onClick={onClick}
      className={cn(
        'flex h-7 min-w-0 flex-1 items-center gap-1 rounded-chip border px-2 text-chip transition-colors',
        pressed
          ? 'border-[var(--accent-blue)] bg-[var(--bg-selected)] text-[var(--text-primary)]'
          : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
      )}
    >
      <span className="shrink-0">{label}</span>
      <span className="truncate text-[var(--text-primary)]">{value}</span>
    </button>
  )
}

function keepInPanel(event: KeyboardEvent<HTMLElement>): void {
  if (!event.ctrlKey && !event.metaKey && event.key !== 'Escape') event.stopPropagation()
}

function TimeChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'h-7 rounded-chip border px-2.5 text-chip transition-colors',
        pressed
          ? 'border-transparent bg-accent-fill text-on-accent'
          : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
      )}
    >
      {children}
    </button>
  )
}
