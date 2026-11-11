import { isDateOnly, isNoDueDate } from './due-dates'
import { formatDateDisplay, type DateFormat } from './date-display'
import { t } from './i18n'

// 「任务已添加」这条系统通知的两行字：Quick Entry 小窗在创建成功后立刻关掉自己，
// 这条通知是用户唯一能看到的结果确认（main 里的 notifyTaskSavedFromQuickEntry 负责弹出来）。

/** 刚被创建出来的那个任务，通知要知道的全部信息。 */
export interface SavedTask {
  /** 任务的标题，已经去掉解析出来的日期、标签等部分。 */
  title: string
  /** 任务的到期时间（ISO 时间点，或 23:59:59 的「只有日期」值）；没有到期时间就是 null。 */
  dueDate: string | null
  /** 创建没能送到服务器、先落进了离线队列。 */
  queued: boolean
}

/** 通知的标题与正文：正文第一行是任务标题，第二行是到期时间（有的话）。 */
export interface SavedTaskNotice {
  title: string
  body: string
}

/**
 * 拼出这条通知。放到离线和在线两种情况下说的话不一样：在线说「已添加」，离线说「已保存，
 * 联网后同步」—— 离线时任务还不存在于服务器上，说「已添加」不准确。
 *
 * 到期时间用 `chip` 这一档的说法，和用户在小窗工具栏、chip 上刚看到的字完全一致
 * （src/shared/date-display.ts 第 8.3 节），语言与时钟制式由调用方传入。
 */
export function savedTaskNotice(task: SavedTask, fmt: DateFormat, now: Date = new Date()): SavedTaskNotice {
  const lines = [task.title]
  const due = dueLine(task.dueDate, fmt, now)
  if (due) lines.push(due)
  return {
    title: task.queued ? t('Saved offline \u2014 will sync when connected') : t('Task added'),
    body: lines.join('\n'),
  }
}

/** 「截止 明天，11月12日，15:00」；没有到期时间的任务不留空行。 */
function dueLine(dueDate: string | null, fmt: DateFormat, now: Date): string {
  if (isNoDueDate(dueDate)) return ''
  const value = new Date(dueDate as string)
  return t('Due {0}', formatDateDisplay('chip', value, now, isDateOnly(dueDate as string), fmt))
}
