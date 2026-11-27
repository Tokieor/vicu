import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useMatches } from '@tanstack/react-router'
import { api } from '@/lib/api'
import { COMPLETED_TASKS_SHOWN, completedTaskRows } from '@/lib/completed-tasks'
import { useCompletedTasksStore } from '@/stores/completed-tasks-store'
import { useAppConfig } from './use-app-config'
import type { Task } from '@/lib/vikunja-types'

/**
 * The project's finished tasks, for the section at the end of its list (setting
 * `show_completed_tasks`). Nothing is asked of the server while the setting is off.
 *
 * The completed tasks are their own query: the list itself stays `done = false`, so a completion
 * never has to move a row through the sort order of the open tasks, and the section is capped at
 * `COMPLETED_TASKS_SHOWN`. `openTasks` is the list as drawn: a row just completed still sits there
 * (the completion hold) and must not also appear here.
 */
export function useProjectCompletedTasks(
  projectId: number | undefined,
  viewId: number | undefined,
  openTasks: readonly Task[],
) {
  const { data: appConfig } = useAppConfig()
  const enabled = appConfig?.show_completed_tasks === true
  const matches = useMatches()
  const pathname = matches[matches.length - 1]?.pathname ?? ''
  const completed = useCompletedTasksStore((s) => s.tasks)

  const query = useQuery({
    queryKey: ['view-tasks-done', projectId, viewId, COMPLETED_TASKS_SHOWN],
    queryFn: async () => {
      // One page only, the newest completions: `page` keeps the request from walking every page of
      // an old project. One row over the limit tells the section there are older ones.
      const result = await api.fetchViewTasks(projectId!, viewId!, {
        filter: 'done = true',
        sort_by: 'done_at',
        order_by: 'desc',
        per_page: COMPLETED_TASKS_SHOWN + 1,
        page: 1,
      })
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: enabled && !!projectId && !!viewId,
    staleTime: 60_000,
  })

  const rows = useMemo(() => {
    if (!enabled) return []
    const openIds = new Set(openTasks.map((task) => task.id))
    // A finished subtask drawn under its open parent is already on screen (expandable subtasks).
    const nestedIds = new Set<number>()
    if (appConfig?.subtask_display === 'expandable') {
      for (const task of openTasks) {
        for (const child of task.related_tasks?.subtask ?? []) nestedIds.add(child.id)
      }
    }
    return completedTaskRows(query.data ?? [], completed, openIds, pathname, projectId, nestedIds)
  }, [enabled, query.data, completed, openTasks, pathname, projectId, appConfig?.subtask_display])

  return {
    rows,
    enabled,
    /** The project has more finished tasks than the section shows. */
    hasMore: (query.data?.length ?? 0) > COMPLETED_TASKS_SHOWN,
  }
}
