import { HotkeyRecorder } from './HotkeyRecorder'
import { hotkeyFailureCopy } from '@/lib/hotkey-copy'
import { quickAddHotkeyConflict } from '@/lib/voice/shortcut-conflicts'
import { defaultQuickAddHotkey } from '../../../shared/hotkey-defaults'
import type { AppConfig } from '@/lib/vikunja-types'

const isMac = window.api.platform === 'darwin'

interface QuickAddSettingsProps {
  config: AppConfig
  onChange: (partial: Partial<AppConfig>) => void
  hotkeyWarnings?: { entry: boolean; viewer: boolean; wake: boolean; add: boolean; waylandLimited: boolean }
}

/**
 * 设置 → 键盘快捷键：全局「快速添加任务」快捷键（config `quick_add_hotkey`）。
 *
 * 和唤醒窗口同一位置、同一控件。区别是它不打开主窗口，只弹出快速录入小窗；
 * 主窗口已经在前台时，直接在主窗口里进入新建任务状态。
 */
export function QuickAddSettings({ config, onChange, hotkeyWarnings }: QuickAddSettingsProps) {
  const fallback = defaultQuickAddHotkey(isMac)
  // '' 是「关闭」，所以不能用 || 兜底。
  const hotkey = config.quick_add_hotkey ?? fallback
  const conflict = quickAddHotkeyConflict(hotkey, config, isMac)
  const failed = hotkey !== '' && hotkeyWarnings?.add === false

  return (
    <div className="rounded-card border border-[var(--border-color)] bg-[var(--bg-primary)] p-5">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">Quick add task</h2>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        Press it anywhere to pop up just the task box — date, reminder, priority, labels, project, notes and attachments — with nothing else on screen.
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        Click anywhere outside the box and it closes at once. When the main window is already in front, the shortcut opens the new-task composer there instead. Clear it to turn the shortcut off.
      </p>

      <div className="mt-4">
        <label className="mb-1 block text-xs text-[var(--text-secondary)]">Shortcut (works anywhere)</label>
        <HotkeyRecorder
          value={hotkey}
          onChange={(value) => onChange({ quick_add_hotkey: value })}
          onClear={() => onChange({ quick_add_hotkey: '' })}
          defaultValue={fallback}
          emptyText="Not set"
          label="Quick add task shortcut"
          warning={conflict !== null || failed}
        />
        {conflict && <p className="mt-1 text-xs text-status-today">{conflict}</p>}
        {!conflict && failed && <p className="mt-1 text-xs text-status-today">{hotkeyFailureCopy()}</p>}
      </div>
    </div>
  )
}
