import { useRef, useState, type RefObject } from 'react'
import { X, Repeat } from 'lucide-react'
import { NULL_DATE } from '@/lib/constants'
import { detectRecurrencePreset, formatRecurrenceLabel } from '@/lib/recurrence'
import { dueOfWhenValue, spanOfWhenValue, whenValueOf, type WhenValue } from '@/lib/when-logic'
import { Button } from '../shared/Button'
import { Popover, type PopoverCloseReason } from '../overlay/Popover'
import { RecurrencePickerPopover } from './RecurrencePickerPopover'
import { WhenPanel } from './WhenPanel'

/** 开始与结束两天，写成任务的字段；null 表示那一天没有。 */
export interface WhenSpanFields {
  start_date: string | null
  end_date: string | null
}

interface WhenPopoverProps {
  anchorRef: RefObject<HTMLElement | null>
  /** Where it opens relative to the anchor; a menu entry opens it beside the menu. */
  placement?: 'bottom-start' | 'right-start'
  currentDate: string
  /** The new due date: a date-only value (local 23:59:59), a day with a time, or NULL_DATE to clear. */
  onDateChange: (isoDate: string) => void
  onClose: (reason?: PopoverCloseReason) => void
  repeatAfter?: number
  repeatMode?: number
  onRecurrenceChange?: (repeatAfter: number, repeatMode: number) => void
  /**
   * Show "Clear date" even though no date is picked here. A bulk edit opens with no date (the tasks
   * have different ones) and must still be able to clear them all.
   */
  allowClear?: boolean
  /**
   * The task's start and end dates. The panel offers a span of days over them; a same-day time
   * block opens as that span with both clocks filled in, so it can be edited right here instead
   * of being hidden (the Plan screen's drag is no longer the only way to write one).
   */
  startDate?: string | null
  endDate?: string | null
  /**
   * Called with the start and end days whenever the span changes: both null when it is turned off.
   * Without it the panel has no span row at all.
   */
  onSpanChange?: (span: WhenSpanFields) => void
}

/**
 * The Schedule popover: the When panel with Repeat and Clear in the footer. A day or time picked in
 * the grid is applied at once and the popover stays open for the next pick; a quick choice or Enter
 * in the text field applies and closes. Clearing sends the null date.
 *
 * With `onSpanChange` the panel also carries the span of days: the end date is the due date, and
 * the start date is the one extra value.
 */
export function WhenPopover({
  anchorRef,
  placement = 'bottom-start',
  currentDate,
  onDateChange,
  onClose,
  repeatAfter = 0,
  repeatMode = 0,
  onRecurrenceChange,
  allowClear = false,
  startDate = null,
  endDate = null,
  onSpanChange,
}: WhenPopoverProps) {
  const repeatButtonRef = useRef<HTMLButtonElement>(null)
  const withSpan = !!onSpanChange
  const [value, setValue] = useState<WhenValue>(() => whenValueOf(currentDate, startDate, endDate))
  const [showRecurrence, setShowRecurrence] = useState(false)
  /** Whether the span row was on: turning it off must write the null dates, once. */
  const hadSpan = useRef(value.span != null)

  const hasRecurrence = detectRecurrencePreset(repeatAfter, repeatMode) !== 'none'
  const hasDate = value.date !== null

  const change = (next: WhenValue, { commit }: { commit: boolean }) => {
    setValue(next)
    const due = dueOfWhenValue(next)
    if (due) onDateChange(due)
    if (onSpanChange && withSpan) {
      const span = spanOfWhenValue(next)
      if (span) {
        hadSpan.current = true
        onSpanChange(span)
      } else if (hadSpan.current) {
        hadSpan.current = false
        onSpanChange({ start_date: null, end_date: null })
      }
    }
    if (commit) onClose()
  }

  const clear = () => {
    onDateChange(NULL_DATE)
    // Clearing the date clears the span it ends too; without one there is nothing to write.
    if (onSpanChange && withSpan && (value.span || hadSpan.current)) {
      hadSpan.current = false
      onSpanChange({ start_date: null, end_date: null })
    }
    onClose()
  }

  return (
    <Popover anchorRef={anchorRef} onClose={onClose} placement={placement} label="Schedule" className="w-72 p-3">
      <WhenPanel value={value} onChange={change} withSpan={withSpan} />

      {(hasDate || allowClear || onRecurrenceChange) && (
        <div className="relative mt-2 flex items-center justify-between gap-1 border-t border-[var(--border-color)] pt-2">
          {onRecurrenceChange ? (
            <Button
              ref={repeatButtonRef}
              variant="quiet"
              aria-haspopup="dialog"
              aria-expanded={showRecurrence}
              onClick={() => setShowRecurrence(!showRecurrence)}
              className="px-2"
            >
              <Repeat className="h-3.5 w-3.5" />
              <span>Repeat</span>
              {hasRecurrence && (
                <span className="text-caption text-[var(--accent-blue)]">{formatRecurrenceLabel(repeatAfter, repeatMode)}</span>
              )}
            </Button>
          ) : (
            <span />
          )}
          {(hasDate || allowClear) && (
            <Button variant="quiet" danger onClick={clear} className="px-2">
              <X className="h-3.5 w-3.5" />
              Clear date
            </Button>
          )}

          {/* Rendered inside this popover, so the browser treats it as nested: Escape and a press
              outside close the repeat panel first, a press inside the date panel keeps this one. */}
          {showRecurrence && onRecurrenceChange && (
            <RecurrencePickerPopover
              anchorRef={repeatButtonRef}
              repeatAfter={repeatAfter}
              repeatMode={repeatMode}
              onRecurrenceChange={onRecurrenceChange}
              onClose={() => setShowRecurrence(false)}
            />
          )}
        </div>
      )}
    </Popover>
  )
}
