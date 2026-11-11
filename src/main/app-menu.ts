import { app, Menu, shell, BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { isMac } from './platform'
import { t } from '../shared/i18n'

export function setupApplicationMenu(getMainWindow: () => BrowserWindow | null): void {
  const template: MenuItemConstructorOptions[] = []

  // ── macOS App submenu (first item, app name) ──
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: t('Preferences'),
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            const win = getMainWindow()
            if (win) {
              win.show()
              win.focus()
              win.webContents.send('navigate', '/settings')
            }
          },
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    })
  }

  // ── File ──
  template.push({
    label: t('File'),
    submenu: [
      {
        label: t('New task'),
        accelerator: 'CmdOrCtrl+N',
        click: () => {
          const win = getMainWindow()
          if (win) {
            win.show()
            win.focus()
            win.webContents.send('new-task')
          }
        },
      },
      { type: 'separator' },
      {
        label: t('Print'),
        accelerator: 'CmdOrCtrl+P',
        click: () => {
          const win = getMainWindow()
          if (win && win.isVisible() && win.isFocused()) {
            win.webContents.send('print-view')
          }
        },
      },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  })

  // ── Edit (CRITICAL for ⌘C/⌘V on macOS) ──
  template.push({
    label: t('Edit'),
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle' },
      { role: 'selectAll' },
      ...(isMac
        ? [
            { type: 'separator' as const },
            {
              label: t('Speech'),
              submenu: [
                { role: 'startSpeaking' as const },
                { role: 'stopSpeaking' as const },
              ],
            },
          ]
        : []),
    ],
  })

  // ── View ──
  template.push({
    label: t('View'),
    submenu: [
      {
        // Reads the page again from the server without leaving it (F5 is handled by the page).
        label: t('Refresh'),
        accelerator: 'CmdOrCtrl+R',
        click: () => {
          const win = getMainWindow()
          if (win && win.isVisible()) win.webContents.send('refresh-view')
        },
      },
      { role: 'forceReload', label: t('Reload window') },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  })

  // ── Window ──
  template.push({
    label: t('Window'),
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(isMac
        ? [
            { type: 'separator' as const },
            { role: 'front' as const },
            { type: 'separator' as const },
            { role: 'window' as const },
          ]
        : [{ role: 'close' as const }]),
    ],
  })

  // ── Help ──
  template.push({
    role: 'help',
    submenu: [
      {
        label: t('Documentation'),
        click: () => shell.openExternal('https://vikunja.io/docs'),
      },
    ],
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
