// 主进程与渲染进程共用的快捷键默认值。
//
// 平台由调用方传入：主进程读 process.platform，渲染进程读 window.api.platform，
// 这样同一个模块在两边都能用，也不会被 import 时机绑死在某一个平台上。

/**
 * 「唤醒主窗口」全局快捷键的默认值。
 *
 * 和快速录入（Alt+Shift+V）/ 快速查看（Alt+Shift+B）凑成同一组组合键，
 * 但用 M（main window）区分，默认值之间不会互相抢占。
 */
export function defaultWakeHotkey(isMac: boolean): string {
  return isMac ? 'Command+Shift+M' : 'Alt+Shift+M'
}

/**
 * 两个 Electron accelerator 是否是同一个组合键。
 *
 * 用户录出来的顺序固定（Ctrl+Alt+Shift+Key），但配置文件可能被手改或由
 * 旧版本写入（Shift+Alt+M 之类），所以在比较前先拆开、归一化、排序。
 */
export function sameAccelerator(a: string, b: string): boolean {
  return normalizeAccelerator(a) === normalizeAccelerator(b)
}

function normalizeAccelerator(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('+')
}
