import { t } from '@/lib/i18n'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useHoldToTalk } from '@/hooks/use-hold-to-talk'

interface AddTaskButtonProps {
  onClick: () => void
  label?: string
  className?: string
}

/**
 * The quiet "New task" row at the end of a list. It lines up with the task rows (the plus sits where
 * their checkbox does) and turns into the composer in place when it is used. Holding it says a task
 * instead (docs/voice-input.md).
 */
export function AddTaskButton({ onClick, label = 'New task', className }: AddTaskButtonProps) {
  const holdToTalk = useHoldToTalk()
  // 默认 label 是英文原文，渲染期翻译才能跟随语言切换
  const text = t(label)
  return (
    <button
      type="button"
      onClick={onClick}
      {...holdToTalk}
      title="Click to type a task, hold to say it"
      className={cn(
        'flex w-full select-none items-center gap-3 px-4 py-2.5 text-left text-task-title text-text-secondary transition-colors duration-fade-fast hover:bg-bg-hover hover:text-text',
        className
      )}
      aria-label={text}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <Plus className="h-4 w-4" />
      </span>
      <span>{text}</span>
    </button>
  )
}
