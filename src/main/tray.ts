import { app, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { subscribeLocale, t } from '../shared/i18n'
import { isMac } from './platform'

let tray: Tray | null = null
let unsubscribeLocale: (() => void) | null = null

export interface TrayCallbacks {
  onShowMainWindow: () => void
  /** Hides the main window, leaving the app in the tray (the close button does the same when
   *  "Close to tray" is on). */
  onHideMainWindow?: () => void
  onShowQuickEntry: () => void
  onShowQuickView: () => void
  onQuit: () => void
  /** Quick Entry / View rows are only listed while the feature is on. */
  isQuickEntryEnabled?: () => boolean
  isQuickViewEnabled?: () => boolean
  /** Whether the main window is on screen, so the menu can offer Show or Hide. */
  isMainWindowVisible?: () => boolean
}

let callbacks: TrayCallbacks | null = null

function createTrayIcon(): Electron.NativeImage {
  // macOS: use template images for auto-inversion on dark/light menu bars
  if (isMac) {
    const templatePath = app.isPackaged
      ? join(process.resourcesPath, 'resources', 'iconTemplate.png')
      : join(app.getAppPath(), 'resources', 'iconTemplate.png')
    try {
      const icon = nativeImage.createFromPath(templatePath)
      if (!icon.isEmpty()) {
        icon.setTemplateImage(true)
        return icon
      }
    } catch {
      // fall through to programmatic icon
    }
  }

  // Windows: use the app icon resized to 16x16
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'resources', 'icon.png')
    : join(app.getAppPath(), 'resources', 'icon.png')
  try {
    const icon = nativeImage.createFromPath(iconPath)
    if (!icon.isEmpty()) {
      const resized = icon.resize({ width: 16, height: 16 })
      if (isMac) resized.setTemplateImage(true)
      return resized
    }
  } catch {
    // fall through to programmatic icon
  }

  // Fallback: generate a 16x16 "V" checkmark icon programmatically
  const size = 16
  const buf = Buffer.alloc(size * size * 4, 0)

  const pixels = [
    [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8],
    [3, 3], [4, 4], [5, 5], [6, 6], [7, 7],
    [8, 9], [9, 10], [10, 11], [11, 12], [12, 13],
    [8, 8], [9, 9], [10, 10], [11, 11], [12, 12], [13, 11],
    [7, 9], [8, 10],
  ]

  for (const [y, x] of pixels) {
    const offset = (y * size + x) * 4
    buf[offset] = 100     // R
    buf[offset + 1] = 149 // G
    buf[offset + 2] = 237 // B
    buf[offset + 3] = 255 // A
  }

  const fallback = nativeImage.createFromBuffer(buf, { width: size, height: size })
  if (isMac) fallback.setTemplateImage(true)
  return fallback
}

export function createTray(cbs: TrayCallbacks): void {
  if (tray) return
  callbacks = cbs

  const icon = createTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('Vicu')
  updateTrayMenu()

  if (isMac) {
    // macOS: single-click shows context menu (set via setContextMenu in updateTrayMenu).
    // The click event does NOT fire when setContextMenu() has been called (macOS convention).
    tray.setIgnoreDoubleClickEvents(true)
  } else {
    // Windows: left-click (or double-click) brings the main window back, right-click shows the menu
    tray.on('click', () => {
      callbacks?.onShowMainWindow()
    })
    tray.on('double-click', () => {
      callbacks?.onShowMainWindow()
    })
  }

  // The menu is rebuilt when the language changes, so the tray follows the app.
  unsubscribeLocale = subscribeLocale(() => updateTrayMenu())
}

export function updateTrayMenu(): void {
  if (!tray || !callbacks) return

  const template: Electron.MenuItemConstructorOptions[] = [
    { label: t('Show Vicu'), click: () => callbacks!.onShowMainWindow() },
  ]
  if (!isMac && callbacks.onHideMainWindow) {
    template.push({ label: t('Hide Vicu'), click: () => callbacks!.onHideMainWindow?.() })
  }
  if (callbacks.isQuickEntryEnabled?.() ?? true) {
    template.push({ label: t('Quick Entry'), click: () => callbacks!.onShowQuickEntry() })
  }
  if (callbacks.isQuickViewEnabled?.() ?? true) {
    template.push({ label: t('Quick View'), click: () => callbacks!.onShowQuickView() })
  }
  template.push({ type: 'separator' }, { label: t('Quit Vicu'), click: () => callbacks!.onQuit() })

  tray.setContextMenu(Menu.buildFromTemplate(template))
}

export function destroyTray(): void {
  unsubscribeLocale?.()
  unsubscribeLocale = null
  if (tray) {
    tray.destroy()
    tray = null
  }
  callbacks = null
}

export function hasTray(): boolean {
  return tray !== null
}

/** Hides the main window with a balloon on Windows the first time, so the app is not "lost". */
export function showTrayHint(): void {
  if (!tray) return
  tray.displayBalloon?.({
    title: 'Vicu',
    content: t('Vicu is still running. Click the tray icon to reopen it.'),
  })
}
