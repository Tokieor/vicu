import { Calendar, CalendarDays, CalendarRange, CircleCheckBig, HeartPulse, Inbox, Layers, RefreshCw, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Smart list identity (design-tokens-v1.json `identity`, docs/design-system-v1.md section 5): the
// colour and icon of each smart list. The colour only ever colours the list icon, never text.
// smart-list-identity.test.ts keeps this table equal to the token file.

export type SmartListId = 'inbox' | 'today' | 'plan' | 'calendar' | 'upcoming' | 'anytime' | 'routines' | 'review' | 'logbook'

export interface SmartListIdentity {
  /** "#RRGGBB", the same in light and dark. */
  color: string
  /** The lucide-react export name, as the token file spells it (desktopIcon). */
  iconName: string
  icon: LucideIcon
}

export const SMART_LIST_IDENTITY: Record<SmartListId, SmartListIdentity> = {
  inbox: { color: '#0A84FF', iconName: 'Inbox', icon: Inbox },
  today: { color: '#E8A400', iconName: 'Sun', icon: Sun },
  plan: { color: '#2F6FED', iconName: 'CalendarRange', icon: CalendarRange },
  // The calendar is the browsing half of the planner; a plain grid keeps it apart from the two
  // Calendar* icons above. Its orange is the one identity colour not taken yet.
  calendar: { color: '#C2410C', iconName: 'Calendar', icon: Calendar },
  upcoming: { color: '#E5484D', iconName: 'CalendarDays', icon: CalendarDays },
  anytime: { color: '#14A3A3', iconName: 'Layers', icon: Layers },
  routines: { color: '#E5487A', iconName: 'HeartPulse', icon: HeartPulse },
  review: { color: '#8E55E8', iconName: 'RefreshCw', icon: RefreshCw },
  logbook: { color: '#2E9D58', iconName: 'CircleCheckBig', icon: CircleCheckBig },
}

