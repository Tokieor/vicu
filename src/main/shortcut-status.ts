export interface ShortcutRegistrationInput {
  entryEnabled: boolean
  viewerEnabled: boolean
  entryRegistered: boolean
  viewerRegistered: boolean
  isWaylandSession: boolean
  /**
   * 全局「唤醒主窗口」快捷键。它默认就是开着的（空字符串才是关闭），所以
   * `wakeEnabled` 缺省不传时按「没开」处理，老调用点不改也能编译。
   */
  wakeEnabled?: boolean
  wakeRegistered?: boolean
}

export interface ShortcutStatus {
  entry: boolean
  viewer: boolean
  /** 唤醒快捷键注册成功（关闭时为 false）。 */
  wake: boolean
  /** True only when an enabled shortcut failed to register on Wayland. */
  waylandLimited: boolean
}

/**
 * Derive shortcut status for Settings. On Electron 44+, Wayland uses the
 * GlobalShortcuts portal and can bind globally after consent — so we only
 * flag `waylandLimited` when an enabled shortcut actually failed to register.
 */
export function buildShortcutStatus(input: ShortcutRegistrationInput): ShortcutStatus {
  const entry = input.entryEnabled ? input.entryRegistered : false
  const viewer = input.viewerEnabled ? input.viewerRegistered : false
  const wakeEnabled = input.wakeEnabled === true
  const wake = wakeEnabled ? input.wakeRegistered === true : false

  const entryFailed = input.entryEnabled && !input.entryRegistered
  const viewerFailed = input.viewerEnabled && !input.viewerRegistered
  const wakeFailed = wakeEnabled && !wake
  const waylandLimited = input.isWaylandSession && (entryFailed || viewerFailed || wakeFailed)

  return { entry, viewer, wake, waylandLimited }
}
