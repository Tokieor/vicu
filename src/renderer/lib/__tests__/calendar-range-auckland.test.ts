import { runCalendarRangeZoneSuite } from './calendar-range-suite'

// UTC+13 in summer: a month grid around the September change spans both offsets.
process.env.TZ = 'Pacific/Auckland'
runCalendarRangeZoneSuite({ zone: 'Pacific/Auckland', inDstWeek: '2026-09-27', outOfDstWeek: '2026-04-05' })
