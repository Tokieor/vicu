// 渲染进程侧的 i18n 入口：在 shared/i18n 之上补上持久化与 React 订阅。
// 所有被编译期插桩的组件都从这里 import t（见 scripts/i18n-vite-plugin.mjs）。
import { useEffect, useState } from 'react'

import {
  getLocale,
  isLocale,
  setLocale as setLocaleRuntime,
  subscribeLocale,
  t,
  type Locale,
} from '../../shared/i18n'

export { getLocale, isLocale, subscribeLocale, t, LOCALES, LOCALE_LABELS, TRANSLATION_COUNT, hasTranslation } from '../../shared/i18n'
export type { Locale }

const STORAGE_KEY = 'vicu.locale'

function systemLocale(): Locale {
  try {
    return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

/** 已保存的语言；没有保存过就跟随系统（首次启动）。 */
export function storedLocale(): Locale {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (isLocale(value)) return value
  } catch {
    // 隐私模式等场景下 localStorage 可能不可用
  }
  return systemLocale()
}

/** 通知主进程：应用菜单在那边构建，得跟着一起变。 */
function notifyMain(locale: Locale): void {
  try {
    void window.api?.setLocale?.(locale)
  } catch {
    // 测试环境没有 preload 桥，忽略
  }
}

/** 在首屏渲染前调用，让第一次绘制就是正确的语言。 */
export function initLocale(): Locale {
  const locale = storedLocale()
  setLocaleRuntime(locale)
  notifyMain(locale)
  return locale
}

/** 切换语言：写盘 + 通知订阅者（根组件据此重新挂载整棵树）+ 同步主进程菜单。 */
export function changeLocale(next: Locale): void {
  if (!isLocale(next)) return
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // 写不进去也不影响本次会话
  }
  setLocaleRuntime(next)
  notifyMain(next)
}

/** 订阅当前语言，语言变化时组件重新渲染。 */
export function useLocale(): Locale {
  const [locale, setLocalLocale] = useState<Locale>(getLocale)
  useEffect(() => subscribeLocale(setLocalLocale), [])
  return locale
}
