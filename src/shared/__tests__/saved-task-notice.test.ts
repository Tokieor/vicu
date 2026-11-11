import { afterEach, describe, expect, it } from 'vitest'
import { formatDateDisplay, type DateFormat } from '../date-display'
import { setLocale } from '../i18n'
import { savedTaskNotice } from '../saved-task-notice'

// Quick Entry 关窗之后唯一的结果反馈（src/main/notifications.ts 负责把它弹出来）。
// 这里只验文案与拼装规则：日期怎么说是 date-display 的事，别在这个测试里重写一遍。

const fmt: DateFormat = { locale: 'en-US', hour12: false }
const now = new Date(2026, 10, 11, 9, 0) // 11 月 11 日 09:00（本地时间）
const tomorrow3pm = new Date(2026, 10, 12, 15, 0).toISOString()
const dateOnlyToday = new Date(2026, 10, 11, 23, 59, 59, 0).toISOString()

afterEach(() => setLocale('en'))

describe('savedTaskNotice', () => {
  it('says the task was added, with the title on the first line', () => {
    const notice = savedTaskNotice({ title: '开会 工作', dueDate: null, queued: false }, fmt, now)
    expect(notice.title).toBe('Task added')
    expect(notice.body).toBe('开会 工作')
  })

  it('phrases the due date the way the window chip did', () => {
    const notice = savedTaskNotice({ title: '开会 工作', dueDate: tomorrow3pm, queued: false }, fmt, now)
    const chip = formatDateDisplay('chip', new Date(tomorrow3pm), now, false, fmt)
    expect(notice.body).toBe(`开会 工作\nDue ${chip}`)
    expect(chip).toContain('15:00')
  })

  it('leaves the time out of a date-only task', () => {
    const notice = savedTaskNotice({ title: '写周报', dueDate: dateOnlyToday, queued: false }, fmt, now)
    const chip = formatDateDisplay('chip', new Date(dateOnlyToday), now, true, fmt)
    expect(notice.body).toBe(`写周报\nDue ${chip}`)
    expect(chip).not.toContain('23:59')
  })

  it('says it was saved offline when the create had to be queued', () => {
    const notice = savedTaskNotice({ title: '开会 工作', dueDate: tomorrow3pm, queued: true }, fmt, now)
    expect(notice.title).toBe('Saved offline — will sync when connected')
    expect(notice.body.split('\n')[0]).toBe('开会 工作')
  })

  it('ignores a missing or unparseable due date instead of showing an empty line', () => {
    for (const dueDate of [null, '', '0001-01-01T00:00:00Z', 'not a date']) {
      expect(savedTaskNotice({ title: '写周报', dueDate, queued: false }, fmt, now).body).toBe('写周报')
    }
  })

  it('is translated', () => {
    setLocale('zh')
    const notice = savedTaskNotice({ title: '开会 工作', dueDate: tomorrow3pm, queued: false }, { locale: 'zh-CN', hour12: false }, now)
    expect(notice.title).toBe('已添加任务')
    expect(notice.body.split('\n')[0]).toBe('开会 工作')
    expect(notice.body.split('\n')[1].startsWith('截止 ')).toBe(true)
    expect(savedTaskNotice({ title: '开会', dueDate: null, queued: true }, { locale: 'zh-CN', hour12: false }, now).title)
      .toBe('已离线保存 —— 联网后自动同步')
  })
})
