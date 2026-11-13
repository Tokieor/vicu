// 时间段（开始–结束）在 When 面板与新建任务之间的取值规则。
// 约定：结束日期就是截止日期，所以面板只多存一个「开始那天」。
import { describe, expect, it } from 'vitest'
import { dateOnlyDue, localDateOf } from '../due-dates'
import { resolveComposerFields } from '../composer-fields'
import { parse, spanFields } from '../task-parser'
import { parseWhenText, spanDays, spanOfWhenValue, whenValueOf, withDate, withTime } from '../when-logic'

const NOW = new Date(2026, 10, 11, 9, 0, 0)
const ZH = { enabled: true, syntaxMode: 'zh' } as const

describe('whenValueOf', () => {
  it('把任务的开始日期读成时间段，截止日期仍是结束那天', () => {
    const value = whenValueOf(dateOnlyDue('2026-11-15'), dateOnlyDue('2026-11-10'))
    expect(value.date).toBe('2026-11-15')
    expect(value.span).toEqual({ start: '2026-11-10' })
  })

  it('没有开始日期就没有时间段', () => {
    expect(whenValueOf(dateOnlyDue('2026-11-15')).span).toBeUndefined()
    expect(whenValueOf(dateOnlyDue('2026-11-15'), '0001-01-01T00:00:00Z').span).toBeUndefined()
  })
})

describe('spanOfWhenValue', () => {
  it('开始与结束都写成 date-only 的日期', () => {
    const value = { date: '2026-11-15', time: null, span: { start: '2026-11-10' } }
    const fields = spanOfWhenValue(value)
    expect(fields).not.toBeNull()
    expect(localDateOf(fields!.start_date)).toBe('2026-11-10')
    expect(localDateOf(fields!.end_date)).toBe('2026-11-15')
    expect(fields!.end_date).toBe(dateOnlyDue('2026-11-15'))
  })

  it('没有时间段时返回 null（调用方据此不动开始与结束日期）', () => {
    expect(spanOfWhenValue({ date: '2026-11-15', time: null })).toBeNull()
    expect(spanOfWhenValue({ date: '2026-11-15', time: null, span: null })).toBeNull()
  })
})

describe('spanDays', () => {
  it('给出日历上要涂底色的那一整段', () => {
    expect(spanDays({ date: '2026-11-15', time: null, span: { start: '2026-11-10' } })).toEqual({ from: '2026-11-10', to: '2026-11-15' })
    // 反着选也画得出来。
    expect(spanDays({ date: '2026-11-10', time: null, span: { start: '2026-11-15' } })).toEqual({ from: '2026-11-10', to: '2026-11-15' })
    expect(spanDays({ date: '2026-11-10', time: null, span: { start: null } })).toBeNull()
    expect(spanDays({ date: null, time: null, span: { start: '2026-11-10' } })).toBeNull()
  })
})

describe('改日期与时刻时时间段不丢', () => {
  it('withDate 与 withTime 都保留开始那天', () => {
    const value = { date: '2026-11-15', time: null, span: { start: '2026-11-10' } }
    expect(withDate(value, '2026-11-16').span).toEqual({ start: '2026-11-10' })
    expect(withTime(value, '09:00', '2026-11-11').span).toEqual({ start: '2026-11-10' })
    expect(withTime(value, null, '2026-11-11').span).toEqual({ start: '2026-11-10' })
  })
})

describe('面板的文本输入读时间段', () => {
  it('「11月10日到11月15日」给出开始那天，截止日期是结束那天', () => {
    const hit = parseWhenText('11月10日到11月15日', NOW, undefined, null, true)
    expect(hit?.value).toEqual({ date: '2026-11-15', time: null, span: { start: '2026-11-10' } })
    expect(hit?.span).toEqual({ start: '2026-11-10', end: '2026-11-15' })
  })

  it('单个日期照旧没有时间段', () => {
    expect(parseWhenText('明天', NOW, undefined, null, true)?.span).toBeNull()
    expect(parseWhenText('明天', NOW, undefined, null, true)?.value).toEqual({ date: '2026-11-12', time: null })
  })

  it('英文模式读不出中文时间段', () => {
    expect(parseWhenText('11月10日到11月15日', NOW, undefined, null, false)).toBeNull()
  })
})

describe('spanFields', () => {
  it('把解析出的两端写成任务字段', () => {
    const parsed = parse('整理房间 11月10日到11月15日', ZH, NOW)
    const fields = spanFields(parsed)
    expect(localDateOf(fields!.start_date)).toBe('2026-11-10')
    expect(localDateOf(fields!.end_date)).toBe('2026-11-15')
    expect(spanFields(parse('整理房间 明天', ZH, NOW))).toBeNull()
  })
})

describe('新建任务里的时间段', () => {
  const input = (title: string, overrides: Partial<Parameters<typeof resolveComposerFields>[0]> = {}) => ({
    parsed: parse(title, ZH, NOW),
    dueTouched: false,
    dueValue: null,
    spanValue: null,
    contextDue: null,
    contextDueDismissed: false,
    priority: null,
    projectTouched: false,
    selectedProjectId: 1,
    findProjectId: () => undefined,
    recurrenceTouched: false,
    repeatAfter: 0,
    repeatMode: 0,
    ...overrides,
  })

  it('文本里的时间段跟着任务一起保存', () => {
    const fields = resolveComposerFields(input('整理房间 11月10日到11月15日'))
    expect(localDateOf(fields.span!.start_date)).toBe('2026-11-10')
    expect(localDateOf(fields.span!.end_date)).toBe('2026-11-15')
    expect(localDateOf(fields.dueDate!)).toBe('2026-11-15')
  })

  it('面板里手选的开始与结束压过文本', () => {
    const fields = resolveComposerFields(input('整理房间 11月10日到11月15日', {
      dueTouched: true,
      dueValue: dateOnlyDue('2026-12-20'),
      spanValue: { start_date: dateOnlyDue('2026-12-18'), end_date: dateOnlyDue('2026-12-20') },
    }))
    expect(localDateOf(fields.span!.start_date)).toBe('2026-12-18')
    expect(localDateOf(fields.span!.end_date)).toBe('2026-12-20')
  })

  it('手选时关掉时间段就不再写开始与结束日期', () => {
    const fields = resolveComposerFields(input('整理房间 11月10日到11月15日', {
      dueTouched: true,
      dueValue: dateOnlyDue('2026-12-20'),
      spanValue: { start_date: null, end_date: null },
    }))
    expect(fields.span).toBeNull()
  })
})
