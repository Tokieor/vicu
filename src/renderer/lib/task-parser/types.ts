import type { PlaceMatch } from './place-phrases'

/**
 * 语法模式，三选一：
 * - `todoist`：Todoist 风格前缀（`#项目` `@标签` `p1-p4`），只读英文日期；
 * - `vikunja`：Vikunja 风格前缀（`+项目` `*标签` `!1-!4`），只读英文日期；
 * - `zh`：中文日期与时刻（`明天` `下午3点` `周三`），前缀沿用 Todoist 风格。
 *
 * 中文解析是 `zh` 独有的：另两种模式下中文一律留在标题里，不会被当成日期。
 */
export type SyntaxMode = 'todoist' | 'vikunja' | 'zh'

/**
 * `place` is "when I get home" for a saved place (section 5.3), read only when the caller passes
 * places. `length` is `for 30m` when it makes a time block (section 5.4).
 */
export type TokenType = 'label' | 'project' | 'priority' | 'recurrence' | 'date' | 'length' | 'place'

export interface ParsedToken {
  type: TokenType
  start: number
  end: number
  value: unknown
  raw: string
}

export interface ParsedRecurrence {
  interval: number
  unit: 'day' | 'week' | 'month' | 'year'
}

/**
 * 文本写出的时间段（「11月10日到11月15日」「10号至15号」「下午一点到六点」）：开始与结束。
 * 只有中文解析（`zhGrammar`）会读出来——英文按契约没有区间（"friday to sunday" 就是周五）。
 */
export interface DateSpan {
  /** 开始那天；日期段是本地 12:00，时刻段是开始的钟点。 */
  start: Date
  /** 结束那天；截止日期取这一天。日期段是本地 12:00，时刻段是结束的钟点。 */
  end: Date
  /** 两端写的是钟点（"下午一点到六点"），写任务字段时保留时刻，不压成 date-only。 */
  clocked?: boolean
}

export interface ParseResult {
  title: string
  dueDate: Date | null
  /**
   * True when the parsed text named a time of day ("3pm", "14:30", "in 2 hours"), i.e. chrono's
   * `start.isCertain('hour')`. The time of `dueDate` is only meaningful when this is true;
   * otherwise the due date is date-only (build it with `parsedDue`).
   */
  dueHasTime: boolean
  /**
   * The time block `for 30m` makes with the text's time of day (section 5.4). The due date is then
   * that day, date-only: `dueHasTime` is false and the block holds the time.
   */
  block: { start: Date; end: Date } | null
  /**
   * 文本写出的时间段（中文「11月10日到11月15日」），两端各是哪一天。此时 `dueDate` 是结束那天，
   * 任务按 Vikunja 的开始/结束日期落成一段；没有时间段时为 null。
   */
  span: DateSpan | null
  priority: number | null
  labels: string[]
  project: string | null
  recurrence: ParsedRecurrence | null
  /** A saved place the text names with "when I get home", for a location reminder. */
  place: PlaceMatch | null
  tokens: ParsedToken[]
}

export interface SyntaxPrefixes {
  label: string
  project: string
}

export interface ParserConfig {
  enabled: boolean
  syntaxMode: SyntaxMode
  suppressTypes?: TokenType[]
  bangToday?: boolean
  /**
   * BCP 47 locale deciding the order of slash dates ("5/11": month/day in en-US, day/month in
   * en-GB). Defaults to the system locale (`navigator.language`).
   */
  locale?: string
}

const SYNTAX_PREFIXES: Record<SyntaxMode, SyntaxPrefixes> = {
  todoist: { label: '@', project: '#' },
  vikunja: { label: '*', project: '+' },
  // 中文模式只换日期语法，前缀沿用 Todoist 风格：中文用户最熟的写法，也不必再学一套。
  zh: { label: '@', project: '#' },
}

export function getPrefixes(mode: SyntaxMode): SyntaxPrefixes {
  return SYNTAX_PREFIXES[mode]
}

/**
 * 是否读取中文日期与时刻。只有 `zh` 模式为真：这是「中文语法解析」的唯一开关，
 * 日期解析（extract-dates）与 When 面板的时刻输入都问它。
 */
export function readsChineseDates(mode: SyntaxMode): boolean {
  return mode === 'zh'
}

export const DEFAULT_PARSER_CONFIG: ParserConfig = {
  enabled: true,
  syntaxMode: 'todoist',
}
