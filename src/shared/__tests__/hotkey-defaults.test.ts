import { describe, expect, it } from 'vitest'
import { defaultQuickAddHotkey, defaultWakeHotkey, sameAccelerator } from '../hotkey-defaults'

describe('defaultWakeHotkey', () => {
  it('uses the main modifier of each platform', () => {
    expect(defaultWakeHotkey(false)).toBe('Alt+Shift+M')
    expect(defaultWakeHotkey(true)).toBe('Command+Shift+M')
  })

  it('does not collide with the Quick Entry / Quick View defaults', () => {
    expect(sameAccelerator(defaultWakeHotkey(false), 'Alt+Shift+V')).toBe(false)
    expect(sameAccelerator(defaultWakeHotkey(false), 'Alt+Shift+B')).toBe(false)
  })
})

describe('defaultQuickAddHotkey', () => {
  it('uses the main modifier of each platform', () => {
    expect(defaultQuickAddHotkey(false)).toBe('Alt+Shift+N')
    expect(defaultQuickAddHotkey(true)).toBe('Command+Shift+N')
  })

  it('is distinct from the other global defaults on the same platform', () => {
    expect(sameAccelerator(defaultQuickAddHotkey(false), defaultWakeHotkey(false))).toBe(false)
    expect(sameAccelerator(defaultQuickAddHotkey(false), 'Alt+Shift+V')).toBe(false)
    expect(sameAccelerator(defaultQuickAddHotkey(false), 'Alt+Shift+B')).toBe(false)
    expect(sameAccelerator(defaultQuickAddHotkey(true), defaultWakeHotkey(true))).toBe(false)
  })
})

describe('sameAccelerator', () => {
  it('ignores case and modifier order', () => {
    expect(sameAccelerator('Alt+Shift+M', 'Shift+Alt+M')).toBe(true)
    expect(sameAccelerator('ctrl+alt+w', 'Ctrl+Alt+W')).toBe(true)
    expect(sameAccelerator('Command+Shift+M', 'Cmd+Shift+M')).toBe(false)
  })

  it('tells different combinations apart', () => {
    expect(sameAccelerator('Alt+Shift+M', 'Alt+Shift+V')).toBe(false)
    expect(sameAccelerator('Alt+Shift+M', 'Ctrl+Shift+M')).toBe(false)
    expect(sameAccelerator('Alt+Shift+M', '')).toBe(false)
  })
})
