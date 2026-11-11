import { HotkeyRecorder } from './HotkeyRecorder'
import { t } from '@/lib/i18n'
import { hotkeyFailureCopy } from '@/lib/hotkey-copy'
import { wakeHotkeyConflict } from '@/lib/voice/shortcut-conflicts'
import { defaultWakeHotkey } from '../../../shared/hotkey-defaults'
import type { AppConfig } from '@/lib/vikunja-types'

const isMac = window.api.platform === 'darwin'

interface WakeSettingsProps {
  config: AppConfig
  onChange: (partial: Partial<AppConfig>) => void
  hotkeyWarnings?: { entry: boolean; viewer: boolean; wake: boolean; waylandLimited: boolean }
}

/**
 * 设置 → 键盘快捷键：全局「唤醒主窗口」快捷键（config `wake_hotkey`）。
 *
 * 和语音输入同一个位置、同一种控件：一个录制框 + 冲突提示。区别只在于它是
 * **全局**注册的（主进程 globalShortcut），所以窗口最小化或收进托盘时也有效。
 */
export function WakeSettings({ config, onChange, hotkeyWarnings }: WakeSettingsProps) {
  const fallback = defaultWakeHotkey(isMac)
  // '' 是「关闭」，所以不能用 || 兜底。
  const hotkey = config.wake_hotkey ?? fallback
  const conflict = wakeHotkeyConflict(hotkey, config, isMac)
  const failed = hotkey !== '' && hotkeyWarnings?.wake === false

  return (
    <div className="rounded-card border border-[var(--border-color)] bg-[var(--bg-primary)] p-5">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">Wake window</h2>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        Press it anywhere — while Vicu is minimized or hidden in the system tray — to bring the main window back to the front. Clear it to turn the shortcut off.
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        The key is registered with the system, so it works while another application is in front. If something else already uses it, pick another combination.
      </p>

      <div className="mt-4">
        <label className="mb-1 block text-xs text-[var(--text-secondary)]">Shortcut (works while Vicu is hidden)</label>
        <HotkeyRecorder
          value={hotkey}
          onChange={(value) => onChange({ wake_hotkey: value })}
          onClear={() => onChange({ wake_hotkey: '' })}
          defaultValue={fallback}
          emptyText="Not set"
          label="Wake window shortcut"
          warning={conflict !== null || failed}
        />
        {conflict && <p className="mt-1 text-xs text-status-today">{conflict}</p>}
        {!conflict && failed && <p className="mt-1 text-xs text-status-today">{hotkeyFailureCopy()}</p>}
      </div>
    </div>
  )
}
