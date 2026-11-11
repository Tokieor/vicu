import { describe, expect, it } from 'vitest'
import { quickAddHotkeyConflict, voiceHotkeyConflict, wakeHotkeyConflict } from '../shortcut-conflicts'

describe('voiceHotkeyConflict', () => {
  it('accepts a free combination next to the default Quick Entry and Quick View hotkeys', () => {
    const mac = { quick_entry_enabled: true, quick_entry_hotkey: 'Command+Shift+Space', quick_view_enabled: true, quick_view_hotkey: 'Command+Shift+B' }
    expect(voiceHotkeyConflict('Command+Shift+D', mac, true)).toBeNull()
    const win = { quick_entry_enabled: true, quick_entry_hotkey: 'Alt+Shift+V', quick_view_enabled: true, quick_view_hotkey: 'Alt+Shift+B' }
    expect(voiceHotkeyConflict('Ctrl+Shift+D', win, false)).toBeNull()
  })

  it('names an enabled global hotkey that takes the keys first', () => {
    const config = { quick_entry_enabled: true, quick_entry_hotkey: 'Command+Shift+Space' }
    expect(voiceHotkeyConflict('Command+Shift+Space', config, true)).toMatch(/Quick Entry/)
    expect(voiceHotkeyConflict('Command+Shift+Space', { ...config, quick_entry_enabled: false }, true)).toBeNull()
  })

  it('names an app shortcut with the same keys', () => {
    expect(voiceHotkeyConflict('Command+N', {}, true)).toMatch(/New task/)
    expect(voiceHotkeyConflict('Ctrl+Shift+C', {}, false)).toMatch(/Comments/)
  })

  it('has nothing to say about an empty shortcut', () => {
    expect(voiceHotkeyConflict('', {}, true)).toBeNull()
  })

  it('names the global wake shortcut when the voice hotkey would never reach the app', () => {
    const config = { wake_hotkey: 'Alt+Shift+M' }
    expect(voiceHotkeyConflict('Alt+Shift+M', config, false)).toMatch(/Wake window/)
    expect(voiceHotkeyConflict('Alt+Shift+M', { wake_hotkey: '' }, false)).toBeNull()
  })

  it('names the quick add shortcut, which is global too', () => {
    expect(voiceHotkeyConflict('Alt+Shift+N', { quick_add_hotkey: 'Alt+Shift+N' }, false)).toMatch(/Quick add task/)
    expect(voiceHotkeyConflict('Alt+Shift+N', { quick_add_hotkey: '' }, false)).toBeNull()
  })
})

describe('wakeHotkeyConflict', () => {
  it('accepts the default combination next to the default Quick Entry and Quick View hotkeys', () => {
    const win = { quick_entry_enabled: true, quick_entry_hotkey: 'Alt+Shift+V', quick_view_enabled: true, quick_view_hotkey: 'Alt+Shift+B' }
    expect(wakeHotkeyConflict('Alt+Shift+M', win, false)).toBeNull()
    const mac = { quick_entry_enabled: true, quick_entry_hotkey: 'Command+Shift+Space', quick_view_enabled: true, quick_view_hotkey: 'Command+Shift+B' }
    expect(wakeHotkeyConflict('Command+Shift+M', mac, true)).toBeNull()
  })

  it('reports a clash with an enabled Quick Entry hotkey, in either modifier order', () => {
    const config = { quick_entry_enabled: true, quick_entry_hotkey: 'Alt+Shift+V' }
    expect(wakeHotkeyConflict('Alt+Shift+V', config, false)).toMatch(/Quick Entry/)
    expect(wakeHotkeyConflict('Shift+Alt+V', config, false)).toMatch(/Quick Entry/)
    expect(wakeHotkeyConflict('Alt+Shift+V', { ...config, quick_entry_enabled: false }, false)).toBeNull()
  })

  it('reports a clash with the in-app voice hotkey', () => {
    expect(wakeHotkeyConflict('Alt+Shift+D', { voice_hotkey: 'Alt+Shift+D' }, false)).toMatch(/Voice input/)
    expect(wakeHotkeyConflict('Alt+Shift+D', { voice_hotkey: '' }, false)).toBeNull()
  })

  it('reports a clash with an app shortcut', () => {
    expect(wakeHotkeyConflict('Ctrl+N', {}, false)).toMatch(/New task/)
    expect(wakeHotkeyConflict('Command+N', {}, true)).toMatch(/New task/)
  })

  it('has nothing to say about an empty or unparseable shortcut', () => {
    expect(wakeHotkeyConflict('', {}, false)).toBeNull()
    expect(wakeHotkeyConflict('Alt+Shift', {}, false)).toBeNull()
  })

  it('does not blame the quick add shortcut, which is registered after it', () => {
    expect(wakeHotkeyConflict('Alt+Shift+M', { quick_add_hotkey: 'Alt+Shift+M' }, false)).toBeNull()
  })
})

describe('quickAddHotkeyConflict', () => {
  it('accepts its own default next to the other defaults', () => {
    expect(quickAddHotkeyConflict('Alt+Shift+N', {}, false)).toBeNull()
    expect(quickAddHotkeyConflict('Command+Shift+N', {}, true)).toBeNull()
  })

  it('reports a clash with a global shortcut registered before it', () => {
    const config = { quick_entry_enabled: true, quick_entry_hotkey: 'Alt+Shift+V', wake_hotkey: 'Alt+Shift+M' }
    expect(quickAddHotkeyConflict('Alt+Shift+V', config, false)).toMatch(/Quick Entry/)
    expect(quickAddHotkeyConflict('Alt+Shift+M', config, false)).toMatch(/Wake window/)
    expect(quickAddHotkeyConflict('Alt+Shift+V', { ...config, quick_entry_enabled: false }, false)).toBeNull()
  })

  it('reports a clash with the in-app voice hotkey, which it takes the keys from', () => {
    expect(quickAddHotkeyConflict('Alt+Shift+D', { voice_hotkey: 'Alt+Shift+D' }, false)).toMatch(/Voice input/)
    expect(quickAddHotkeyConflict('Alt+Shift+D', { voice_hotkey: '' }, false)).toBeNull()
  })

  it('reports a clash with an app shortcut', () => {
    expect(quickAddHotkeyConflict('Ctrl+N', {}, false)).toMatch(/New task/)
  })

  it('has nothing to say about an empty or unparseable shortcut', () => {
    expect(quickAddHotkeyConflict('', {}, false)).toBeNull()
    expect(quickAddHotkeyConflict('Alt+Shift', {}, false)).toBeNull()
  })
})
