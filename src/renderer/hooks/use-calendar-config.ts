import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AppConfig } from '@/lib/vikunja-types'
import { APP_CONFIG_QUERY_KEY } from './use-app-config'

/**
 * Saving the calendar's own settings: the view on screen, the agenda's span, the switches.
 * They are per device and change nothing else, so no notification or query is rescheduled.
 */
export function useSaveCalendarConfig() {
  const queryClient = useQueryClient()
  return useCallback(
    (patch: Partial<AppConfig>) => {
      const current = queryClient.getQueryData<AppConfig>(APP_CONFIG_QUERY_KEY)
      // 先写缓存，界面立刻反映；主进程落盘是异步的
      if (current) queryClient.setQueryData<AppConfig>(APP_CONFIG_QUERY_KEY, { ...current, ...patch })
      void api.saveConfigPatch(patch)
    },
    [queryClient],
  )
}
