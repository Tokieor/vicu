import type { ParserConfig } from './types'
import { DEFAULT_PARSER_CONFIG } from './types'

/**
 * Minimal AppConfig shape needed by the config bridge.
 * Avoids importing the full AppConfig type (which lives in main process / vikunja-types).
 */
interface AppConfigLike {
  nlp_enabled?: boolean
  nlp_syntax_mode?: 'todoist' | 'vikunja' | 'zh'
  exclamation_today?: boolean
  standalone_mode?: boolean
}

/** 未知值一律当 Todoist：旧配置里没有这个字段，存坏的值也不该让解析失效。 */
function syntaxModeOf(mode: AppConfigLike['nlp_syntax_mode']): ParserConfig['syntaxMode'] {
  return mode === 'vikunja' || mode === 'zh' ? mode : DEFAULT_PARSER_CONFIG.syntaxMode
}

/**
 * Convert AppConfig fields to ParserConfig.
 */
export function getParserConfig(appConfig: AppConfigLike): ParserConfig {
  return {
    enabled: appConfig.nlp_enabled !== false,
    syntaxMode: syntaxModeOf(appConfig.nlp_syntax_mode),
    bangToday: appConfig.exclamation_today !== false,
    // Local tasks only keep a due date, so `for 30m` must not take the time out of it.
    ...(appConfig.standalone_mode ? { suppressTypes: ['length' as const] } : {}),
  }
}
