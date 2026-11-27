// The "Completed" tail of a project's list (setting `show_completed_tasks`, docs/design-system-v1.md).
// A project shows only its own finished tasks: the ones of a subproject live in the subproject's own
// list, so nothing here reaches into sections.

import { hasVicuMetadataMarker } from './metadata-tasks'
import type { Task } from './vikunja-types'
import type { CompletedTaskEntry } from '@/stores/completed-tasks-store'

/**
 * How many completed tasks one project shows. An old project can have thousands; the section is a
 * glance back at what just got done, not the Logbook. One extra row is asked of the server so a full
 * page can say there are more.
 */
export const COMPLETED_TASKS_SHOWN = 50

const EMPTY_IDS: ReadonlySet<number> = new Set()

/**
 * The rows of a project's completed section, newest first.
 *
 * - `serverDone`: the project's list view queried `done = true`, sorted by `done_at desc`.
 * - `completed`: the completion hold's entries. A task completed a moment ago is not on the server
 *   list yet (the query is not refetched on every completion), and its row may still be in the list.
 * - `openIds`: ids drawn as open rows. A held row is in both, and must not be drawn twice; the row
 *   joins this section once the hold lets it go.
 * - `nestedIds`: finished subtasks that an open row already draws under itself (`subtask_display`
 *   expandable). They are on screen; the tail would be the same task twice.
 *
 * A subtask completed along with its parent (`suppressTopLevelUndo`) stays inside the parent, and a
 * hidden task never shows (cross-app semantics 10.1).
 */
export function completedTaskRows(
  serverDone: readonly Task[],
  completed: ReadonlyMap<number, CompletedTaskEntry>,
  openIds: ReadonlySet<number>,
  pathname: string,
  projectId: number | undefined,
  nestedIds: ReadonlySet<number> = EMPTY_IDS,
): Task[] {
  const rows: Task[] = []
  const seen = new Set<number>()

  const take = (task: Task) => {
    if (!task.done || seen.has(task.id)) return
    // A row still on screen as an open (just completed) row belongs to the list, not here.
    if (openIds.has(task.id) || nestedIds.has(task.id)) return
    if (projectId !== undefined && task.project_id !== projectId) return
    if (hasVicuMetadataMarker(task.description)) return
    seen.add(task.id)
    rows.push(task)
  }

  // Just-completed first: newer than anything the server list has answered with.
  for (const entry of completed.values()) {
    if (entry.suppressTopLevelUndo) continue
    if (entry.path !== pathname) continue
    take(entry.task)
  }
  for (const task of serverDone) take(task)

  return rows.slice(0, COMPLETED_TASKS_SHOWN)
}
