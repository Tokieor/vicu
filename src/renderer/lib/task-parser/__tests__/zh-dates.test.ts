// 中文自然语言时间解析的用例。基准时刻是 2026-11-11（周三）09:00 本地时间。
import { describe, expect, it } from 'vitest'
import { toLocalDate } from '../../due-dates'
import { parseTimeText, parseWhenText } from '../../when-logic'
import { DEFAULT_PARSER_CONFIG, parse, spanFields } from '../index'
import { parseChineseNumber, parseZhClock, parseZhDate } from '../zh-dates'

const NOW = new Date(2026, 10, 11, 9, 0, 0)
// 中文语法是「中文」模式独有的；DEFAULT_PARSER_CONFIG 是 Todoist，读不出中文。
const ZH = { enabled: true, syntaxMode: 'zh' } as const
const day = (date: Date | null) => (date ? toLocalDate(date) : null)
const clock = (date: Date | null) => (date ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : null)

/** 断言一次解析的日期、时刻与标记。 */
function expectParse(text: string, expected: { date: string; time?: string; hasTime?: boolean; notes?: string[] }) {
  const match = parseZhDate(text, NOW)
  expect(match, `应该解析出时间：${text}`).not.toBeNull()
  expect(day(match!.date)).toBe(expected.date)
  if (expected.time !== undefined) expect(clock(match!.date)).toBe(expected.time)
  if (expected.hasTime !== undefined) expect(match!.hasTime).toBe(expected.hasTime)
  if (expected.notes) {
    for (const note of expected.notes) expect(match!.notes).toContain(note)
  }
}

describe('中文数字', () => {
  it('认阿拉伯数字与中文数字', () => {
    expect(parseChineseNumber('15')).toBe(15)
    expect(parseChineseNumber('零')).toBe(0)
    expect(parseChineseNumber('两')).toBe(2)
    expect(parseChineseNumber('七')).toBe(7)
    expect(parseChineseNumber('十')).toBe(10)
    expect(parseChineseNumber('十二')).toBe(12)
    expect(parseChineseNumber('二十')).toBe(20)
    expect(parseChineseNumber('三十')).toBe(30)
    expect(parseChineseNumber('四十五')).toBe(45)
    expect(parseChineseNumber('五十九')).toBe(59)
  })

  it('读不出来就返回 null', () => {
    expect(parseChineseNumber('')).toBeNull()
    expect(parseChineseNumber('第')).toBeNull()
    expect(parseChineseNumber('十一二')).toBeNull()
  })
})

describe('需求里的三个例子', () => {
  it('今天十二点十分 → 今天 12:10', () => {
    expectParse('今天十二点十分', { date: '2026-11-11', time: '12:10', hasTime: true, notes: ['assumed-24-hour'] })
  })

  it('今天10点30 → 今天 10:30', () => {
    expectParse('今天10点30', { date: '2026-11-11', time: '10:30', hasTime: true })
  })

  it('明天下午1点半 → 明天 13:30', () => {
    expectParse('明天下午1点半', { date: '2026-11-12', time: '13:30', hasTime: true })
  })
})

describe('相对日期', () => {
  it('今天 / 明天 / 后天 / 大后天', () => {
    expectParse('今天8点', { date: '2026-11-11', time: '08:00' })
    expectParse('明天8点', { date: '2026-11-12', time: '08:00' })
    expectParse('后天8点', { date: '2026-11-13', time: '08:00' })
    expectParse('大后天8点', { date: '2026-11-14', time: '08:00' })
  })

  it('口语变体：今日 / 明儿 / 今儿', () => {
    expectParse('今日下午4点', { date: '2026-11-11', time: '16:00' })
    expectParse('明儿上午10点', { date: '2026-11-12', time: '10:00' })
  })

  it('N 天后 / N 周后 / N 个月后', () => {
    expectParse('3天后', { date: '2026-11-14', hasTime: false })
    expectParse('十天后', { date: '2026-11-21', hasTime: false })
    expectParse('两周后', { date: '2026-11-25', hasTime: false })
    expectParse('三个星期以后', { date: '2026-12-02', hasTime: false })
    expectParse('2个月后', { date: '2027-01-11', hasTime: false })
  })

  it('下个月 / 下个月5号', () => {
    expectParse('下个月', { date: '2026-12-11', hasTime: false })
    expectParse('下个月5号', { date: '2026-12-05', hasTime: false })
  })

  it('本周内已过的日期落到下周', () => {
    // 基准是周三：周五在三天后，周一已经过去，所以「周一」是下周一。
    expectParse('周五下午3点', { date: '2026-11-13', time: '15:00' })
    expectParse('周一上午9点', { date: '2026-11-16', time: '09:00' })
    expectParse('这周一上午9点', { date: '2026-11-09', time: '09:00' })
    expectParse('下周一上午9点', { date: '2026-11-16', time: '09:00' })
    expectParse('下下周三上午9点', { date: '2026-11-25', time: '09:00' })
  })

  it('周末是本周六，过了就是下周六', () => {
    expectParse('周末', { date: '2026-11-14', hasTime: false })
    expectParse('这周末下午2点', { date: '2026-11-14', time: '14:00' })
  })

  it('下周（没有周几）落到下周一', () => {
    expectParse('下周下午3点', { date: '2026-11-16', time: '15:00' })
  })

  it('月日与年份', () => {
    expectParse('11月20日', { date: '2026-11-20', hasTime: false })
    expectParse('11月20号下午3点半', { date: '2026-11-20', time: '15:30' })
    // 已过去的月日按明年算（forwardDate）。
    expectParse('10月20日', { date: '2027-10-20', hasTime: false })
    expectParse('2026年12月1日', { date: '2026-12-01', hasTime: false })
    expectParse('2027年1月1日早上8点', { date: '2027-01-01', time: '08:00' })
  })

  it('单独的「5号」：本月已过就下月', () => {
    expectParse('5号', { date: '2026-12-05', hasTime: false })
    expectParse('20号', { date: '2026-11-20', hasTime: false })
  })
})

describe('时段与时刻', () => {
  it('时段把 12 小时制换成 24 小时制', () => {
    expectParse('明天凌晨2点', { date: '2026-11-12', time: '02:00' })
    expectParse('明天早上7点', { date: '2026-11-12', time: '07:00' })
    expectParse('明天上午10点', { date: '2026-11-12', time: '10:00' })
    expectParse('明天中午12点', { date: '2026-11-12', time: '12:00' })
    expectParse('明天中午1点', { date: '2026-11-12', time: '13:00' })
    expectParse('明天下午6点', { date: '2026-11-12', time: '18:00' })
    expectParse('明天傍晚7点', { date: '2026-11-12', time: '19:00' })
    expectParse('明天晚上9点', { date: '2026-11-12', time: '21:00' })
    expectParse('明天夜里11点', { date: '2026-11-12', time: '23:00' })
  })

  it('整点 / 半点 / 一刻 / 三刻', () => {
    expectParse('明天下午3点整', { date: '2026-11-12', time: '15:00' })
    expectParse('明天下午3点半', { date: '2026-11-12', time: '15:30' })
    expectParse('后天早上7点一刻', { date: '2026-11-13', time: '07:15' })
    expectParse('大后天晚上9点三刻', { date: '2026-11-14', time: '21:45' })
  })

  it('分钟的各种写法', () => {
    expectParse('明天15点20分', { date: '2026-11-12', time: '15:20' })
    expectParse('明天15点20', { date: '2026-11-12', time: '15:20' })
    expectParse('明天三点零五分', { date: '2026-11-12', time: '03:05' })
    expectParse('明天十点三十分', { date: '2026-11-12', time: '10:30' })
    expectParse('明天10:30', { date: '2026-11-12', time: '10:30' })
    expectParse('明天10：30', { date: '2026-11-12', time: '10:30' })
  })

  it('中英混排：中文日期 + 英文时刻', () => {
    expectParse('明天 3pm', { date: '2026-11-12', time: '15:00' })
    expectParse('明天 3:30pm', { date: '2026-11-12', time: '15:30' })
    expectParse('明天 12am', { date: '2026-11-12', time: '00:00' })
  })

  it('今早 / 今晚 这类合成词', () => {
    expectParse('今晚8点', { date: '2026-11-11', time: '20:00' })
    expectParse('明早7点', { date: '2026-11-12', time: '07:00' })
    expectParse('明晚9点半', { date: '2026-11-12', time: '21:30' })
  })

  it('午夜十二点与晚上十二点', () => {
    // 「今晚12点」是今天的结束，落在次日 00:00。
    expectParse('今晚12点', { date: '2026-11-12', time: '00:00', notes: ['midnight-next-day'] })
    // 「午夜12点」是当天零点，已过就落到明天零点。
    expectParse('午夜12点', { date: '2026-11-12', time: '00:00' })
  })

  it('只有时刻：今天已过就落到明天', () => {
    expectParse('下午3点', { date: '2026-11-11', time: '15:00' })
    expectParse('早上8点', { date: '2026-11-12', time: '08:00', notes: ['time-passed-tomorrow'] })
    expectParse('3点', { date: '2026-11-12', time: '03:00', notes: ['assumed-24-hour', 'time-passed-tomorrow'] })
  })

  it('只写时段不写小时：只确定日期，不猜时刻', () => {
    expectParse('明天下午', { date: '2026-11-12', hasTime: false, notes: ['date-only'] })
    expectParse('周三晚上', { date: '2026-11-11', hasTime: false, notes: ['date-only'] })
  })
})

describe('无法识别与过去表达', () => {
  it('过去的表达不是截止日期', () => {
    expect(parseZhDate('昨天下午3点', NOW)).toBeNull()
    expect(parseZhDate('前天', NOW)).toBeNull()
    expect(parseZhDate('上周三', NOW)).toBeNull()
  })

  it('没有时间信息、或只有时段，返回 null', () => {
    expect(parseZhDate('随便写点什么', NOW)).toBeNull()
    expect(parseZhDate('下午', NOW)).toBeNull()
    expect(parseZhDate('', NOW)).toBeNull()
  })

  it('不含汉字时直接交给英文解析器', () => {
    expect(parseZhDate('tomorrow 3pm', NOW)).toBeNull()
    expect(parseZhDate('15:30', NOW)).toBeNull()
  })

  it('「每周一」是重复规则，不当日期', () => {
    expect(parseZhDate('每周一开会', NOW)).toBeNull()
  })

  it('被其它解析器消费的区域不会重复解析', () => {
    // 标签、优先级先被摘走，日期解析只看剩下的文本。
    const result = parse('开会 @work p2 明天下午3点', ZH, NOW)
    expect(result.labels).toEqual(['work'])
    expect(result.priority).toBe(3)
    expect(result.title).toBe('开会')
    expect(day(result.dueDate)).toBe('2026-11-12')
  })
})

describe('只解析时刻（When 面板的自定义时间）', () => {
  it('中文时刻 → HH:mm', () => {
    expect(parseZhClock('3点半')).toBe('03:30')
    expect(parseZhClock('三点一刻')).toBe('03:15')
    expect(parseZhClock('下午3点')).toBe('15:00')
    expect(parseZhClock('晚上8点')).toBe('20:00')
    expect(parseZhClock('3点20')).toBe('03:20')
    expect(parseZhClock('十二点整')).toBe('12:00')
  })

  it('不是纯时刻就返回 null', () => {
    expect(parseZhClock('明天下午3点')).toBeNull()
    expect(parseZhClock('15:30')).toBeNull()
    expect(parseZhClock('下午')).toBeNull()
  })
})

describe('接进任务解析与文本选择', () => {
  it('标题里的中文时间被摘出来，剩下的进标题', () => {
    const result = parse('明天下午3点开会', ZH, NOW)
    expect(result.title).toBe('开会')
    expect(day(result.dueDate)).toBe('2026-11-12')
    expect(clock(result.dueDate)).toBe('15:00')
    expect(result.dueHasTime).toBe(true)
    expect(result.tokens.filter((token) => token.type === 'date')).toHaveLength(1)
  })

  it('日期与标签、优先级同时出现', () => {
    const result = parse('今天18:00 交周报 @work p2', ZH, NOW)
    expect(result.title).toBe('交周报')
    expect(day(result.dueDate)).toBe('2026-11-11')
    expect(clock(result.dueDate)).toBe('18:00')
    expect(result.labels).toEqual(['work'])
    expect(result.priority).toBe(3)
  })

  it('只写日期时是全天（hasTime = false）', () => {
    const result = parse('后天 买菜', ZH, NOW)
    expect(result.title).toBe('买菜')
    expect(day(result.dueDate)).toBe('2026-11-13')
    expect(result.dueHasTime).toBe(false)
  })

  it('英文输入的行为没有变化', () => {
    const result = parse('meeting tomorrow 3pm', DEFAULT_PARSER_CONFIG, NOW)
    expect(result.title).toBe('meeting')
    expect(day(result.dueDate)).toBe('2026-11-12')
    expect(clock(result.dueDate)).toBe('15:00')
  })

  it('中文句子中间的时间照样摘掉', () => {
    const result = parse('明天上午十点半和张总开会', ZH, NOW)
    expect(result.title).toBe('和张总开会')
    expect(day(result.dueDate)).toBe('2026-11-12')
    expect(clock(result.dueDate)).toBe('10:30')
  })

  it('没有时间信息的中文原样留在标题里', () => {
    const result = parse('写周报', ZH, NOW)
    expect(result.title).toBe('写周报')
    expect(result.dueDate).toBeNull()
  })

  it('另外两种语法模式一个字都不读中文', () => {
    for (const mode of ['todoist', 'vikunja'] as const) {
      const result = parse('明天下午3点开会', { enabled: true, syntaxMode: mode }, NOW)
      expect(result.title, mode).toBe('明天下午3点开会')
      expect(result.dueDate, mode).toBeNull()
      expect(result.tokens, mode).toEqual([])
    }
  })
})

describe('时间段', () => {
  const span = (text: string) => {
    const range = parseZhDate(text, NOW)?.range
    return range ? { from: day(range.from), to: day(range.to) } : null
  }

  it('两个日期中间一个「到」或「至」就是时间段，截止日期取结束那天', () => {
    expect(span('11月10日到11月15日')).toEqual({ from: '2026-11-10', to: '2026-11-15' })
    expect(span('11月10日至11月15日')).toEqual({ from: '2026-11-10', to: '2026-11-15' })
    // 开头已经过去也算：时间段本来就可以已经开始了。
    expect(day(parseZhDate('11月10日到11月15日', NOW)?.date ?? null)).toBe('2026-11-15')
    expect(parseZhDate('11月10日到11月15日', NOW)?.hasTime).toBe(false)
    expect(parseZhDate('11月10日到11月15日', NOW)?.notes).toContain('date-range')
  })

  it('缺月份的那一头按上下文补齐', () => {
    expect(span('11月25日到5日')).toEqual({ from: '2026-11-25', to: '2026-12-05' })
    expect(span('10号到15号')).toEqual({ from: '2026-11-10', to: '2026-11-15' })
    expect(span('明天到周五')).toEqual({ from: '2026-11-12', to: '2026-11-13' })
    expect(span('下周一至下周三')).toEqual({ from: '2026-11-16', to: '2026-11-18' })
  })

  it('短横线与波浪号也算连词', () => {
    expect(span('11月10日-11月15日')).toEqual({ from: '2026-11-10', to: '2026-11-15' })
    expect(span('周一~周五')).toEqual({ from: '2026-11-16', to: '2026-11-20' })
  })

  it('不是跨天时间段的写法：单个日期照旧，时刻区间现在按同一天读', () => {
    expect(span('11月15日')).toBeNull()
    expect(span('明天下午3点到5点')).toEqual({ from: '2026-11-12', to: '2026-11-12' })
    expect(parseZhDate('明天下午3点到5点', NOW)?.rangeClocked).toBe(true)
    // 连词后面不是日期（"到家"）就不算。
    expect(span('明天到家')).toBeNull()
  })

  it('任务文本里的时间段落到开始与结束日期，截止日期是结束那天', () => {
    const parsed = parse('整理房间 11月10日到11月15日', ZH, NOW)
    expect(parsed.title).toBe('整理房间')
    expect(day(parsed.dueDate)).toBe('2026-11-15')
    expect(parsed.span).not.toBeNull()
    expect(day(parsed.span!.start)).toBe('2026-11-10')
    expect(day(parsed.span!.end)).toBe('2026-11-15')
    // 英文模式（默认 Todoist）不读中文，更不会读成时间段。
    expect(parse('整理房间 11月10日到11月15日', DEFAULT_PARSER_CONFIG, NOW).span).toBeNull()
  })
})

describe('When 面板的文本输入', () => {
  it('parseWhenText 读中文日期与时刻', () => {
    const hit = parseWhenText('明天下午3点', NOW, undefined, null, true)
    expect(hit?.value).toEqual({ date: '2026-11-12', time: '15:00' })
    expect(parseWhenText('今天十二点十分', NOW, undefined, null, true)?.value).toEqual({ date: '2026-11-11', time: '12:10' })
    expect(parseWhenText('后天', NOW, undefined, null, true)?.value).toEqual({ date: '2026-11-13', time: null })
  })

  it('parseTimeText 读中文时刻，英文写法照旧', () => {
    expect(parseTimeText('三点半', true)).toBe('03:30')
    expect(parseTimeText('下午3点', true)).toBe('15:00')
    expect(parseTimeText('晚上8点', true)).toBe('20:00')
    expect(parseTimeText('15:30')).toBe('15:30')
    expect(parseTimeText('3pm')).toBe('15:00')
  })

  it('关掉中文语法后，手打的中文既不算日期也不算时刻', () => {
    expect(parseWhenText('明天下午3点', NOW)).toBeNull()
    expect(parseWhenText('明天下午3点', NOW, undefined, null, false)).toBeNull()
    expect(parseTimeText('三点半')).toBeNull()
    expect(parseTimeText('三点半', false)).toBeNull()
  })

  it('面板自己写的中文文本一定读得回来（与开关无关）', () => {
    // 中文界面写的是「今天，11月11日，13:05」；关掉中文语法后改时间再回车，日期不能丢。
    expect(parseWhenText('今天，11月11日，13:05', NOW, 'zh-CN', '2026-11-11')?.value).toEqual({ date: '2026-11-11', time: '13:05' })
    expect(parseWhenText('明天，11月12日，09:00', NOW, 'zh-CN', '2026-11-12')?.value).toEqual({ date: '2026-11-12', time: '09:00' })
  })
})

describe('同一天的时刻区间（下午一点到六点）', () => {
  const clockRange = (text: string) => {
    const hit = parseZhDate(text, NOW)
    return hit?.range ? { from: clock(hit.range.from), to: clock(hit.range.to), clocked: hit.rangeClocked } : null
  }

  it('第二个时刻继承第一个的时段词', () => {
    expect(clockRange('下午一点到六点')).toEqual({ from: '13:00', to: '18:00', clocked: true })
    expect(clockRange('下午一点至六点')).toEqual({ from: '13:00', to: '18:00', clocked: true })
    expect(clockRange('13:00至18:00')).toEqual({ from: '13:00', to: '18:00', clocked: true })
    expect(clockRange('9点到11点')).toEqual({ from: '09:00', to: '11:00', clocked: true })
  })

  it('写了日期时落在那一天，截止时刻是结束那个钟点', () => {
    expect(day(parseZhDate('明天下午1点到6点', NOW)?.date ?? null)).toBe('2026-11-12')
    expect(clock(parseZhDate('明天下午1点到6点', NOW)?.date ?? null)).toBe('18:00')
    expect(parseZhDate('下午一点到六点', NOW)?.notes).toContain('clock-range')
    expect(parseZhDate('下午一点到六点', NOW)?.hasTime).toBe(true)
  })

  it('结束不晚于开始、或超过 12 小时就不读成时刻区间', () => {
    expect(clockRange('下午6点到1点')).toBeNull()
    expect(clockRange('早上8点到晚上11点')).toBeNull()
  })

  it('任务标题里的时间段写成带时刻的 start_date / end_date', () => {
    const parsed = parse('下午一点到六点工作', ZH, NOW)
    expect(parsed.title).toBe('工作')
    const fields = spanFields(parsed)!
    expect(clock(new Date(fields.start_date))).toBe('13:00')
    expect(clock(new Date(fields.end_date))).toBe('18:00')
    expect(clock(parsed.dueDate)).toBe('18:00')
    expect(parse('下午一点到六点工作', DEFAULT_PARSER_CONFIG, NOW).span).toBeNull()
  })

  it('面板文本输入直接给出两端时刻', () => {
    const hit = parseWhenText('下午一点到六点', NOW, undefined, null, true)
    expect(hit?.value).toEqual({ date: '2026-11-11', time: '18:00', span: { start: '2026-11-11', time: '13:00' } })
    expect(hit?.span).toEqual({ start: '2026-11-11', end: '2026-11-11', startTime: '13:00', endTime: '18:00' })
    expect(parseWhenText('下午一点到六点', NOW, undefined, null, false)).toBeNull()
  })
})
