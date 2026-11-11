import { parseAccelerator, type ParsedAccelerator } from '../accelerator'
import { t } from '@/lib/i18n'

// What else a key combination already does in Vicu, so Settings can say why a hotkey
// would not work. The comparisons are pure; only the sentence is localized.

interface HotkeyConfig {
  quick_entry_enabled?: boolean
  quick_entry_hotkey?: string
  quick_view_enabled?: boolean
  quick_view_hotkey?: string
  /** 全局「唤醒主窗口」快捷键；空字符串表示关闭。 */
  wake_hotkey?: string
  /** 应用内的语音快捷键；空字符串表示关闭。 */
  voice_hotkey?: string
}

/** The app's own shortcuts with the platform's main modifier (Settings, Keyboard Shortcuts; the menus). */
const APP_SHORTCUTS: Array<{ keys: string; name: string }> = [
  { keys: 'Mod+N', name: 'New task' },
  { keys: 'Mod+V', name: 'New task from clipboard' },
  { keys: 'Mod+K', name: 'Complete task' },
  { keys: 'Mod+D', name: 'Duplicate task' },
  { keys: 'Mod+T', name: 'Set due date to today' },
  { keys: 'Mod+Enter', name: 'Save and close task' },
  { keys: 'Mod+R', name: 'Refresh' },
  { keys: 'Mod+Shift+R', name: 'Reload' },
  { keys: 'Mod+Shift+C', name: 'Comments' },
  { keys: 'Mod+P', name: 'Print' },
  { keys: 'Mod+,', name: 'Settings' },
]

function same(a: ParsedAccelerator, b: ParsedAccelerator): boolean {
  return a.ctrl === b.ctrl && a.meta === b.meta && a.alt === b.alt && a.shift === b.shift && a.key.toLowerCase() === b.key.toLowerCase()
}

function appShortcutConflict(hotkey: ParsedAccelerator, isMac: boolean): string | null {
  for (const shortcut of APP_SHORTCUTS) {
    const other = parseAccelerator(shortcut.keys.replace('Mod', isMac ? 'Command' : 'Ctrl'), isMac)
    if (other && same(hotkey, other)) {
      return t('This is already the shortcut for {0}. Choose another.', t(shortcut.name))
    }
  }
  return null
}

/** A sentence naming what the voice shortcut clashes with, or null when nothing does. */
export function voiceHotkeyConflict(hotkey: string, config: HotkeyConfig, isMac: boolean): string | null {
  const voice = parseAccelerator(hotkey, isMac)
  if (!voice) return null
  const globals: Array<{ spec?: string; on?: boolean; name: string }> = [
    { spec: config.quick_entry_hotkey, on: config.quick_entry_enabled, name: 'Quick Entry' },
    { spec: config.quick_view_hotkey, on: config.quick_view_enabled, name: 'Quick View' },
    // 唤醒快捷键是全局注册的：按住同一个组合键，系统先把按键交给唤醒，语音就永远收不到。
    { spec: config.wake_hotkey, on: (config.wake_hotkey ?? '') !== '', name: 'Wake window' },
  ]
  for (const global of globals) {
    const other = global.on ? parseAccelerator(global.spec, isMac) : null
    if (other && same(voice, other)) {
      return t('This is also the {0} hotkey, which takes it first. Choose another.', t(global.name))
    }
  }
  return appShortcutConflict(voice, isMac)
}

/**
 * 全局「唤醒主窗口」快捷键的冲突提示。
 *
 * 规则和语音快捷键一样，但方向不同：唤醒是全局注册的，和快速录入 / 快速查看撞车时
 * 会「抢输」（那两个先注册，见主进程 registerQuickEntryShortcuts），和语音撞车时
 * 会「抢赢」。两种情况都得提示，否则用户会以为快捷键没生效。
 */
export function wakeHotkeyConflict(hotkey: string, config: HotkeyConfig, isMac: boolean): string | null {
  const wake = parseAccelerator(hotkey, isMac)
  if (!wake) return null

  const quickGlobals: Array<{ spec?: string; on?: boolean; name: string }> = [
    { spec: config.quick_entry_hotkey, on: config.quick_entry_enabled, name: 'Quick Entry' },
    { spec: config.quick_view_hotkey, on: config.quick_view_enabled, name: 'Quick View' },
  ]
  for (const global of quickGlobals) {
    const other = global.on ? parseAccelerator(global.spec, isMac) : null
    if (other && same(wake, other)) {
      return t('This is also the {0} hotkey, which takes it first. Choose another.', t(global.name))
    }
  }

  const voice = parseAccelerator(config.voice_hotkey, isMac)
  if (voice && same(wake, voice)) {
    return t('This is also the {0} hotkey. Choose another.', t('Voice input'))
  }

  return appShortcutConflict(wake, isMac)
}
