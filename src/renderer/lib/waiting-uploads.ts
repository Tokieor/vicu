import type { OfflineFailedItemView, OfflineQueueItemView, OfflineQueueSnapshot } from '../../shared/offline-queue-types'
// 主进程的离线附件测试也会 import 这个模块，所以走 shared 的 t（不依赖 DOM 与 React）
import { t } from '../../shared/i18n'

/**
 * Files attached while the server could not be reached (issue 104): the words the app uses for them,
 * the same as the phone's `WaitingUploadText`, and the task's waiting and failed uploads from the
 * offline queue's snapshot.
 *
 * 这些句子都在运行时拼出来，编译期插桩够不到，所以每条都手写 t()。
 */

/** The toast after a file was kept for later. */
export function queuedUploadText(fileName: string): string {
  return t("{0} uploads when you're back online", fileName)
}

/** One toast for several files kept for later. */
export function queuedUploadsText(names: readonly string[]): string {
  return names.length === 1 ? queuedUploadText(names[0]) : t("{0} files upload when you're back online", names.length)
}

export interface WaitingUpload {
  /** The queued or failed action, for Remove and Retry. */
  id: string
  name: string
  inline: boolean
  failed: boolean
  /** Why the server refused it (failed only). */
  error?: string
  /** False when sending it again cannot help (larger than the server accepts). */
  canRetry: boolean
}

/** The line under the file name in the task's attachments. */
export function waitingUploadStatus(upload: WaitingUpload): string {
  if (upload.failed) return t('Not uploaded: {0}', upload.error || t('the server refused it'))
  return upload.inline ? t('Waiting to upload · goes into the notes') : t('Waiting to upload')
}

/** The task's uploads that wait in the queue or were refused, oldest first. */
export function waitingUploadsFor(snapshot: OfflineQueueSnapshot | null, taskId: number): WaitingUpload[] {
  if (!snapshot) return []
  const pending = snapshot.pending
    .filter((item): item is OfflineQueueItemView & { upload: NonNullable<OfflineQueueItemView['upload']> } =>
      item.type === 'upload-attachment' && item.taskId === taskId && !!item.upload)
    .map((item) => ({ id: item.id, name: item.upload.name, inline: item.upload.inline, failed: false, canRetry: true }))
  const failed = snapshot.failed
    .filter((item): item is OfflineFailedItemView & { upload: NonNullable<OfflineFailedItemView['upload']> } =>
      item.type === 'upload-attachment' && item.taskId === taskId && !!item.upload)
    .map((item) => ({
      id: item.id,
      name: item.upload.name,
      inline: item.upload.inline,
      failed: true,
      error: item.reason === 'too-large' ? t('more than the server accepts') : item.error,
      canRetry: item.reason !== 'too-large',
    }))
  return [...pending, ...failed]
}
