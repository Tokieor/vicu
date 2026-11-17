import {
  addLocalDays,
  dateOnlyDue,
  diffLocalDays,
  endOfMonth,
  endOfWeek,
  isDateOnly,
  isNoDueDate,
  nextWeekStart,
  startOfLocalDay,
  startOfWeek,
  toLocalDate,
  type LocalDate,
} from './due-dates'
import {
  formatDateDisplay,
  formatWeekdayDay,
  formatWeekdayShort,
  type DateFormat,
} from './date-display'
import { formatMinutesOfDay } from './date-utils'
import { extractDate } from './task-parser/extract-dates'
import { parseZhClock } from './task-parser/zh-dates'
import { blockOf } from '../../shared/time-blocks'

// The pure rules of the When panel (card 3.4a1): what a picked day and time mean as a due date,
// the month grid and its keyboard moves, the quick choices, and how typed text becomes a
// selection (through the quick-add parser's own date extraction, so the panel and the composer
// read "tomorrow 9am" the same way). No React and no DOM.

/** 时间段：开始那天和它的时刻。结束那天就是 `date`，时刻就是 `time`。 */
export interface WhenSpan {
  /** 还没选开始那天时为 null。 */
  start: LocalDate | null
  /** 开始的时刻（"HH:mm"）；null 表示只写了日期。 */
  time?: string | null
}

/** A picked day and, optionally, a time of day ("HH:mm", 24-hour). No time means date-only. */
export interface WhenValue {
  date: LocalDate | null
  time: string | null
  /**
   * 时间段（开始–结束）。没有这一项或为 null：不设时间段；`{ start: null }`：时间段开着，
   * 但还没选开始那天。同一天、两端都写了时刻时，这就是 Vikunja 的 time block
   * （"下午一点到六点" → start_date 13:00、end_date 18:00、due_date 18:00）。
   */
  span?: WhenSpan | null
}

export const EMPTY_WHEN: WhenValue = { date: null, time: null }

/** The times offered under the grid. */
export const TIME_CHOICES = ['09:00', '12:00', '15:00', '18:00'] as const

/** The time a reminder gets when only a day was picked. */
export const DEFAULT_REMINDER_TIME = '09:00'

// --- Time of day ----------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, '0')

/** "HH:mm" to minutes after midnight, or null when it is not a time. */
export function timeToMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  return h < 24 && m < 60 ? h * 60 + m : null
}

/** The clock text of "HH:mm" in the window's clock ("3:00 PM" or "15:00"). */
export function timeLabel(time: string, fmt: DateFormat): string {
  return formatMinutesOfDay(timeToMinutes(time) ?? 0, fmt)
}

/**
 * A time typed by hand: "15:30", "3pm", "3:30 pm", "7" (an hour on its own is read on the 24-hour
 * clock, "7pm" is 19:00). Also reads the Chinese forms this app ships with: "3点半", "三点一刻",
 * "下午3点", "晚上8点" — but only when `zhGrammar` is on (Chinese syntax mode), like every other
 * Chinese form. Returns "HH:mm" or null.
 */
export function parseTimeText(text: string, zhGrammar = false): string | null {
  // 中文输入法打出来的「13：30」是全角冒号，全角数字也一样：先按等值换成半角再读。
  const normalized = normalizePunctuation(text)
  if (zhGrammar) {
    const zh = parseZhClock(normalized)
    if (zh) return zh
  }
  const match = /^\s*(\d{1,2})(?:[:.h](\d{2}))?\s*([ap])?\.?m?\.?\s*$/i.exec(normalized)
  if (!match) return null
  let hour = Number(match[1])
  const minute = match[2] === undefined ? 0 : Number(match[2])
  const meridiem = match[3]?.toLowerCase()
  if (minute > 59) return null
  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    hour = (hour % 12) + (meridiem === 'p' ? 12 : 0)
  } else if (hour > 23) {
    return null
  }
  return `${pad2(hour)}:${pad2(minute)}`
}

/**
 * Whether a blur is focus moving to another control of the same panel. The custom time field
 * applies what was typed only then (or on Enter): Escape and a press outside also blur the field,
 * and they must discard the unconfirmed time instead of applying it.
 */
export function focusStaysInside(container: { contains(node: unknown): boolean } | null, next: unknown): boolean {
  return container !== null && next !== null && next !== undefined && container.contains(next)
}

// --- Value and due date ---------------------------------------------------------------------

/** What a stored due date reads as in the panel. No date, the null date or garbage: nothing picked. */
export function whenValueOfDue(due: string | null | undefined): WhenValue {
  if (!due || isNoDueDate(due)) return EMPTY_WHEN
  const at = new Date(due)
  const date = toLocalDate(at)
  if (isDateOnly(due)) return { date, time: null }
  return { date, time: `${pad2(at.getHours())}:${pad2(at.getMinutes())}` }
}

/**
 * The panel's value for a stored task: the due date, plus the start of a span of days. A task with
 * a same-day time block reads as a span whose two ends are its clocks, so the panel can edit it
 * instead of hiding the row — the block is exactly the "1pm to 6pm" the row now writes.
 */
export function whenValueOf(due: string | null | undefined, start?: string | null, end?: string | null): WhenValue {
  const value = whenValueOfDue(due)
  if (!start || isNoDueDate(start)) return value
  const from = new Date(start)
  const block = blockOf({ start_date: start, end_date: end ?? null })
  // A block ending exactly at midnight belongs to the next local day; the panel's clock cannot
  // hold that, so it stays a plain span of days (the Plan screen keeps that block as it was).
  if (block && toLocalDate(block.end) === toLocalDate(from)) {
    return {
      date: toLocalDate(block.end),
      time: clockTextOf(block.end),
      span: { start: toLocalDate(from), time: clockTextOf(from) },
    }
  }
  const clock = isDateOnly(start) ? null : clockTextOf(from)
  return { ...value, span: clock ? { start: toLocalDate(from), time: clock } : { start: toLocalDate(from) } }
}

function clockTextOf(at: Date): string {
  return `${pad2(at.getHours())}:${pad2(at.getMinutes())}`
}

/** The local instant of a day and a time of day. */
export function instantOf(date: LocalDate, time: string): Date {
  const start = startOfLocalDay(date)
  const minutes = timeToMinutes(time) ?? 0
  return new Date(start.getFullYear(), start.getMonth(), start.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0)
}

/**
 * The due date a value stands for: a day without a time is local 23:59:59 (`dateOnlyDue`, the one
 * place date-only values are made), a day with a time is that minute. Null when no day is picked
 * (clear the due date).
 */
export function dueOfWhenValue(value: WhenValue): string | null {
  if (!value.date) return null
  return value.time ? instantOf(value.date, value.time).toISOString() : dateOnlyDue(value.date)
}

/** The same value with a day (and the time kept). */
export function withDate(value: WhenValue, date: LocalDate): WhenValue {
  return { ...value, date }
}

/** The same value with a time; a time without a day picked starts from `today`. */
export function withTime(value: WhenValue, time: string | null, today: LocalDate): WhenValue {
  if (time === null) return { ...value, time: null }
  return { ...value, date: value.date ?? today, time }
}

/**
 * 时间段写成任务字段：开始那天（写了时刻就带上时刻），结束那天用截止日期那个值。
 * 同一天、开始有时刻、结束没时刻时，开始那天不能写成 23:59:59——那会在结束时刻之后，
 * 于是改成本地零点（`isDateOnly` 同样认它）。没有时间段时返回 null，调用方据此「不动」
 * start_date / end_date。
 */
export function spanOfWhenValue(value: WhenValue): { start_date: string | null; end_date: string | null } | null {
  if (!value.span) return null
  const start = value.span.start
  let start_date: string | null = null
  if (start) {
    if (value.span.time) start_date = instantOf(start, value.span.time).toISOString()
    else if (value.time && start === value.date) start_date = startOfLocalDay(start).toISOString()
    else start_date = dateOnlyDue(start)
  }
  return { start_date, end_date: dueOfWhenValue(value) }
}

/**
 * 设「开始」那一头的时刻。同一天里只给了一头时刻时，另一头补一小时：面板写出来的一定是
 * 两端齐全的时间段（13:00–14:00），不会落成 end 早于 start 的半截数据。清掉时刻不补。
 */
export function withStartTime(value: WhenValue, time: string | null): WhenValue {
  if (!value.span) return value
  const next: WhenValue = { ...value, span: { ...value.span, time } }
  if (time && value.span.start === value.date && !value.time) {
    next.time = shiftHour(time, 1)
  }
  return next
}

/** 设「结束」那一头的时刻，也就是截止日期的时刻。 */
export function withEndTime(value: WhenValue, time: string | null, today: LocalDate): WhenValue {
  const next = withTime(value, time, today)
  if (!value.span || !time) return next
  if (value.span.start === next.date && !value.span.time) {
    return { ...next, span: { ...value.span, time: shiftHour(time, -1) } }
  }
  return next
}

/** "HH:mm" moved by whole hours, held inside the day. */
function shiftHour(time: string, hours: number): string {
  const minutes = timeToMinutes(time) ?? 0
  const moved = Math.max(0, Math.min(23 * 60 + 59, minutes + hours * 60))
  return `${pad2(Math.floor(moved / 60))}:${pad2(moved % 60)}`
}

/** 时间段的底色范围：开始到结束（结束就是 `date`）；两端缺一个就没有范围。 */
export function spanDays(value: WhenValue): { from: LocalDate; to: LocalDate } | null {
  const start = value.span?.start
  if (!start || !value.date) return null
  return start <= value.date ? { from: start, to: value.date } : { from: value.date, to: start }
}

export function sameValue(a: WhenValue, b: WhenValue): boolean {
  return (
    a.date === b.date &&
    a.time === b.time &&
    (a.span?.start ?? null) === (b.span?.start ?? null) &&
    (a.span?.time ?? null) === (b.span?.time ?? null)
  )
}

// --- Month grid -------------------------------------------------------------------------------

/** The first day of the month `date` is in. */
export function monthStart(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01`
}

/** `months` months later (negative: earlier), the day of the month kept or clamped to the month's end. */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7)) - 1
  const day = Number(date.slice(8, 10))
  const total = year * 12 + month + months
  const first = `${String(Math.floor(total / 12)).padStart(4, '0')}-${pad2((total % 12) + 1)}-01`
  const last = Number(endOfMonth(first).slice(8, 10))
  return `${first.slice(0, 8)}${pad2(Math.min(day, last))}`
}

export interface GridDay {
  date: LocalDate
  /** True for a day of the shown month, false for the dimmed days of the weeks around it. */
  inMonth: boolean
}

/** Six weeks starting on Monday that cover the month of `month`; always six rows so the grid keeps its height. */
export function monthGrid(month: LocalDate): GridDay[][] {
  const first = monthStart(month)
  const start = startOfWeek(first)
  const prefix = first.slice(0, 7)
  const rows: GridDay[][] = []
  for (let r = 0; r < 6; r++) {
    const row: GridDay[] = []
    for (let c = 0; c < 7; c++) {
      const date = addLocalDays(start, r * 7 + c)
      row.push({ date, inMonth: date.startsWith(prefix) })
    }
    rows.push(row)
  }
  return rows
}

/**
 * Where a key moves the focused day: arrows by a day or a week, PageUp and PageDown by a month
 * (a year with Shift), Home and End to the start and end of the week. Null for any other key.
 */
export function moveGridFocus(current: LocalDate, key: string, shift = false): LocalDate | null {
  switch (key) {
    case 'ArrowLeft':
      return addLocalDays(current, -1)
    case 'ArrowRight':
      return addLocalDays(current, 1)
    case 'ArrowUp':
      return addLocalDays(current, -7)
    case 'ArrowDown':
      return addLocalDays(current, 7)
    case 'PageUp':
      return addMonths(current, shift ? -12 : -1)
    case 'PageDown':
      return addMonths(current, shift ? 12 : 1)
    case 'Home':
      return startOfWeek(current)
    case 'End':
      return endOfWeek(current)
    default:
      return null
  }
}

// --- Quick choices --------------------------------------------------------------------------

export interface QuickChoice {
  id: 'today' | 'tomorrow' | 'weekend' | 'nextWeek'
  label: string
  /** The weekday (and day of the month for next week) the choice lands on: "Wed", "Mon 12". */
  hint: string
  date: LocalDate
}

/** The Saturday after `today` (a Saturday gives the next one). */
export function comingSaturday(today: LocalDate): LocalDate {
  const ahead = (5 - diffWeekdayFromMonday(today) + 7) % 7
  return addLocalDays(today, ahead === 0 ? 7 : ahead)
}

function diffWeekdayFromMonday(date: LocalDate): number {
  // 0 = Monday ... 6 = Sunday
  return diffLocalDays(startOfWeek(date), date)
}

/** Today, Tomorrow, This weekend (the coming Saturday) and Next week (the coming Monday), from `today`. */
export function quickChoices(today: LocalDate, fmt: DateFormat): QuickChoice[] {
  const tomorrow = addLocalDays(today, 1)
  const weekend = comingSaturday(today)
  const nextWeek = nextWeekStart(today)
  const day = (date: LocalDate) => startOfLocalDay(date)
  return [
    { id: 'today', label: 'Today', hint: formatWeekdayShort(day(today), fmt), date: today },
    { id: 'tomorrow', label: 'Tomorrow', hint: formatWeekdayShort(day(tomorrow), fmt), date: tomorrow },
    { id: 'weekend', label: 'This weekend', hint: formatWeekdayShort(day(weekend), fmt), date: weekend },
    { id: 'nextWeek', label: 'Next week', hint: formatWeekdayDay(day(nextWeek), fmt), date: nextWeek },
  ]
}

// --- Text -------------------------------------------------------------------------------------

export interface WhenParse {
  value: WhenValue
  /** The part of the text that was read as a date or time. */
  matched: string
  /** 文本写出的时间段（"11月10日到11月15日"）：两端都是本地日期，`value.date` 是结束那天。
   * 两端写了钟点（"下午一点到六点"）时还带 startTime / endTime。 */
  span?: {
    start: LocalDate
    end: LocalDate
    startTime?: string | null
    endTime?: string | null
  } | null
}

/**
 * What the quick-add parser's date extraction makes of typed text ("tomorrow 9am", "next mon",
 * "oct 20 at 3pm"). A phrase that names no time gives a date-only value. Null when the text has no
 * date in it. Typed text here is nothing but a date, so "3 days" means that, unlike in a task's title.
 * `previous` is the day the text showed before the edit (see `dayWordPhrase`).
 * `zhGrammar` 为真时才读中文（中文语法模式）；默认关，与任务文本解析的那一个开关同源。
 */
export function parseWhenText(
  text: string,
  now: Date,
  locale?: string,
  previous?: LocalDate | null,
  zhGrammar = false,
): WhenParse | null {
  if (!text.trim()) return null
  const normalized = normalizePunctuation(text)
  const phrase = dayWordPhrase(normalized, now, locale, previous ?? null)
  if (phrase) return { ...phrase, matched: text.trim() }
  const found = extractDate(normalized, [], { reference: now, locale, bareAmounts: true, zhGrammar })
  if (!found.dueDate) return null
  const date = toLocalDate(found.dueDate)
  const time = found.hasTime ? `${pad2(found.dueDate.getHours())}:${pad2(found.dueDate.getMinutes())}` : null
  const token = found.tokens[0]
  // 时间段（"11月10日到11月15日" / "下午一点到六点"）：截止日期是结束那天，开始那天另外
  // 记在 value.span 上；写了钟点的那段把两端时刻也带上，面板才能填进「开始/结束」两格。
  const span = found.span
    ? {
        start: toLocalDate(found.span.start),
        end: toLocalDate(found.span.end),
        ...(found.span.clocked
          ? { startTime: clockTextOf(found.span.start), endTime: clockTextOf(found.span.end) }
          : {}),
      }
    : null
  const value: WhenValue = span
    ? {
        date: span.end,
        time: span.endTime ?? null,
        span: span.startTime ? { start: span.start, time: span.startTime } : { start: span.start },
      }
    : { date, time }
  return { value, matched: token ? token.raw : text.trim(), span }
}

/**
 * 全角标点与全角数字等长换成半角。中文界面的日期文本是「今天，10月7日，13:00」，
 * 中文解析器与 chrono 都只认半角分隔符；等长替换保证 token 的 start/end 还能对回原文。
 * U+FF01–U+FF5E 与 ASCII 0x21–0x7E 一一对应（偏移 0xFEE0），汉字不在这个区间，
 * 所以「１３：３０」「３．３０ ｐｍ」都会变成「13:30」「3.30 pm」。
 */
function normalizePunctuation(text: string): string {
  return text
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
}

// 中文界面把这三天写成「今天」「明天」「昨天」（date-display 的 WORDS），
// 英文仍是 Today/Tomorrow/Yesterday；两边都要认，否则改完时间按回车会把日期丢掉。
const DAY_WORD_RE = /^\s*(today|tomorrow|yesterday|今天|明天|昨天)\s*,\s*(.*?)\s*$/i
const DAY_WORD_OFFSET: Record<string, number> = {
  yesterday: -1,
  today: 0,
  tomorrow: 1,
  昨天: -1,
  今天: 0,
  明天: 1,
}

/**
 * The panel's own text for yesterday, today and tomorrow: the day word, the date it names and the
 * time ("Today, Oct 8, 1:00 PM"). The parser takes the word as the date and leaves the time behind,
 * so editing the time and pressing Enter cleared it (vicu-android issue 98). Read as one value
 * here: the time from what follows the word, and the day from the word, unless the word still
 * names `previous` and the date after it was changed. Null when the text is not of that form.
 *
 * 这里的 `zhGrammar: true` 是故意的：这段文本是面板自己写出来的（中文界面就是「今天，10月7日，
 * 13:00」），不是用户输入，必须能原样读回去 —— 否则关掉中文语法后改个时间再回车就把日期丢了。
 */
function dayWordPhrase(text: string, now: Date, locale: string | undefined, previous: LocalDate | null): WhenParse | null {
  const match = DAY_WORD_RE.exec(text)
  if (!match) return null
  const today = toLocalDate(now)
  const word = addLocalDays(today, DAY_WORD_OFFSET[match[1].toLowerCase()])
  // A date before today is read from the word's day, so "Yesterday, Oct 7" stays this year.
  const reference = word < today ? startOfLocalDay(word) : now
  const rest = extractDate(match[2], [], { reference, locale, skipTimeOnly: true, zhGrammar: true })
  if (!rest.dueDate) return null
  const restDate = toLocalDate(rest.dueDate)
  const date = previous !== null && word === previous && restDate !== previous ? restDate : word
  const time = rest.hasTime ? `${pad2(rest.dueDate.getHours())}:${pad2(rest.dueDate.getMinutes())}` : null
  return { value: { date, time }, matched: text.trim() }
}

/** A value as short text: "Sat 10 Oct, 15:00" (the chip phrasing). Empty when no day is picked. */
export function whenText(value: WhenValue, now: Date, fmt: DateFormat): string {
  if (!value.date) return ''
  const at = value.time ? instantOf(value.date, value.time) : startOfLocalDay(value.date)
  return formatDateDisplay('chip', at, now, value.time === null, fmt)
}
