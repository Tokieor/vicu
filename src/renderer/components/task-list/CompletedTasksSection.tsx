import { ListSectionHeader } from './ListSectionHeader'
import { TaskRowGroup } from './TaskRowGroup'
import { TaskRow } from './TaskRow'
import { t } from '@/lib/i18n'
import type { Task } from '@/lib/vikunja-types'

interface CompletedTasksSectionProps {
  tasks: Task[]
  /** The project has more finished tasks than the section shows. */
  hasMore?: boolean
}

/**
 * The finished tasks at the end of a project's list (setting `show_completed_tasks`). They are
 * ordinary rows, struck through: checking one again reopens it, and it joins the open list above.
 * A project shows only its own; a subproject's finished tasks are in the subproject's own list.
 */
export function CompletedTasksSection({ tasks, hasMore }: CompletedTasksSectionProps) {
  if (tasks.length === 0) return null
  return (
    <section aria-label={t('Completed')} className="mt-4 pb-2">
      <ListSectionHeader
        level={1}
        title="Completed"
        count={tasks.length}
        sticky={false}
        className="mb-1 px-4 text-text-secondary"
      />
      <TaskRowGroup>
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </TaskRowGroup>
      {hasMore && (
        <p className="px-4 pt-2 text-caption text-text-secondary">
          {t('Only the {0} most recent are shown', tasks.length)}
        </p>
      )}
    </section>
  )
}
