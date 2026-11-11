import { parseAccelerator, type ParsedAccelerator } from '../accelerator'
import { defaultQuickAddHotkey, defaultWakeHotkey } from '../../../shared/hotkey-defaults'
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
  /** 全局「快速添加任务」快捷键；空字符串表示关闭。 */
  quick_add_hotkey?: string
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

/**
 * 全局快捷键之间按注册顺序让位：快速录入、快速查看先注册，唤醒次之，快速添加最后。
 * 撞上先注册的那个就不注册（见主进程 registerQuickEntryShortcuts），界面必须说明原因。
 *
 * `onlyBefore` 给出自己的位置时只比较排在它前面的键：排在后面的抢不走它。
 */
function globalConflict(
  hotkey: ParsedAccelerator,
  config: HotkeyConfig,
  isMac: boolean,
  onlyBefore: 'entry' | 'viewer' | 'wake' | 'add' | null = null,
): string | null {
  // 唤醒和快速添加的默认值就是「开着」的（只有显式的空字符串才是关闭），
  // 所以缺字段时要按默认组合键判断，否则提示会和主进程的实际注册对不上。
  const wakeSpec = config.wake_hotkey ?? defaultWakeHotkey(isMac)
  const addSpec = config.quick_add_hotkey ?? defaultQuickAddHotkey(isMac)
  const globals: Array<{ id: 'entry' | 'viewer' | 'wake' | 'add'; spec?: string; on?: boolean; name: string }> = [
    { id: 'entry', spec: config.quick_entry_hotkey, on: config.quick_entry_enabled, name: 'Quick Entry' },
    { id: 'viewer', spec: config.quick_view_hotkey, on: config.quick_view_enabled, name: 'Quick View' },
    { id: 'wake', spec: wakeSpec, on: wakeSpec !== '', name: 'Wake window' },
    { id: 'add', spec: addSpec, on: addSpec !== '', name: 'Quick add task' },
  ]
  const limit = onlyBefore === null ? globals.length : globals.findIndex((global) => global.id === onlyBefore)
  for (const [index, global] of globals.entries()) {
    if (index >= limit) break
    const other = global.on ? parseAccelerator(global.spec, isMac) : null
    if (other && same(hotkey, other)) {
      return t('This is also the {0} hotkey, which takes it first. Choose another.', t(global.name))
    }
  }
  return null
}

/** A sentence naming what the voice shortcut clashes with, or null when nothing does. */
export function voiceHotkeyConflict(hotkey: string, config: HotkeyConfig, isMac: boolean): string | null {
  const voice = parseAccelerator(hotkey, isMac)
  if (!voice) return null
  // 全局注册的键会先截走按键，语音就永远收不到。
  const global = globalConflict(voice, config, isMac)
  if (global) return global
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

  const global = globalConflict(wake, config, isMac, 'wake')
  if (global) return global

  const voice = parseAccelerator(config.voice_hotkey, isMac)
  if (voice && same(wake, voice)) {
    return t('This is also the {0} hotkey. Choose another.', t('Voice input'))
  }

  return appShortcutConflict(wake, isMac)
}

/**
 * 「快速添加任务」快捷键的冲突提示。
 *
 * 它在注册顺序上排最后，所以快速录入 / 快速查看 / 唤醒任何一个是同一个组合键，
 * 它都会让位；和语音撞车时它抢赢（全局键先截走）。
 */
export function quickAddHotkeyConflict(hotkey: string, config: HotkeyConfig, isMac: boolean): string | null {
  const add = parseAccelerator(hotkey, isMac)
  if (!add) return null

  const global = globalConflict(add, config, isMac, 'add')
  if (global) return global

  const voice = parseAccelerator(config.voice_hotkey, isMac)
  if (voice && same(add, voice)) {
    return t('This is also the {0} hotkey. Choose another.', t('Voice input'))
  }

  return appShortcutConflict(add, isMac)
}
