// 项目列表末尾的「已完成」区：只收本项目自己的任务，最新的在前，且不与列表里的行重复。
// 设置 show_completed_tasks 打开时才有的区块（docs/design-system-v1.md）。

import { describe, expect, it } from 'vitest'
import { COMPLETED_TASKS_SHOWN, completedTaskRows } from '../completed-tasks'
import type { Task } from '../vikunja-types'
import type { CompletedTaskEntry } from '@/stores/completed-tasks-store'

const PATH = '/project/1'

function task(id: number, fields: Partial<Task> = {}): Task {
  return { id, done: true, project_id: 1, description: '', ...fields } as Task
}

function store(entries: CompletedTaskEntry[]): Map<number, CompletedTaskEntry> {
  return new Map(entries.map((entry) => [entry.task.id, entry]))
}

const open = (ids: number[] = []) => new Set(ids)

describe('completedTaskRows', () => {
  it('keeps the list order of the server (newest completion first)', () => {
    const rows = completedTaskRows([task(3), task(2), task(1)], store([]), open(), PATH, 1)
    expect(rows.map((t) => t.id)).toEqual([3, 2, 1])
  })

  it('puts a task that was just completed first, before the server rows', () => {
    const rows = completedTaskRows(
      [task(5), task(4)],
      store([{ task: task(9), path: PATH }]),
      open(),
      PATH,
      1,
    )
    expect(rows.map((t) => t.id)).toEqual([9, 5, 4])
  })

  it('leaves out a row that is still drawn as an open row (the completion hold)', () => {
    // The hold keeps the completed row in the list for a few seconds; it must not show twice.
    const rows = completedTaskRows([task(7)], store([{ task: task(7), path: PATH }]), open([7]), PATH, 1)
    expect(rows).toEqual([])
  })

  it('shows only this project: a subproject’s finished tasks stay in its own list', () => {
    const rows = completedTaskRows(
      [task(1, { project_id: 1 }), task(2, { project_id: 2 })],
      store([{ task: task(3, { project_id: 2 }), path: PATH }]),
      open(),
      PATH,
      1,
    )
    expect(rows.map((t) => t.id)).toEqual([1])
  })

  it('ignores what belongs to another page or is not done any more', () => {
    const rows = completedTaskRows(
      [task(1, { done: false })],
      store([
        { task: task(2), path: '/project/9' },
        { task: task(3, { done: false }), path: PATH },
      ]),
      open(),
      PATH,
      1,
    )
    expect(rows).toEqual([])
  })

  it('leaves out a subtask completed with its parent, and hidden tasks', () => {
    const hidden = task(4, { description: '<!-- vicu-prefs: {} -->' })
    const rows = completedTaskRows(
      [task(1), hidden],
      store([{ task: task(2), path: PATH, suppressTopLevelUndo: true }]),
      open(),
      PATH,
      1,
    )
    expect(rows.map((t) => t.id)).toEqual([1])
  })

  it('leaves out a finished subtask its open parent already draws', () => {
    // Expandable subtasks: the child is under the parent row, so the tail would repeat it.
    const rows = completedTaskRows([task(1), task(2)], store([]), open(), PATH, 1, new Set([2]))
    expect(rows.map((t) => t.id)).toEqual([1])
  })

  it('keeps a whole page of tasks, and never more than the limit', () => {
    const many = Array.from({ length: COMPLETED_TASKS_SHOWN + 5 }, (_, i) => task(i + 1))
    expect(completedTaskRows(many, store([]), open(), PATH, 1)).toHaveLength(COMPLETED_TASKS_SHOWN)
  })
})
