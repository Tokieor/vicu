// Vicu 的轻量 i18n 运行时（主进程与渲染进程共用）。
//
// 设计要点：
//   - key 就是英文原文，而不是人造的 key。这样源码里原有的英文可以直接当 key，
//     编译期（scripts/i18n-vite-plugin.mjs）只把「字典里存在的」文案包成 t()，
//     英文模式下 t() 原样返回 key，行为与汉化前完全一致。
//   - 模板字符串的 ${expr} 在字典里归一化为 {0} {1}，t(key, ...args) 负责回填。
//   - 语言状态是模块级变量，渲染进程切换语言后由根组件重新挂载整棵树（见 main.tsx）。
import { ZH } from './zh'

export type Locale = 'en' | 'zh'

export const LOCALES: readonly Locale[] = ['en', 'zh'] as const

/** 各语言在设置页里的自称，不参与翻译。 */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  zh: '简体中文',
}

let current: Locale = 'en'
const listeners = new Set<(locale: Locale) => void>()

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'zh'
}

export function getLocale(): Locale {
  return current
}

/** 切换语言，并通知订阅者（渲染进程据此重新挂载、主进程据此重建菜单）。 */
export function setLocale(next: Locale): void {
  if (!isLocale(next) || next === current) return
  current = next
  for (const listener of listeners) {
    try {
      listener(next)
    } catch {
      // 单个订阅者出错不影响其他人
    }
  }
}

export function subscribeLocale(listener: (locale: Locale) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const PLACEHOLDER = /\{(\d+)\}/g

/**
 * 翻译一段英文文案。字典没命中时原样返回，所以未翻译的文案会保持英文，
 * 不会出现空字符串或 undefined。
 */
export function t(key: string, ...args: unknown[]): string {
  if (current === 'en') return key
  const hit = ZH[key]
  if (hit === undefined) return key
  if (args.length === 0) return hit
  return hit.replace(PLACEHOLDER, (whole, index: string) => {
    const arg = args[Number(index)]
    if (arg === undefined || arg === null) return whole
    return String(arg)
  })
}

/** 字典里是否有这条文案（设置页「语言」一项用它统计覆盖率时可用）。 */
export function hasTranslation(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(ZH, key)
}

/** 字典条目数，测试与调试用。 */
export const TRANSLATION_COUNT = Object.keys(ZH).length
