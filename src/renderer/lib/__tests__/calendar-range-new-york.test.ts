import { runCalendarRangeZoneSuite } from './calendar-range-suite'

// UTC-5 in winter, UTC-4 in summer: the November change lands inside a month grid.
process.env.TZ = 'America/New_York'
runCalendarRangeZoneSuite({ zone: 'America/New_York', inDstWeek: '2026-03-08', outOfDstWeek: '2026-11-01' })
