import { t } from '@/lib/i18n'

// 全局快捷键注册失败时给用户看的一句话。Wayland 走的是桌面 portal，得解释清楚，
// 别让用户以为只是按键被别的程序占了。
export function hotkeyFailureCopy(): string {
  return window.api.platform === 'linux'
    ? t('Failed to register. On Wayland, Electron binds shortcuts through the desktop portal — accept the consent dialog if prompted, or use the workaround below.')
    : t('Failed to register — hotkey may be in use by another application')
}
