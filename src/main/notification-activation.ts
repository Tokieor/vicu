/**
 * 「点通知把主窗口叫回来」这一段。
 *
 * 为什么要单独一层：窗口被关掉之后进程还可能活着（关闭到托盘 / 快捷录入常驻），此时
 * BrowserWindow 已经 destroyed，旧的 showMainWindow 只会对着一个死引用 show()，点击
 * 通知就等于什么都没发生。重建窗口的路径在 index.ts 里（它要读配置、重挂事件），
 * 所以这里用注入的 recreate 回调，既解开循环依赖，也方便单测喂假窗口（D-NOTIF-4）。
 */

/** 通知点击只用到这几个成员，收窄成接口，单测不必造整个 BrowserWindow。 */
export interface ActivatableWindow {
  isDestroyed(): boolean
  show(): void
  isMinimized(): boolean
  restore(): void
  focus(): void
  webContents: {
    isLoading(): boolean
    send(channel: string, payload: unknown): void
    once(event: 'did-finish-load', listener: () => void): void
  }
}

/** 主进程发给渲染进程、需要「窗口活过来之后」再发的导航频道。 */
export type NavigationChannel = 'navigate' | 'navigate-to-task'

export interface WindowActivator {
  /** 记住当前主窗口；传 null 表示它已经不在了。 */
  setWindow(win: ActivatableWindow | null): void
  /** 窗口被关掉后怎么再造一个；由 index.ts 提供。 */
  setRecreate(recreate: (() => ActivatableWindow | null) | null): void
  /** 把主窗口叫到前台，必要时重建；返回可用的窗口，失败返回 null。 */
  activate(): ActivatableWindow | null
  /** 叫起窗口并在里面跳转。窗口不在又重建不了时静默放弃。 */
  navigate(channel: NavigationChannel, payload: string | number): void
}

export function createWindowActivator(): WindowActivator {
  let current: ActivatableWindow | null = null
  let recreate: (() => ActivatableWindow | null) | null = null

  const activate = (): ActivatableWindow | null => {
    let win = current && !current.isDestroyed() ? current : null
    if (!win) {
      // 没有窗口就不装样子：recreate 缺失说明这个运行方式下本来就没有回来的路。
      win = recreate?.() ?? null
      if (!win) return null
      current = win
    }
    // 隐藏到托盘的窗口：show 之后还要恢复最小化状态，否则只是任务栏里多个条目。
    win.show()
    if (win.isMinimized()) win.restore()
    win.focus()
    return win
  }

  const navigate = (channel: NavigationChannel, payload: string | number): void => {
    const win = activate()
    if (!win) return
    const send = (): void => {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
    // 刚重建的窗口还在加载，渲染进程的监听器要等 React 挂上才存在；这时发出去等于丢弃。
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
    else send()
  }

  return {
    setWindow: (win) => {
      current = win
    },
    setRecreate: (fn) => {
      recreate = fn
    },
    activate,
    navigate,
  }
}
