import { describe, expect, it, vi } from 'vitest'
import { createWindowActivator, type ActivatableWindow } from '../notification-activation'

interface FakeWindow extends ActivatableWindow {
  calls: string[]
  sent: Array<[string, unknown]>
  /** 模拟页面加载完成：把排队中的 did-finish-load 监听器放出来。 */
  finishLoad(): void
}

function fakeWindow(options: { loading?: boolean; minimized?: boolean } = {}): FakeWindow {
  let loading = options.loading ?? false
  let minimized = options.minimized ?? false
  const loadListeners: Array<() => void> = []
  const calls: string[] = []
  const sent: Array<[string, unknown]> = []

  const win: FakeWindow = {
    calls,
    sent,
    isDestroyed: () => calls.includes('destroyed'),
    show: () => calls.push('show'),
    isMinimized: () => minimized,
    restore: () => {
      minimized = false
      calls.push('restore')
    },
    focus: () => calls.push('focus'),
    webContents: {
      isLoading: () => loading,
      send: (channel, payload) => sent.push([channel, payload]),
      once: (_event, listener) => loadListeners.push(listener),
    },
    finishLoad: () => {
      loading = false
      for (const listener of loadListeners.splice(0)) listener()
    },
  }
  return win
}

describe('createWindowActivator', () => {
  it('brings an existing window forward without recreating it', () => {
    const activator = createWindowActivator()
    const win = fakeWindow({ minimized: true })
    const recreate = vi.fn(() => fakeWindow())
    activator.setWindow(win)
    activator.setRecreate(recreate)

    expect(activator.activate()).toBe(win)
    expect(recreate).not.toHaveBeenCalled()
    expect(win.calls).toEqual(['show', 'restore', 'focus'])
  })

  it('recreates the window after the user closed it, then remembers it', () => {
    const activator = createWindowActivator()
    const closed = fakeWindow()
    const reopened = fakeWindow()
    closed.calls.push('destroyed')
    const recreate = vi.fn(() => reopened)
    activator.setWindow(closed)
    activator.setRecreate(recreate)

    expect(activator.activate()).toBe(reopened)
    expect(recreate).toHaveBeenCalledTimes(1)
    expect(reopened.calls).toEqual(['show', 'focus'])

    // 第二次点击直接复用重建出来的窗口，不再重复造。
    activator.activate()
    expect(recreate).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there is no window and no way to rebuild one', () => {
    const activator = createWindowActivator()
    expect(activator.activate()).toBeNull()
    expect(() => activator.navigate('navigate', '/plan')).not.toThrow()
  })

  it('sends a navigation straight away into a loaded window', () => {
    const activator = createWindowActivator()
    const win = fakeWindow()
    activator.setWindow(win)

    activator.navigate('navigate-to-task', 42)
    expect(win.sent).toEqual([['navigate-to-task', 42]])
  })

  it('holds the navigation until a recreated window finishes loading', () => {
    const activator = createWindowActivator()
    const opened = fakeWindow({ loading: true })
    activator.setRecreate(() => opened)

    activator.navigate('navigate', '/routines')
    // 渲染进程的监听器还没挂上，此时发出去等于丢掉。
    expect(opened.sent).toEqual([])
    expect(opened.calls).toEqual(['show', 'focus'])

    opened.finishLoad()
    expect(opened.sent).toEqual([['navigate', '/routines']])
  })

  it('drops the navigation when the window vanished before it loaded', () => {
    const activator = createWindowActivator()
    const opened = fakeWindow({ loading: true })
    activator.setRecreate(() => opened)

    activator.navigate('navigate', '/plan')
    opened.calls.push('destroyed')
    opened.finishLoad()

    expect(opened.sent).toEqual([])
  })
})
