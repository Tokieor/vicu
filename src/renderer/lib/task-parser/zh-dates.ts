// 中文自然语言时间解析（docs/cross-app-semantics-v1.md 5.1 的中文补充）。
//
// chrono-node 只有英文解析器，中文输入一句也读不出来。这个模块补上中文口语的日期与时刻，
// 由 extract-dates.ts 在走 chrono 之前先试一次：命中就用它，未命中仍然交给英文解析。
//
// 约定（也是对外行为的一部分）：
//   - 只解析「往后」的时间。昨天/前天/上周这类过去表达不算截止日期，整条返回 null，与英文一致。
//   - 没有时段词的 1–12 点按 24 小时制读（"3点" = 03:00）；要 15:00 请写「下午3点」或「15点」。
//     这个假设会写进 notes（assumed-24-hour），调用方可以据此提示。
//   - 只写时段不写小时（"明天下午"）只确定日期，不猜时刻：hasTime = false。
//   - 只有时刻没有日期时，该时刻今天已过则落到明天（与 chrono 的 forwardDate 一致），
//     notes 记 time-passed-tomorrow。
//   - 「晚上十二点」按次日 00:00 处理（notes: midnight-next-day）；
//     「午夜十二点」「凌晨十二点」按当天 00:00 处理。
//   - 紧跟「每」的周几（"每周一"）是重复规则，不当日期，留给文本。
//   - 两个日期短语中间只隔一个连词（"11月10日到11月15日"、"10号至15号"、"周一~周五"）时
//     按时间段读：`range` 给出两端，`date` 是结束那天（截止日期就是它）。
//   - 无法识别、或整条只有时段（"下午"）时返回 null；调用方保持原文不变。
//
// 纯函数，不碰 DOM、不读设置，所以三种 tsconfig 都能编译，也便于单测。

import { addLocalDays, startOfWeek, toLocalDate, type LocalDate } from '../due-dates'

/** 一天中的时段，只用来把 12 小时制换算成 24 小时制。 */
export type ZhPeriod = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night' | 'midnight'

/** 解析时做过的假设。测试据此断言歧义处理，UI 也可以据此提示。 */
export type ZhNote =
  | 'assumed-24-hour'
  | 'midnight-next-day'
  | 'time-passed-tomorrow'
  | 'date-only'
  | 'date-range'
  | 'clock-range'

export interface ZhDateMatch {
  /** 命中区间起点（含）。 */
  start: number
  /** 命中区间终点（不含）。 */
  end: number
  /** 本地时间。hasTime 为 false 时只保证日期部分准确（时刻统一给 12:00，避免落在零点边界）。 */
  date: Date
  /** 文本里给了具体时刻（"3点"、"15:30"、"三点半"）。 */
  hasTime: boolean
  /** 文本里给了日期（"明天"、"周三"、"10月20日"）。 */
  hasDate: boolean
  notes: ZhNote[]
  /**
   * 文本写的是一个时间段（"11月10日到11月15日"）：两端各是哪一天。
   * 这时 `date` 是结束那天——截止日期就是它，时间段只是多出开始那天。
   */
  range?: { from: Date; to: Date }
  /** `range` 的两端是钟点而不是日期（"下午一点到六点"）：写字段时要保留时刻。 */
  rangeClocked?: boolean
}

const HAN_RE = /[\u4e00-\u9fa5]/
const pad2 = (n: number) => String(n).padStart(2, '0')

const CN_DIGITS: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
}

/**
 * 中文或阿拉伯数字 → 数值，只支持 0–99（时间表达用不到更大的数）。
 * 认得的写法：15、"3"、"十二"、"二十"、"二十三"、"十"、"零"、"两"。
 */
export function parseChineseNumber(raw: string): number | null {
  const text = raw.trim()
  if (!text) return null
  if (/^\d{1,3}$/.test(text)) return Number(text)
  const chars = [...text]
  const ten = chars.indexOf('十')
  if (ten === -1) {
    if (chars.length !== 1) return null
    return CN_DIGITS[chars[0]] ?? null
  }
  const before = chars.slice(0, ten)
  const after = chars.slice(ten + 1)
  let tens = 1
  if (before.length) {
    if (before.length !== 1) return null
    const value = CN_DIGITS[before[0]]
    if (value === undefined || value === 0) return null
    tens = value
  }
  let unit = 0
  if (after.length) {
    if (after.length !== 1) return null
    const value = CN_DIGITS[after[0]]
    if (value === undefined) return null
    unit = value
  }
  return tens * 10 + unit
}

// --- 小工具 ---------------------------------------------------------------------------------

function atLocal(date: LocalDate, hour: number, minute: number): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

function buildLocalDate(year: number, month: number, day: number): LocalDate | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const at = new Date(year, month - 1, day)
  if (at.getFullYear() !== year || at.getMonth() !== month - 1 || at.getDate() !== day) return null
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** `months` 个月后的同一天；目标月没有这一天时取月末。 */
function addMonthsLocal(date: LocalDate, months: number): LocalDate {
  const [year, month, day] = date.split('-').map(Number)
  const total = year * 12 + (month - 1) + months
  const targetYear = Math.floor(total / 12)
  const targetMonth = (total % 12) + 1
  const lastDay = new Date(targetYear, targetMonth, 0).getDate()
  return `${targetYear}-${pad2(targetMonth)}-${pad2(Math.min(day, lastDay))}`
}

/** 周几序号：1 = 周一 … 7 = 周日。 */
const WEEKDAY_INDEX: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7,
}

/** 第 `weeks` 周（0 = 本周）的周 `target`。 */
function weekdayOfWeek(today: LocalDate, target: number, weeks: number): LocalDate {
  const monday = addLocalDays(startOfWeek(today), weeks * 7)
  return addLocalDays(monday, target - 1)
}

// --- 时段 -----------------------------------------------------------------------------------

const PERIOD_SRC =
  '大半夜|凌晨|清晨|一大早|一早|早上|早晨|上午|中午|正午|晌午|下午|午后|傍晚|黄昏|晚上|晚间|夜里|夜间|夜晚|半夜|午夜|深夜|早|晚'

function periodOf(word: string): ZhPeriod {
  if (/^(大半夜|半夜|午夜|深夜)$/.test(word)) return 'midnight'
  if (/^(凌晨|清晨|一大早|一早)$/.test(word)) return 'dawn'
  if (/^(早上|早晨|上午|早)$/.test(word)) return 'morning'
  if (/^(中午|正午|晌午)$/.test(word)) return 'noon'
  if (/^(下午|午后)$/.test(word)) return 'afternoon'
  if (/^(傍晚|黄昏)$/.test(word)) return 'evening'
  return 'night'
}

/**
 * 12 小时制 + 时段 → 24 小时制。
 * "下午3点" → 15，"晚上12点" → 0（次日），"中午1点" → 13，"凌晨12点" → 0（当天）。
 */
function toHour24(hour: number, period: ZhPeriod | null): { hour: number; note?: ZhNote } {
  if (period === null) {
    return { hour, note: hour >= 1 && hour <= 12 ? 'assumed-24-hour' : undefined }
  }
  switch (period) {
    case 'dawn':
      return { hour: hour === 12 ? 0 : hour }
    case 'morning':
      return { hour }
    case 'noon':
      return { hour: hour >= 1 && hour <= 11 ? hour + 12 : hour }
    case 'afternoon':
    case 'evening':
      return { hour: hour >= 1 && hour <= 11 ? hour + 12 : hour }
    case 'midnight':
      return { hour: hour === 12 ? 0 : hour <= 5 ? hour : hour + 12 }
    case 'night':
      if (hour === 12) return { hour: 0, note: 'midnight-next-day' }
      return { hour: hour >= 1 && hour <= 11 ? hour + 12 : hour }
  }
}

// --- 日期短语 -------------------------------------------------------------------------------

interface DateCandidate {
  start: number
  end: number
  date: LocalDate
  period?: ZhPeriod
  past?: boolean
  /** 只写了日（"15日"），没写月份：当作时间段的结尾时，落在开头之前就是下个月。 */
  dayOnly?: boolean
  /** 周几（"周五"）：当作时间段的结尾而落在开头之前时，是下一周的同一个周几。 */
  weekday?: boolean
}

const RELATIVE_DAY: Array<[RegExp, number]> = [
  [/大后天/g, 3],
  [/后天/g, 2],
  [/明天|明日|明儿/g, 1],
  [/今天|今日|今儿/g, 0],
]

/** 今早/今晚/明早/明晚：日期与时段是同一个词。 */
const DAY_WITH_PERIOD = /(?:(今|明)(?:天)?(早上|早晨|清晨|上午|凌晨|中午|下午|傍晚|晚上|夜里|夜间|早|晨|晚|夜))/g

const PAST_DAY: RegExp[] = [/大前天/g, /前天/g, /昨天|昨日|昨儿/g, /上个?月/g, /上个?(?:周|星期|礼拜)[一二三四五六日天]?/g]

/** "周三"、"下周一"、"这周五"、"下下周日"。 */
const WEEKDAY = /(?:(下下|下个?|这个?|本)?(?:周|星期|礼拜)\s*([一二三四五六日天]))/g

/** "下周"、"下星期"：没有周几，落到下周一。 */
const NEXT_WEEK_ONLY = /(?:下个?(?:周|星期|礼拜))(?![一二三四五六日天])/g

/** "周末"、"这周末"：本周六，过了就是下周六。 */
const WEEKEND = /(?:(?:本|这)?周末)/g

/** "10月20日"、"2026年10月20号"、"10月20"。 */
const MONTH_DAY = /(?:(\d{4})\s*年\s*)?(\d{1,2}|[一二三四五六七八九十]{1,3})\s*月\s*(\d{1,2}|[一二三四五六七八九十]{1,3})\s*[日号]?/g

/** "5号"、"二十日"：本月，过了就是下月。后面跟"后/之/以"的属于相对时长。 */
const DAY_OF_MONTH = /(\d{1,2}|[一二三四五六七八九十]{1,3})\s*[号日](?![后之以])/g

const NUM_SRC = '\\d{1,3}|[零〇一二三四五六七八九十两]{1,3}'

/** "3天后"、"两周之后"。 */
const N_DAYS_LATER = new RegExp(`(${NUM_SRC})\\s*(?:天|日)(?:之?后|以后)`, 'g')
/** "2周后"、"三个星期以后"。 */
const N_WEEKS_LATER = new RegExp(`(${NUM_SRC})\\s*个?\\s*(?:周|星期|礼拜)(?:之?后|以后)`, 'g')
/** "4个月后"。 */
const N_MONTHS_LATER = new RegExp(`(${NUM_SRC})\\s*个?\\s*月(?:之?后|以后)`, 'g')
/** "下个月"、"下个月5号"。 */
const NEXT_MONTH = new RegExp(`下个?月(?:的)?(?:\\s*(${NUM_SRC})\\s*[号日])?`, 'g')

/**
 * 找文本里所有日期短语（含过去的），按出现位置排列。
 * 多个短语重叠时（"大后天" 里的 "后天"）都留着，由调用方挑。
 */
function collectDateCandidates(text: string, today: LocalDate): DateCandidate[] {
  const found: DateCandidate[] = []
  const todayYear = Number(today.slice(0, 4))

  const add = (
    re: RegExp,
    resolve: (m: RegExpExecArray) => { date: LocalDate | null; period?: ZhPeriod; past?: boolean; dayOnly?: boolean; weekday?: boolean },
  ) => {
    for (const m of text.matchAll(re)) {
      const index = m.index ?? 0
      if (index > 0 && text[index - 1] === '每') continue
      const resolved = resolve(m)
      if (!resolved.date) continue
      found.push({ start: index, end: index + m[0].length, ...resolved, date: resolved.date })
    }
  }

  for (const [re, days] of RELATIVE_DAY) {
    add(re, () => ({ date: addLocalDays(today, days) }))
  }

  add(DAY_WITH_PERIOD, (m) => {
    const offset = m[1] === '今' ? 0 : 1
    return { date: addLocalDays(today, offset), period: periodOf(m[2]) }
  })

  for (const re of PAST_DAY) {
    add(re, () => ({ date: today, past: true }))
  }

  add(WEEKDAY, (m) => {
    const prefix = m[1] ?? ''
    const target = WEEKDAY_INDEX[m[2]]
    if (!target) return { date: null }
    if (prefix.startsWith('下下')) return { date: weekdayOfWeek(today, target, 2), weekday: true }
    if (prefix) return { date: weekdayOfWeek(today, target, prefix.startsWith('下') ? 1 : 0), weekday: true }
    // 没有前缀：「周三」是本周三，已经过了就是下周三。
    const thisWeek = weekdayOfWeek(today, target, 0)
    return { date: thisWeek < today ? addLocalDays(thisWeek, 7) : thisWeek, weekday: true }
  })

  add(NEXT_WEEK_ONLY, () => ({ date: addLocalDays(startOfWeek(today), 7) }))

  add(WEEKEND, () => {
    const saturday = weekdayOfWeek(today, 6, 0)
    return { date: saturday < today ? addLocalDays(saturday, 7) : saturday }
  })

  add(MONTH_DAY, (m) => {
    const month = parseChineseNumber(m[2])
    const day = parseChineseNumber(m[3])
    if (month === null || day === null) return { date: null }
    const year = m[1] ? Number(m[1]) : todayYear
    const date = buildLocalDate(year, month, day)
    if (!date) return { date: null }
    // 没写年份且已经过去：按下一个年份（"10月20日" 在 11 月说，指明年）。
    if (!m[1] && date < today) return { date: buildLocalDate(year + 1, month, day) }
    return { date }
  })

  add(DAY_OF_MONTH, (m) => {
    const day = parseChineseNumber(m[1])
    if (day === null) return { date: null }
    const month = today.slice(0, 7)
    const date = buildLocalDate(todayYear, Number(month.slice(5, 7)), day)
    if (!date) return { date: null }
    return { date: date < today ? addMonthsLocal(date, 1) : date, dayOnly: true }
  })

  add(N_DAYS_LATER, (m) => {
    const days = parseChineseNumber(m[1])
    return days === null ? { date: null } : { date: addLocalDays(today, days) }
  })

  add(N_WEEKS_LATER, (m) => {
    const weeks = parseChineseNumber(m[1])
    return weeks === null ? { date: null } : { date: addLocalDays(today, weeks * 7) }
  })

  add(N_MONTHS_LATER, (m) => {
    const months = parseChineseNumber(m[1])
    return months === null ? { date: null } : { date: addMonthsLocal(today, months) }
  })

  add(NEXT_MONTH, (m) => {
    const next = addMonthsLocal(today, 1)
    if (!m[1]) return { date: next }
    const day = parseChineseNumber(m[1])
    if (day === null) return { date: next }
    const year = Number(next.slice(0, 4))
    const month = Number(next.slice(5, 7))
    return { date: buildLocalDate(year, month, day) }
  })

  return found
}

/**
 * 能当日期用的候选：去掉过去表达、被过去表达盖住的，以及被另一个短语整个包住的
 * （"11月10日" 里的 "10日"）——它们说的是同一天，留着只会让时间段从半截开始。
 */
function usableCandidates(found: DateCandidate[]): DateCandidate[] {
  const pastRanges = found.filter((candidate) => candidate.past)
  const live = found.filter(
    (candidate) => !candidate.past && !pastRanges.some((past) => candidate.start < past.end && candidate.end > past.start),
  )
  const width = (candidate: DateCandidate) => candidate.end - candidate.start
  return live.filter(
    (candidate) =>
      !live.some(
        (other) => other !== candidate && other.start <= candidate.start && other.end >= candidate.end && width(other) > width(candidate),
      ),
  )
}

/**
 * 找文本里最靠前、最长的日期短语。多个短语重叠时（"大后天" 里的 "后天"）取更长的那个。
 * 紧跟「每」的短语（"每周一"）跳过：那是重复规则，不是某一天。
 */
function matchDatePhrase(found: DateCandidate[]): DateCandidate | null {
  const usable = usableCandidates(found)
  if (usable.length) {
    usable.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
    return usable[0]
  }
  // 整段只有过去表达：交给调用方当作没有日期。
  return found.find((candidate) => candidate.past) ?? null
}

/** 时间段两个端点之间的连词（"11月10日到11月15日"、"10号至15号"、"周一~周五"）。 */
const RANGE_CONNECTOR = /^\s*(?:到|至|~|～|-|–|—)\s*$/

interface DateRangeCandidate {
  start: number
  end: number
  from: LocalDate
  to: LocalDate
}

/**
 * 找出文本里的时间段：两个日期短语中间只隔一个连词（"到"、"至"、"~"、短横线）。
 * 找不到成对的短语就返回 null——单个日期不算时间段。
 *
 * 开头比结尾还晚时先修一头：结尾是周几（"周一~周五"）就算同一周的下一个周几；
 * 否则把开头按「已经过去、算下次」推回去的那一下撤回——时间段的开头本来就可以在过去
 * （"11月10日到11月15日" 在 11 月 11 日说，是本周的事）。只写了日的（"10号到15号"）退一个月，
 * 写了月的退一年。
 */
function matchDateRange(text: string, found: DateCandidate[]): DateRangeCandidate | null {
  const usable = usableCandidates(found).sort((a, b) => a.start - b.start)
  for (let i = 0; i + 1 < usable.length; i++) {
    const from = usable[i]
    const to = usable[i + 1]
    if (to.start < from.end) continue
    if (!RANGE_CONNECTOR.test(text.slice(from.end, to.start))) continue
    let start = from.date
    let end = to.date
    // 结尾落在开头之前：先看它是不是周几（"周一~周五" 的周五是同一周的下一个周五）。
    if (end < start && to.weekday) {
      const ahead = addLocalDays(end, 7)
      if (ahead >= start) end = ahead
    }
    if (end < start) {
      const pulled = addMonthsLocal(start, from.dayOnly ? -1 : -12)
      if (pulled <= end) start = pulled
    }
    if (end < start) continue
    return { start: from.start, end: to.end, from: start, to: end }
  }
  return null
}

// --- 时刻短语 -------------------------------------------------------------------------------

const MINUTE_SRC = `半|一刻|三刻|整|(?:(?:${NUM_SRC})\\s*分?)`

/**
 * 锚定在起点：可选时段 + 时刻四种写法（"下午3点半"、"3点20分"、"15:30"、"3pm"），
 * 或者只有时段（"下午"）。中文没有词边界，所以不跨词搜索，避免把后文的时间吃进来。
 * am/pm 分支是为了「明天 3pm」这种中英混排：中文日期已经定了，时刻还说英文。
 */
const CLOCK_RE = new RegExp(
  `^[\\s,，、]*(?:` +
    `(?<period>${PERIOD_SRC})\\s*(?:(?<h>${NUM_SRC})\\s*[点时](?:\\s*(?<min>${MINUTE_SRC}))?)?` +
    `|(?<h2>${NUM_SRC})\\s*[点时](?:\\s*(?<min2>${MINUTE_SRC}))?` +
    // am/pm 放在 "3:30" 前面："3:30pm" 要整段读成下午，不能被短的 "3:30" 先吃掉。
    `|(?<h4>\\d{1,2})(?:\\s*[:：]\\s*(?<m4>\\d{2}))?\\s*(?<ampm>[ap])\\.?m` +
    `|(?<h3>\\d{1,2})\\s*[:：]\\s*(?<m3>\\d{2})` +
    `)`,
)

interface ClockCandidate {
  start: number
  end: number
  hour: number | null
  minute: number
  period: ZhPeriod | null
  /** am/pm 已经把它换算成 24 小时制，不要再按时段推一次。 */
  explicitHour?: boolean
}

function parseMinute(raw: string | undefined): number | null {
  if (raw === undefined) return 0
  if (raw === '半') return 30
  if (raw === '一刻') return 15
  if (raw === '三刻') return 45
  if (raw === '整') return 0
  const digits = raw.replace(/分$/, '').replace(/^[零〇]/, '').trim()
  const value = parseChineseNumber(digits)
  return value !== null && value >= 0 && value <= 59 ? value : null
}

function matchClockPhrase(text: string, from: number, inherited: ZhPeriod | null): ClockCandidate | null {
  const rest = text.slice(from)
  const m = CLOCK_RE.exec(rest)
  if (!m?.groups) return null

  const groups = m.groups
  let hour: number | null = null
  let minute = 0
  let explicitHour = false
  if (groups.h !== undefined) {
    hour = parseChineseNumber(groups.h)
    minute = parseMinute(groups.min) ?? -1
  } else if (groups.h2 !== undefined) {
    hour = parseChineseNumber(groups.h2)
    minute = parseMinute(groups.min2) ?? -1
  } else if (groups.h3 !== undefined) {
    hour = Number(groups.h3)
    minute = Number(groups.m3)
  } else if (groups.h4 !== undefined) {
    const raw = Number(groups.h4)
    if (raw < 1 || raw > 12) return null
    hour = (raw % 12) + (groups.ampm === 'p' ? 12 : 0)
    minute = groups.m4 ? Number(groups.m4) : 0
    explicitHour = true
  }
  if (hour !== null && (hour > 23 || minute < 0 || minute > 59)) return null

  const lead = /^[\s,，、]*/.exec(m[0])?.[0].length ?? 0
  return {
    start: from + lead,
    end: from + m[0].length,
    hour,
    minute,
    period: groups.period ? periodOf(groups.period) : inherited,
    explicitHour,
  }
}

// --- 对外接口 -------------------------------------------------------------------------------

interface ClockRangeCandidate {
  /** 命中区间（含日期短语时从它算起）。 */
  start: number
  end: number
  /** 两端距本地零点的分钟数。 */
  fromMinute: number
  toMinute: number
}

/**
 * 两个时刻中间只隔一个连词（"下午一点到六点"、"13:00至18:00"）：同一天的时间段。
 * 第二个时刻继承第一个的时段词，所以「下午一点到六点」是 13:00–18:00，而不是 13:00–06:00。
 * 结束不晚于开始、或一段超过 12 小时（跨天的写法）都不读，交给原来的单时刻规则。
 */
function matchClockRange(text: string, from: number, inherited: ZhPeriod | null): ClockRangeCandidate | null {
  const first = matchClockPhrase(text, from, inherited)
  if (!first || first.hour === null) return null
  const connector = /^\s*(?:到|至|~|～|-|–|—)\s*/.exec(text.slice(first.end))
  if (!connector) return null
  const second = matchClockPhrase(text, first.end + connector[0].length, first.period ?? inherited)
  if (!second || second.hour === null) return null

  const a = first.explicitHour ? { hour: first.hour } : toHour24(first.hour, first.period)
  const b = second.explicitHour ? { hour: second.hour } : toHour24(second.hour, second.period)
  const fromMinute = a.hour * 60 + first.minute
  let toMinute = b.hour * 60 + second.minute
  // 「下午1点到1点」这类没写第二个时段的，把 12 小时内的 1 点算成同一段下午。
  if (toMinute <= fromMinute && b.hour < 12 && a.hour >= 12) toMinute += 12 * 60
  if (toMinute <= fromMinute || toMinute - fromMinute > 12 * 60) return null
  return { start: first.start, end: second.end, fromMinute, toMinute }
}

/**
 * 解析一段可能含中文时间表达的文本。
 *
 * 命中返回 {@link ZhDateMatch}；无法识别、或整条只有时段（"下午"）时返回 null，
 * 过去的表达（"昨天"、"上周三"）同样返回 null——它们不是截止日期。
 */
export function parseZhDate(text: string, reference: Date = new Date()): ZhDateMatch | null {
  if (!text || !HAN_RE.test(text)) return null
  const today = toLocalDate(reference)

  const found = collectDateCandidates(text, today)
  const dateHit = matchDatePhrase(found)
  if (dateHit?.past) return null

  // 时间段（"11月10日到11月15日"）先看：它盖住两个日期短语，整段就是「开始–结束」，
  // 截止日期取结束那天。时间段只按天读，后面的时刻留给调用方当普通文本。
  const range = matchDateRange(text, found)
  if (range) {
    return {
      start: range.start,
      end: range.end,
      date: atLocal(range.to, 12, 0),
      hasTime: false,
      hasDate: true,
      notes: ['date-range'],
      range: { from: atLocal(range.from, 12, 0), to: atLocal(range.to, 12, 0) },
    }
  }

  // 日期后面可能跟着星期词（"10月12日周一" 就是 When 面板自己的写法），
  // 时间在那之后再找，否则整段读不出时刻，只剩日期。
  let clockFrom = dateHit ? dateHit.end : 0
  if (dateHit) {
    const tail = text.slice(clockFrom)
    const weekday = /^[\s,、]*周[一二三四五六日天]/.exec(tail)
    if (weekday) clockFrom += weekday[0].length
  }

  // 同一天的两个时刻（"下午一点到六点工作"）：整段读成时间段，结束那个钟点就是截止时刻。
  // 放在单时刻之前，否则「到六点」会留在标题里，开始时刻被当成唯一的截止时刻。
  const clockRange = matchClockRange(text, clockFrom, dateHit?.period ?? null)
  if (clockRange) {
    let day = dateHit ? dateHit.date : today
    const firstAt = atLocal(day, Math.floor(clockRange.fromMinute / 60), clockRange.fromMinute % 60)
    // 与单时刻一致：没写日期、起点今天已过，就落到明天。
    if (!dateHit && firstAt.getTime() < reference.getTime()) day = addLocalDays(day, 1)
    const from = atLocal(day, Math.floor(clockRange.fromMinute / 60), clockRange.fromMinute % 60)
    const to = atLocal(day, Math.floor(clockRange.toMinute / 60), clockRange.toMinute % 60)
    return {
      start: dateHit ? dateHit.start : clockRange.start,
      end: clockRange.end,
      date: to,
      hasTime: true,
      hasDate: Boolean(dateHit),
      notes: ['clock-range'],
      range: { from, to },
      rangeClocked: true,
    }
  }

  const clockHit = matchClockPhrase(text, clockFrom, dateHit?.period ?? null)
  if (!dateHit && !clockHit) return null
  // 只有时段（"下午"）：说得清一天里的哪一段，但说不出日期，交给调用方当没写。
  if (!dateHit && clockHit?.hour === null) return null

  const notes: ZhNote[] = []

  if (!clockHit || clockHit.hour === null) {
    const date = dateHit!.date
    notes.push('date-only')
    return {
      start: dateHit!.start,
      end: clockHit ? clockHit.end : dateHit!.end,
      date: atLocal(date, 12, 0),
      hasTime: false,
      hasDate: true,
      notes,
    }
  }

  const converted = clockHit.explicitHour
    ? { hour: clockHit.hour }
    : toHour24(clockHit.hour, clockHit.period ?? null)
  if (converted.note) notes.push(converted.note)

  let date = dateHit ? dateHit.date : today
  if (converted.note === 'midnight-next-day') date = addLocalDays(date, 1)

  if (!dateHit && converted.note !== 'midnight-next-day') {
    // 只有时刻：今天这个点已经过了，就落到明天。"晚上十二点" 已经按次日算过，不再判断一次。
    const candidate = atLocal(today, converted.hour, clockHit.minute)
    if (candidate.getTime() < reference.getTime()) {
      date = addLocalDays(today, 1)
      notes.push('time-passed-tomorrow')
    }
  }

  return {
    start: dateHit ? dateHit.start : clockHit.start,
    end: clockHit.end,
    date: atLocal(date, converted.hour, clockHit.minute),
    hasTime: true,
    hasDate: Boolean(dateHit),
    notes,
  }
}

/**
 * 只解析时刻（不涉及日期），返回 "HH:mm" 或 null。给 When 面板的自定义时间输入用：
 * "3点半" → "03:30"，"下午3点" → "15:00"，"3点一刻" → "03:15"。
 * 整段必须都被读成时刻，其余情况返回 null。
 */
export function parseZhClock(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed || !HAN_RE.test(trimmed)) return null
  const hit = matchClockPhrase(trimmed, 0, null)
  if (!hit || hit.hour === null) return null
  if (hit.end !== trimmed.length) return null
  const converted = hit.explicitHour ? { hour: hit.hour } : toHour24(hit.hour, hit.period)
  return `${pad2(converted.hour)}:${pad2(hit.minute)}`
}
