import { useState, type RefObject } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'
import {
  detectRecurrencePreset,
  formatRecurrenceLabel,
  getPresetValues,
} from '@/lib/recurrence'
import { Popover, type PopoverCloseReason } from '../overlay/Popover'

interface RecurrencePickerPopoverProps {
  anchorRef: RefObject<HTMLElement | null>
  repeatAfter: number
  repeatMode: number
  onRecurrenceChange: (repeatAfter: number, repeatMode: number) => void
  onClose: (reason?: PopoverCloseReason) => void
}

type CustomUnit = 'days' | 'weeks'

const DAY = 86400
const WEEK = 604800

export function RecurrencePickerPopover({
  anchorRef,
  repeatAfter,
  repeatMode,
  onRecurrenceChange,
  onClose,
}: RecurrencePickerPopoverProps) {
  const activePreset = detectRecurrencePreset(repeatAfter, repeatMode)
  const hasRecurrence = activePreset !== 'none'

  // Custom interval state
  const [showCustom, setShowCustom] = useState(activePreset === 'custom')
  const [customValue, setCustomValue] = useState(() => {
    if (activePreset !== 'custom' || repeatMode === 1) return 2
    if (repeatAfter % WEEK === 0) return repeatAfter / WEEK
    if (repeatAfter % DAY === 0) return repeatAfter / DAY
    return Math.round(repeatAfter / DAY)
  })
  const [customUnit, setCustomUnit] = useState<CustomUnit>(() => {
    if (activePreset !== 'custom') return 'days'
    if (repeatAfter % WEEK === 0 && repeatAfter >= WEEK) return 'weeks'
    return 'days'
  })
  const [fromCompletion, setFromCompletion] = useState(repeatMode === 2)

  const applyPreset = (preset: 'daily' | 'weekly' | 'monthly') => {
    const values = getPresetValues(preset)
    onRecurrenceChange(values.repeat_after, values.repeat_mode)
    setShowCustom(false)
  }

  const applyCustom = () => {
    const val = Math.max(1, Math.round(customValue))
    const seconds = customUnit === 'weeks' ? val * WEEK : val * DAY
    const mode = fromCompletion ? 2 : 0
    onRecurrenceChange(seconds, mode)
  }

  const clearRecurrence = () => {
    onRecurrenceChange(0, 0)
  }

  // 数组不是 JSX 文本，i18n 编译插件不会插桩，必须手动 t()。
  const presetButtons: { key: 'daily' | 'weekly' | 'monthly'; label: string }[] = [
    { key: 'daily', label: t('Daily') },
    { key: 'weekly', label: t('Weekly') },
    { key: 'monthly', label: t('Monthly') },
  ]

  return (
    <Popover anchorRef={anchorRef} onClose={onClose} placement="right-start" label={t('Repeat')} className="w-60 p-3">
      {/* Current recurrence display */}
      {hasRecurrence && (
        <div className="mb-2 flex items-center justify-between rounded-control bg-[var(--bg-hover)] px-2 py-1.5">
          <span className="text-xs font-medium text-[var(--text-primary)]">
            {formatRecurrenceLabel(repeatAfter, repeatMode)}
          </span>
          <button
            type="button"
            onClick={clearRecurrence}
            aria-label={t('Clear repeat')}
            title={t('Clear repeat')}
            className="text-[var(--text-secondary)] hover:text-danger"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Presets */}
      <div role="listbox" aria-label={t('Repeat')} className="flex flex-col gap-1">
        {presetButtons.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={activePreset === key}
            onClick={() => applyPreset(key)}
            className={cn(
              'rounded-control px-2 py-1.5 text-left text-xs transition-colors',
              activePreset === key
                ? 'bg-accent-blue/10 font-medium text-[var(--accent-blue)]'
                : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            )}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          role="option"
          tabIndex={-1}
          aria-selected={showCustom || activePreset === 'custom'}
          onClick={() => setShowCustom(!showCustom)}
          className={cn(
            'rounded-control px-2 py-1.5 text-left text-xs transition-colors',
            showCustom || activePreset === 'custom'
              ? 'bg-accent-blue/10 font-medium text-[var(--accent-blue)]'
              : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          )}
        >
          Custom...
        </button>
      </div>

      {/* Custom interval */}
      {showCustom && (
        <div className="mt-2 border-t border-[var(--border-color)] pt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[var(--text-secondary)]">Every</span>
            <input
              type="number"
              aria-label={t('Repeat every')}
              min={1}
              max={365}
              value={customValue}
              onChange={(e) => setCustomValue(Number(e.target.value))}
              className="w-14 rounded-control border border-[var(--border-color)] bg-[var(--bg-secondary)] px-1.5 py-1 text-center text-xs text-[var(--text-primary)]"
            />
            <select
              aria-label={t('Repeat unit')}
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value as CustomUnit)}
              className="rounded-control border border-[var(--border-color)] bg-[var(--bg-secondary)] px-1.5 py-1 text-xs text-[var(--text-primary)]"
            >
              <option value="days">{t('days')}</option>
              <option value="weeks">{t('weeks')}</option>
            </select>
          </div>

          <label className="mt-2 flex items-center gap-1.5 px-0.5">
            <input
              type="checkbox"
              checked={fromCompletion}
              onChange={(e) => setFromCompletion(e.target.checked)}
              className="h-3 w-3 rounded-control border-[var(--border-color)] accent-[var(--accent-blue)]"
            />
            <span className="text-caption text-[var(--text-secondary)]">From completion date</span>
          </label>

          <button
            type="button"
            onClick={applyCustom}
            className="mt-2 w-full rounded-control bg-accent-fill px-2 py-1.5 text-xs text-on-accent hover:opacity-90"
          >
            Apply
          </button>
        </div>
      )}
    </Popover>
  )
}
