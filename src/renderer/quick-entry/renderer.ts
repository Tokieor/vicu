declare global {
  interface Window {
    quickEntryApi: {
      platform: 'darwin' | 'win32' | 'linux'
      saveTask(
        title: string,
        description: string | null,
        dueDate: string | null,
        projectId: number | null,
        priority?: number,
        repeatAfter?: number,
        repeatMode?: number,
        // Kept with the create when it has to be queued offline; unused when the server answers.
        // `location` ("when I get home") is set only when the server answers.
        extras?: {
          labels?: Array<{ id?: number; title?: string }>
          images?: Array<{ name: string; mime: string; bytes: Uint8Array }>
          location?: { place: string; trigger: 'arrive' | 'leave' }
          // The time block `for 30m` made; part of the create.
          block?: { start_date: string; end_date: string } | null
          // 工具栏里选的提醒；缺省表示「跟随设置里的默认提醒」，null 表示明确不要提醒。
          reminder?: { offset: number | null }
        },
      ): Promise<{ success: boolean; cached?: boolean; error?: string; mayExist?: boolean; data?: { id: number } }>
      uploadAttachment(taskId: number, fileData: Uint8Array, fileName: string, mimeType: string): Promise<{ success: boolean; error?: string; statusCode?: number }>
      fetchTaskAttachments(taskId: number): Promise<{ success: boolean; data?: Array<{ id: number }>; error?: string; statusCode?: number }>
      updateTask(taskId: number, task: Record<string, unknown>): Promise<{ success: boolean; error?: string; statusCode?: number; data?: unknown }>
      closeWindow(): Promise<void>
      // The locale and clock dates are phrased with (system locale, Settings clock choice).
      getDateFormat(): Promise<{ locale: string; hour12: boolean }>
      onDateFormatChanged(callback: (format: { locale: string; hour12: boolean }) => void): void
      // 语言在设置里换掉后，小窗跟着换成那一门语言（重新载入页面，见文件末尾）。
      onLocaleChanged(callback: () => void): void
      // The note's final link when saving with it linked; the uid is written into the note then.
      resolveObsidianLink(): Promise<{ deepLink: string; noteName: string; isUidBased: boolean } | null>
      setHeight(height: number): Promise<void>
      getConfig(): Promise<QuickEntryConfig | null>
      getPendingCount(): Promise<number>
      getQueueCounts(): Promise<{ pending: number; failed: number }>
      // Queue what failed after an online create (labels by id or title, images with their bytes).
      queueFollowUps(
        taskId: number,
        extras: { labels: Array<{ id?: number; title?: string }>; images: Array<{ name: string; mime: string; bytes: Uint8Array }> },
        title?: string,
      ): Promise<{ success: boolean; error?: string }>
      fetchLabels(): Promise<{ success: boolean; data?: Array<{ id: number; title: string }> }>
      fetchProjects(): Promise<{ success: boolean; data?: Array<{ id: number; title: string }> }>
      // The places saved on a phone (synced preferences), for "when I get home".
      fetchPlaces(): Promise<Array<{ id: string; name: string }>>
      addLabelToTask(taskId: number, labelId: number): Promise<{ success: boolean; error?: string; statusCode?: number }>
      createLabel(label: { title: string; hex_color?: string }): Promise<{ success: boolean; error?: string; statusCode?: number; data?: { id: number; title: string } }>
      onShowWindow(callback: () => void): void
      onHideWindow(callback: () => void): void
      onSyncCompleted(callback: () => void): void
      onDragHover(callback: (hovering: boolean) => void): void
      onObsidianContext(callback: (context: {
        deepLink: string; noteName: string; vaultName: string; isUidBased: boolean; mode: 'ask' | 'always'
      } | null) => void): void
      onBrowserContext(callback: (context: {
        url: string; title: string; displayTitle: string; mode: 'ask' | 'always'
      } | null) => void): void
    }
  }
}

interface QuickEntryConfig {
  vikunja_url: string
  quick_entry_default_project_id: number
  inbox_project_id: number
  exclamation_today: boolean
  secondary_projects: Array<{ id: number; title: string }>
  project_cycle_modifier: string
  standalone_mode: boolean
  nlp_enabled: boolean
  nlp_syntax_mode: 'todoist' | 'vikunja'
}

import { blockFields, parse, getParserConfig, recurrenceToVikunja, extractBangToday } from '../lib/task-parser'
import { dueNextWeek, dueToday, dueTomorrow, isDateOnly, localDateOf, parsedDue } from '../lib/due-dates'
import { followColorScheme } from '../lib/theme'
import { parseChips } from '../lib/parse-chips'
import { motionMs, motionSpringCurve, travelStart } from '../lib/motion'
import { getDateFormat, initDateFormat, subscribeDateFormat } from '../lib/date-format'
import { initLocale, t } from '../lib/i18n'
import { startDomTranslation } from '../lib/dom-i18n'
import type { ParseResult, ParserConfig, ParsedToken, TokenType } from '../lib/task-parser'
import { getClipboardImages, fileToUint8Array } from '../lib/clipboard-images'
import { formatDateChip } from '../lib/date-utils'
import { AutocompleteDropdown } from './autocomplete'
import { cache } from './vikunja-cache'
import { applyQuickEntryFollowUps } from '../lib/quick-entry-follow-ups'
import { escapeHtml, plainTextToDescriptionHtml } from '../lib/description-html'

followColorScheme()

const input = document.getElementById('task-input') as HTMLInputElement
const descriptionInput = document.getElementById('description-input') as HTMLTextAreaElement
const container = document.getElementById('container')!
const errorMessage = document.getElementById('error-message')!
const todayHintInline = document.getElementById('today-hint-inline')!
const todayHintBelow = document.getElementById('today-hint-below')!
const projectHint = document.getElementById('project-hint')!
const projectName = document.getElementById('project-name')!
const pendingIndicator = document.getElementById('pending-indicator')!
const pendingCountEl = document.getElementById('pending-count')!
const dragHandle = document.querySelector('.drag-handle')!
const obsidianHint = document.getElementById('obsidian-hint')!
const obsidianHintName = document.getElementById('obsidian-hint-name')!
const obsidianBadge = document.getElementById('obsidian-badge')!
const obsidianBadgeName = document.getElementById('obsidian-badge-name')!
const obsidianBadgeRemove = document.getElementById('obsidian-badge-remove')!
const browserHint = document.getElementById('browser-hint')!
const browserHintName = document.getElementById('browser-hint-name')!
const browserBadge = document.getElementById('browser-badge')!
const browserBadgeName = document.getElementById('browser-badge-name')!
const browserBadgeRemove = document.getElementById('browser-badge-remove')!
const inputHighlight = document.getElementById('input-highlight')!
const parsePreview = document.getElementById('parse-preview')!
const imageGallery = document.getElementById('image-gallery')!

// --- 工具栏（日期 / 提醒 / 优先级 / 标签 / 项目 / 备注 / 附加） ---
const toolbar = document.getElementById('task-toolbar')!
const toolPopover = document.getElementById('tool-popover')!
const sendButton = document.getElementById('send-button') as HTMLButtonElement
const attachInput = document.getElementById('attach-input') as HTMLInputElement
const toolDate = document.getElementById('tool-date')!
const toolDateLabel = document.getElementById('tool-date-label')!
const toolReminder = document.getElementById('tool-reminder')!
const toolReminderLabel = document.getElementById('tool-reminder-label')!
const toolPriority = document.getElementById('tool-priority')!
const toolPriorityLabel = document.getElementById('tool-priority-label')!
const toolLabels = document.getElementById('tool-labels')!
const toolLabelsLabel = document.getElementById('tool-labels-label')!
const toolProject = document.getElementById('tool-project')!
const toolProjectLabel = document.getElementById('tool-project-label')!
const toolNotes = document.getElementById('tool-notes')!

let errorTimeout: ReturnType<typeof setTimeout> | null = null
let exclamationTodayEnabled = true
let projectCycle: Array<{ id: number; title: string | null }> = []
let currentProjectIndex = 0
let projectCycleModifier = 'ctrl'
let obsidianContext: { deepLink: string; noteName: string; isUidBased: boolean } | null = null
let obsidianLinked = false
let resolvingObsidianLink = false
let browserContext: { url: string; title: string; displayTitle: string } | null = null
let browserLinked = false
let parserConfig: ParserConfig = { enabled: true, syntaxMode: 'todoist' }
let cachedLabels: Array<{ id: number; title: string }> = []
let cachedProjects: Array<{ id: number; title: string }> = []
let cachedPlaces: Array<{ id: string; name: string }> = []
let lastParseResult: ParseResult | null = null
let isComposing = false
let suppressedTypes: Map<TokenType, string[]> = new Map()
let lastConfig: QuickEntryConfig | null = null

interface PendingImage {
  uuid: string
  blobUrl: string
  bytes: Uint8Array
  name: string
  mime: string
}
let pendingImages: PendingImage[] = []

// --- Autocomplete ---
const autocomplete = new AutocompleteDropdown('autocomplete-container', (item, triggerStart, prefix) => {
  const val = input.value
  // Find the end of the current token (next space or end of string)
  let tokenEnd = val.indexOf(' ', triggerStart)
  if (tokenEnd === -1) tokenEnd = val.length

  const hasSpaces = item.title.includes(' ')
  const replacement = hasSpaces ? `${prefix}"${item.title}" ` : `${prefix}${item.title} `

  input.value = val.substring(0, triggerStart) + replacement + val.substring(tokenEnd)
  const newCursorPos = triggerStart + replacement.length
  input.setSelectionRange(newCursorPos, newCursorPos)
  input.dispatchEvent(new Event('input'))
  input.focus()
})

// Set platform-aware hint key text
const isMac = window.quickEntryApi.platform === 'darwin'
const linkKeyLabel = isMac ? '\u2318L' : 'Ctrl+L'
document.querySelectorAll('.obsidian-hint-key, .browser-hint-key').forEach((el) => {
  el.textContent = linkKeyLabel
})

function showError(msg: string, visibleMs = 3000): void {
  errorMessage.textContent = msg
  errorMessage.hidden = false
  void errorMessage.offsetHeight
  errorMessage.classList.add('show')

  if (errorTimeout) clearTimeout(errorTimeout)
  errorTimeout = setTimeout(() => {
    errorMessage.classList.remove('show')
    setTimeout(() => { errorMessage.hidden = true }, 200)
  }, visibleMs)
}

function showOfflineMessage(message = t('Saved offline \u2014 will sync when connected')): void {
  errorMessage.textContent = message
  errorMessage.hidden = false
  errorMessage.classList.add('offline')
  void errorMessage.offsetHeight
  errorMessage.classList.add('show')

  if (errorTimeout) clearTimeout(errorTimeout)
  errorTimeout = setTimeout(() => {
    errorMessage.classList.remove('show')
    setTimeout(() => {
      errorMessage.hidden = true
      errorMessage.classList.remove('offline')
      window.quickEntryApi.closeWindow()
    }, 200)
  }, 1200)
}

function clearError(): void {
  if (errorTimeout) clearTimeout(errorTimeout)
  errorMessage.classList.remove('show', 'offline')
  errorMessage.hidden = true
}

/** 收起备注。`clear` 为 false 时只收起、不清空（工具栏上「备注」按钮来回按时用）。 */
function collapseDescription(clear = true): void {
  descriptionInput.classList.add('hidden')
  if (clear) descriptionInput.value = ''
  updateTodayHints()
}

function expandDescription(): void {
  descriptionInput.classList.remove('hidden')
  descriptionInput.focus()
  autoresizeDescription()
  updateTodayHints()
}

const MAX_DESCRIPTION_HEIGHT_PX = 200

function autoresizeDescription(): void {
  if (descriptionInput.classList.contains('hidden')) return
  descriptionInput.style.height = 'auto'
  const next = Math.min(descriptionInput.scrollHeight, MAX_DESCRIPTION_HEIGHT_PX)
  descriptionInput.style.height = `${next}px`
  descriptionInput.style.overflowY = descriptionInput.scrollHeight > MAX_DESCRIPTION_HEIGHT_PX ? 'auto' : 'hidden'
}

descriptionInput.addEventListener('input', () => {
  autoresizeDescription()
  refreshToolbar()
})

function isDescriptionExpanded(): boolean {
  return !descriptionInput.classList.contains('hidden')
}

function updateTodayHints(): void {
  // When parser is enabled, it handles ! via date/priority parsing — suppress legacy hints
  if (parserConfig.enabled) {
    todayHintInline.classList.add('hidden')
    todayHintBelow.classList.add('hidden')
    return
  }

  // Same rule as the save path: a `!` inside the text is not a date.
  const hasExclamation = exclamationTodayEnabled && !!extractBangToday(input.value).dueDate

  if (hasExclamation && !isDescriptionExpanded()) {
    todayHintInline.classList.remove('hidden')
    todayHintBelow.classList.add('hidden')
  } else if (hasExclamation && isDescriptionExpanded()) {
    todayHintInline.classList.add('hidden')
    todayHintBelow.classList.remove('hidden')
  } else {
    todayHintInline.classList.add('hidden')
    todayHintBelow.classList.add('hidden')
  }
}

async function updatePendingIndicator(): Promise<void> {
  const { pending, failed } = await window.quickEntryApi.getQueueCounts()
  if (pending > 0 || failed > 0) {
    const parts: string[] = []
    if (pending > 0) parts.push(t('{0} change(s) pending sync', pending))
    if (failed > 0) parts.push(t('{0} failed \u2014 open Vicu to review', failed))
    pendingCountEl.textContent = parts.join(' \u00b7 ')
    pendingIndicator.classList.toggle('has-failed', failed > 0)
    pendingIndicator.classList.remove('hidden')
  } else {
    pendingIndicator.classList.add('hidden')
  }
}

function resetInput(): void {
  input.value = ''
  input.disabled = false
  descriptionInput.disabled = false
  collapseDescription()
  clearError()
  clearNlpState()
  clearPendingImages()
  autocomplete.hide()
  todayHintInline.classList.add('hidden')
  todayHintBelow.classList.add('hidden')
  currentProjectIndex = 0
  updateProjectHint()
  resetToolbar()
  input.focus()
}

/** 每次弹出都是一张白纸：工具栏上的选择跟着清掉。 */
function resetToolbar(): void {
  pickedDate = undefined
  pickedTime = null
  pickedPriority = null
  pickedLabelIds = []
  pickedProjectId = null
  pickedReminder = undefined
  closeToolPopover()
  refreshToolbar()
}

function buildProjectCycle(cfg: QuickEntryConfig): void {
  const activeIds = new Set(cachedProjects.map((project) => project.id))
  const configuredDefault = cfg.quick_entry_default_project_id || cfg.inbox_project_id
  const defaultId = activeIds.size === 0 || activeIds.has(configuredDefault)
    ? configuredDefault
    : activeIds.has(cfg.inbox_project_id)
      ? cfg.inbox_project_id
      : cachedProjects[0]?.id ?? 0
  projectCycle = [{ id: defaultId, title: null }]
  if (cfg.secondary_projects && cfg.secondary_projects.length > 0) {
    for (const p of cfg.secondary_projects) {
      if (activeIds.size > 0 && !activeIds.has(p.id)) continue
      projectCycle.push({ id: p.id, title: p.title })
    }
  }
  currentProjectIndex = 0
  updateProjectHint()
  refreshToolbar()
}

function updateProjectHint(): void {
  if (currentProjectIndex === 0 || projectCycle.length <= 1) {
    projectHint.classList.add('hidden')
  } else {
    projectName.textContent = projectCycle[currentProjectIndex].title || ''
    projectHint.classList.remove('hidden')
  }
}

function cycleProject(direction: number): void {
  if (projectCycle.length <= 1) return
  currentProjectIndex += direction
  if (currentProjectIndex >= projectCycle.length) currentProjectIndex = 0
  if (currentProjectIndex < 0) currentProjectIndex = projectCycle.length - 1
  updateProjectHint()
}

function updateObsidianUI(): void {
  if (!obsidianContext) {
    obsidianHint.classList.add('hidden')
    obsidianBadge.classList.add('hidden')
    return
  }
  if (obsidianLinked) {
    obsidianBadgeName.textContent = obsidianContext.noteName
    obsidianBadge.classList.remove('hidden')
    obsidianHint.classList.add('hidden')
  } else {
    obsidianHintName.textContent = `"${obsidianContext.noteName}"`
    obsidianHint.classList.remove('hidden')
    obsidianBadge.classList.add('hidden')
  }
}

function updateBrowserUI(): void {
  if (!browserContext) {
    browserHint.classList.add('hidden')
    browserBadge.classList.add('hidden')
    return
  }
  if (browserLinked) {
    browserBadgeName.textContent = browserContext.displayTitle
    browserBadge.classList.remove('hidden')
    browserHint.classList.add('hidden')
  } else {
    browserHintName.textContent = `"${browserContext.displayTitle}"`
    browserHint.classList.remove('hidden')
    browserBadge.classList.add('hidden')
  }
}

function buildNoteLinkHtml(deepLink: string, noteName: string): string {
  const safeLink = escapeHtml(deepLink)
  const safeName = escapeHtml(noteName)
  return `<!-- notelink:${safeLink} --><p><a href="${safeLink}">\u{1F4CE} ${safeName}</a></p>`
}

function buildPageLinkHtml(url: string, title: string): string {
  const safeUrl = escapeHtml(url)
  const safeTitle = escapeHtml(title)
  return `<!-- pagelink:${safeUrl} --><p><a href="${safeUrl}">\u{1F517} ${safeTitle}</a></p>`
}

function isProjectCycleModifierPressed(e: KeyboardEvent): boolean {
  const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey
  switch (projectCycleModifier) {
    case 'alt':
      return e.altKey && !cmdOrCtrl
    case 'ctrl+alt':
      return cmdOrCtrl && e.altKey
    case 'ctrl':
    default:
      return cmdOrCtrl && !e.altKey
  }
}

// --- NLP Parser Helpers ---

function refreshLabelsAndProjects(): void {
  // Fire-and-forget — runs in background while window is already visible
  Promise.all([
    window.quickEntryApi.fetchLabels(),
    window.quickEntryApi.fetchProjects(),
  ]).then(([labelsResult, projectsResult]) => {
    if (labelsResult.success && labelsResult.data) {
      cachedLabels = labelsResult.data
      cache.setLabels(labelsResult.data)
    }
    if (projectsResult.success && projectsResult.data) {
      cachedProjects = projectsResult.data
      cache.setProjects(projectsResult.data)
      if (lastConfig) buildProjectCycle(lastConfig)
      else refreshToolbar()
    }
  }).catch(() => {
    // Offline or standalone — keep existing cache
  })
  window.quickEntryApi.fetchPlaces().then((places) => {
    cachedPlaces = places
  }).catch(() => {
    // Keep the places already read
  })
}

function renderHighlights(inputValue: string, tokens: ParsedToken[]): void {
  if (!tokens.length) {
    inputHighlight.innerHTML = ''
    return
  }
  const sorted = [...tokens].sort((a, b) => a.start - b.start)
  let html = ''
  let pos = 0
  for (const token of sorted) {
    if (token.start > pos) {
      html += escapeHighlightText(inputValue.slice(pos, token.start))
    }
    html += `<span class="token-${token.type}" data-token-type="${token.type}">${escapeHighlightText(inputValue.slice(token.start, token.end))}</span>`
    pos = token.end
  }
  if (pos < inputValue.length) {
    html += escapeHighlightText(inputValue.slice(pos))
  }
  inputHighlight.innerHTML = html
}

function escapeHighlightText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/ /g, '\u00a0')
}

/** Keys of the chips on screen: a chip travels out of its token only the first time it appears. */
let shownChipKeys = new Set<string>()

/**
 * A chip read from the typed text travels out of the highlighted token it came from, like the main
 * window's composer (card 4.11a, lib/motion.ts travelStart). Under reduced motion it fades in.
 */
function animateChipIn(chip: HTMLElement, type: string): void {
  if (typeof chip.animate !== 'function') return
  const fade = (): void => {
    chip.animate([{ opacity: 0 }, { opacity: 1 }], { duration: motionMs('fade-fast'), easing: 'linear' })
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    fade()
    return
  }
  const token = inputHighlight.querySelector<HTMLElement>(`[data-token-type="${type}"]`)
  if (!token) {
    fade()
    return
  }
  const from = travelStart(token.getBoundingClientRect(), chip.getBoundingClientRect())
  chip.animate(
    [
      { transform: `translate(${from.dx}px, ${from.dy}px) scale(${from.scale})`, opacity: 0.4 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: motionMs('move'), easing: motionSpringCurve('move') },
  )
}

/** chip 上的 × 读出来是什么（屏幕阅读器用）。 */
const CHIP_TYPE_LABELS: Record<string, string> = {
  date: 'Date',
  length: 'Time',
  priority: 'Priority',
  label: 'Labels',
  project: 'Project',
  recurrence: 'Repeat',
  place: 'Reminder',
}

function chipDismissLabel(type: string): string {
  const name = CHIP_TYPE_LABELS[type]
  return name ? `${t('Remove')} ${t(name)}` : t('Remove')
}

function renderParsePreview(result: ParseResult): void {
  // The same chips, in the same words, as the main window's composer (lib/parse-chips.ts).
  const chips = parseChips(result)

  if (chips.length === 0) {
    parsePreview.innerHTML = ''
    parsePreview.classList.add('hidden')
    shownChipKeys = new Set()
    return
  }

  // Chips that are unchanged keep their element (a travel in progress is not cut by the next key);
  // changed ones are rebuilt; new ones are animated in once the container is visible.
  const existing = new Map<string, HTMLElement>()
  for (const el of parsePreview.querySelectorAll<HTMLElement>('.parse-chip')) existing.set(el.dataset.chipKey ?? '', el)
  const entering: Array<{ el: HTMLElement; type: string }> = []
  const next: HTMLElement[] = []
  const nextKeys = new Set<string>()
  for (const chip of chips) {
    const level = chip.type === 'priority' ? ` priority-${Math.min(Math.max(chip.priority ?? 1, 1), 5)}` : ''
    const source = chip.source ?? 'text'
    const signature = `${chip.label}|${chip.priority ?? ''}|${source}`
    const html = `<span class="parse-chip parse-chip-${chip.type}${level}" data-chip-key="${escapeHtml(chip.key)}" data-chip-sig="${escapeHtml(signature)}" data-chip-type="${chip.type}" data-chip-source="${source}">${escapeHtml(chip.label)}<button class="parse-chip-dismiss" data-type="${chip.type}" aria-label="${escapeHtml(chipDismissLabel(chip.type))}">&times;</button></span>`
    const kept = existing.get(chip.key)
    if (kept && kept.dataset.chipSig === signature) {
      next.push(kept)
    } else {
      const holder = document.createElement('template')
      holder.innerHTML = html
      const el = holder.content.firstElementChild as HTMLElement
      next.push(el)
      if (!shownChipKeys.has(chip.key) && source === 'text') entering.push({ el, type: chip.type })
    }
    nextKeys.add(chip.key)
  }
  parsePreview.replaceChildren(...next)
  parsePreview.classList.remove('hidden')
  shownChipKeys = nextKeys
  for (const { el, type } of entering) animateChipIn(el, type)
}

// --- 工具栏：日期 / 提醒 / 优先级 / 标签 / 项目 / 备注 / 附加 ---
//
// 和主窗口新建任务输入框下面那排按钮是同一件事：文本里能写出来的东西（"明天 15:00 #标签 #收集箱"）
// 这里也能点出来，点出来的选择优先于文本，文本里那份就先让位（suppressedTypes），
// 免得同一个字段同时显示两个值。

interface ToolOption {
  key: string
  label: string
  selected?: boolean
  disabled?: boolean
}

interface ToolPopover {
  tool: string
  title: string
  /** 列表为空时的一句话（"还没有标签"）。 */
  empty?: string
  /** 列表上方的一句提醒（"提醒需要一个到期时间"）。 */
  note?: string
  /** 每次重画都重新算，标签多选来回点的时候列表要跟着变。 */
  items: () => ToolOption[]
  /** 返回 true 表示这次点选之后继续开着。 */
  onPick: (key: string) => boolean
}

/** 工具栏上做出的选择。undefined 表示「文本里怎么说就怎么来」。 */
let pickedDate: string | undefined
/** 选日期时从文本里带过来的时刻（"明天下午3点" + 点「下周一」= 下周一 15:00）。 */
let pickedTime: { hours: number; minutes: number } | null = null
let pickedPriority: number | null = null
let pickedLabelIds: number[] = []
let pickedProjectId: number | null = null
/** 提醒：undefined = 用设置里的默认提醒，null = 不提醒，数字 = 相对到期时间的偏移（秒）。 */
let pickedReminder: number | null | undefined
let activePopover: ToolPopover | null = null

const PRIORITY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Low' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'High' },
  { value: 4, label: 'Urgent' },
]

/** 提醒偏移：0 是「到期时」，负数是提前多久。key 走字符串，null 与 undefined 各占一个。 */
const REMINDER_OPTIONS: Array<{ key: string; label: string; offset: number | null | undefined }> = [
  { key: 'default', label: 'Default reminder', offset: undefined },
  { key: 'due', label: 'At due time', offset: 0 },
  { key: '1h', label: '1 hour before', offset: -3600 },
  { key: '1d', label: '1 day before', offset: -86400 },
  { key: 'off', label: 'No reminder', offset: null },
]

/** 任务最后会用到的到期时间：工具栏选的优先，其次是文本里解析出来的。 */
function effectiveDue(): { value: string | null; hasTime: boolean } {
  if (pickedDate !== undefined) {
    if (pickedTime) {
      // 只选了哪一天：文本里的时刻留在这一天，不因为换日子被抹掉
      const day = new Date(pickedDate)
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), pickedTime.hours, pickedTime.minutes, 0, 0)
      return { value: at.toISOString(), hasTime: true }
    }
    return { value: pickedDate, hasTime: !isDateOnly(pickedDate) }
  }
  if (parserConfig.enabled && lastParseResult?.dueDate) {
    return { value: parsedDue(lastParseResult.dueDate, lastParseResult.dueHasTime), hasTime: lastParseResult.dueHasTime }
  }
  if (!parserConfig.enabled && exclamationTodayEnabled) {
    const bang = extractBangToday(input.value)
    if (bang.dueDate) return { value: dueToday(), hasTime: false }
  }
  return { value: null, hasTime: false }
}

function effectivePriority(): number {
  if (pickedPriority !== null) return pickedPriority
  if (parserConfig.enabled && lastParseResult?.priority) return lastParseResult.priority
  return 0
}

/** 标签是并集：文本里写的，加上工具栏里点上的。 */
function effectiveLabelNames(): string[] {
  const names = new Set<string>()
  if (parserConfig.enabled && lastParseResult) {
    for (const label of lastParseResult.labels) names.add(label)
  }
  for (const id of pickedLabelIds) {
    const label = cachedLabels.find((candidate) => candidate.id === id)
    if (label) names.add(label.title)
  }
  return [...names]
}

function effectiveProjectId(): number | null {
  if (pickedProjectId !== null) return pickedProjectId
  if (parserConfig.enabled && lastParseResult?.project) {
    const name = lastParseResult.project.toLowerCase()
    const match = cachedProjects.find((project) => project.title.toLowerCase() === name)
    if (match) return match.id
  }
  return projectCycle.length > 0 ? projectCycle[currentProjectIndex].id : null
}

/** 项目按钮上写的名字：缓存里有就用它，否则退回那一位（默认是收件箱）。 */
function projectLabelOf(id: number | null): string {
  if (id !== null) {
    const known = cachedProjects.find((project) => project.id === id)
    if (known) return known.title
    const cycled = projectCycle.find((project) => project.id === id)
    if (cycled?.title) return cycled.title
  }
  return t('Inbox')
}

function priorityLabelOf(priority: number): string {
  const option = PRIORITY_OPTIONS.find((candidate) => candidate.value === priority)
  return option ? t(option.label) : t('Priority')
}

function reminderLabelOf(reminder: number | null | undefined): string {
  if (reminder === undefined) return t('Reminder')
  if (reminder === null) return t('No reminder')
  if (reminder === 0) return t('At due time')
  if (reminder === -3600) return t('1 hour before')
  if (reminder === -86400) return t('1 day before')
  return t('Reminder')
}

/** 把工具栏上的值写回按钮：文字、激活色、发送键的可用状态。 */
function refreshToolbar(): void {
  const due = effectiveDue()
  toolDateLabel.textContent = due.value
    ? formatDateChip(new Date(due.value), !due.hasTime, new Date(), getDateFormat())
    : t('Date')
  toolDate.classList.toggle('active', !!due.value)

  toolReminderLabel.textContent = reminderLabelOf(pickedReminder)
  toolReminder.classList.toggle('active', pickedReminder !== undefined && pickedReminder !== null)

  const priority = effectivePriority()
  toolPriorityLabel.textContent = priority > 0 ? priorityLabelOf(priority) : t('Priority')
  toolPriority.classList.toggle('active', priority > 0)

  const labelCount = effectiveLabelNames().length
  toolLabelsLabel.textContent = labelCount === 0
    ? t('Labels')
    : labelCount === 1
      ? t('{0} label', labelCount)
      : t('{0} labels', labelCount)
  toolLabels.classList.toggle('active', labelCount > 0)

  toolProjectLabel.textContent = projectLabelOf(effectiveProjectId())

  const notesOpen = isDescriptionExpanded() || descriptionInput.value.trim().length > 0
  toolNotes.classList.toggle('active', notesOpen)
  toolNotes.setAttribute('aria-pressed', notesOpen ? 'true' : 'false')

  sendButton.disabled = input.value.trim().length === 0
}

function closeToolPopover(): void {
  activePopover = null
  toolPopover.classList.add('hidden')
  toolPopover.replaceChildren()
  for (const button of toolbar.querySelectorAll<HTMLElement>('.tool-button')) {
    button.setAttribute('aria-expanded', 'false')
  }
}

function renderToolPopover(): void {
  const popover = activePopover
  if (!popover) return
  toolPopover.replaceChildren()

  const heading = document.createElement('div')
  heading.className = 'tool-popover-title'
  heading.textContent = popover.title
  toolPopover.appendChild(heading)

  if (popover.note) {
    const note = document.createElement('div')
    note.className = 'tool-option-empty'
    note.textContent = popover.note
    toolPopover.appendChild(note)
  }

  const items = popover.items()
  if (items.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'tool-option-empty'
    empty.textContent = popover.empty ?? ''
    toolPopover.appendChild(empty)
  }
  for (const item of items) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `tool-option${item.selected ? ' selected' : ''}`
    button.dataset.key = item.key
    button.setAttribute('role', 'option')
    button.setAttribute('aria-selected', item.selected ? 'true' : 'false')
    button.disabled = item.disabled === true
    const label = document.createElement('span')
    label.textContent = item.label
    button.appendChild(label)
    if (item.selected) {
      const check = document.createElement('span')
      check.className = 'tool-check'
      check.setAttribute('aria-hidden', 'true')
      check.textContent = '\u2713'
      button.insertBefore(check, label)
    }
    button.addEventListener('click', () => {
      if (button.disabled) return
      const keepOpen = popover.onPick(item.key)
      if (keepOpen) renderToolPopover()
      else closeToolPopover()
    })
    toolPopover.appendChild(button)
  }

  toolPopover.classList.remove('hidden')
  for (const button of toolbar.querySelectorAll<HTMLElement>('.tool-button')) {
    button.setAttribute('aria-expanded', button.dataset.tool === popover.tool ? 'true' : 'false')
  }
}

function showToolPopover(popover: ToolPopover): void {
  // 同一个按钮再按一次就收起来
  if (activePopover?.tool === popover.tool) {
    closeToolPopover()
    return
  }
  activePopover = popover
  renderToolPopover()
}

/** 让文本里某一类识别结果让位（工具栏上已经定了这个字段）。 */
function suppressTokenType(type: TokenType): void {
  const rawTexts = lastParseResult?.tokens
    .filter((token) => token.type === type)
    .map((token) => input.value.substring(token.start, token.end)) ?? []
  if (rawTexts.length > 0) suppressedTypes.set(type, rawTexts)
  else suppressedTypes.delete(type)
  handleInputChange()
}

function pickDateOption(key: string): void {
  if (key === 'clear') {
    // 清除是一次动作，不是一种「永远没有日期」的状态：把这个日期从文本里让开，
    // 之后再写新的日期照样生效。
    pickedDate = undefined
    pickedTime = null
  } else {
    // 文本里带时刻的话，换日子时把那个时刻一起带过去
    const parsed = parserConfig.enabled ? lastParseResult : null
    pickedTime = parsed?.dueDate && parsed.dueHasTime
      ? { hours: parsed.dueDate.getHours(), minutes: parsed.dueDate.getMinutes() }
      : null
    pickedDate = key === 'today' ? dueToday() : key === 'tomorrow' ? dueTomorrow() : dueNextWeek()
  }
  // 文本里的日期退到后面去，别让按钮和 chip 显示两个时间
  suppressTokenType('date')
  refreshToolbar()
  input.focus()
}

function pickPriorityOption(key: string): void {
  const value = Number(key)
  pickedPriority = Number.isFinite(value) && value > 0 ? value : 0
  suppressTokenType('priority')
  refreshToolbar()
  input.focus()
}

function pickProjectOption(key: string): void {
  const value = Number(key)
  pickedProjectId = Number.isFinite(value) && value > 0 ? value : null
  suppressTokenType('project')
  refreshToolbar()
  input.focus()
}

function toggleLabelOption(key: string): boolean {
  const id = Number(key)
  if (!Number.isFinite(id)) return true
  pickedLabelIds = pickedLabelIds.includes(id)
    ? pickedLabelIds.filter((candidate) => candidate !== id)
    : [...pickedLabelIds, id]
  refreshToolbar()
  return true
}

function pickReminderOption(key: string): void {
  const option = REMINDER_OPTIONS.find((candidate) => candidate.key === key)
  pickedReminder = option ? option.offset : undefined
  refreshToolbar()
  input.focus()
}

toolDate.addEventListener('click', () => {
  const due = effectiveDue()
  const today = dueToday()
  const tomorrow = dueTomorrow()
  const nextWeek = dueNextWeek()
  // 按「哪一天」比，不按时刻比：明天 15:00 也应该点亮「明天」
  const dueDay = due.value ? localDateOf(due.value) : ''
  showToolPopover({
    tool: 'date',
    title: t('Date'),
    items: () => [
      { key: 'today', label: 'Today', selected: dueDay === localDateOf(today) },
      { key: 'tomorrow', label: 'Tomorrow', selected: dueDay === localDateOf(tomorrow) },
      { key: 'nextweek', label: 'Next Monday', selected: dueDay === localDateOf(nextWeek) },
      // 清除是一个动作，不是一种「当前状态」，所以不带选中标记
      { key: 'clear', label: 'Clear' },
    ],
    onPick: (key) => { pickDateOption(key); return false },
  })
})

toolReminder.addEventListener('click', () => {
  const hasDue = effectiveDue().value !== null
  showToolPopover({
    tool: 'reminder',
    title: t('Reminder'),
    note: hasDue ? undefined : t('A reminder needs a due date.'),
    items: () => REMINDER_OPTIONS
      // 没有到期时间时，相对提醒没有落点，只留「默认」和「不提醒」两个选项
      .filter((option) => hasDue || option.offset === undefined || option.offset === null)
      .map((option) => ({
        key: option.key,
        label: option.label,
        selected: pickedReminder === option.offset,
      })),
    onPick: (key) => { pickReminderOption(key); return false },
  })
})

toolPriority.addEventListener('click', () => {
  const current = effectivePriority()
  showToolPopover({
    tool: 'priority',
    title: t('Priority'),
    items: () => PRIORITY_OPTIONS.map((option) => ({
      key: String(option.value),
      label: option.label,
      selected: current === option.value,
    })),
    onPick: (key) => { pickPriorityOption(key); return false },
  })
})

toolLabels.addEventListener('click', () => {
  showToolPopover({
    tool: 'labels',
    title: t('Labels'),
    empty: t('No labels'),
    items: () => cachedLabels.map((label) => ({
      key: String(label.id),
      label: label.title,
      selected: pickedLabelIds.includes(label.id),
    })),
    onPick: (key) => toggleLabelOption(key),
  })
})

toolProject.addEventListener('click', () => {
  const current = effectiveProjectId()
  showToolPopover({
    tool: 'project',
    title: t('Project'),
    empty: t('No projects'),
    items: () => cachedProjects.map((project) => ({
      key: String(project.id),
      label: project.title,
      selected: current === project.id,
    })),
    onPick: (key) => { pickProjectOption(key); return false },
  })
})

toolNotes.addEventListener('click', () => {
  closeToolPopover()
  if (isDescriptionExpanded()) collapseDescription(false)
  else expandDescription()
  refreshToolbar()
})

document.getElementById('tool-attach')!.addEventListener('click', () => {
  closeToolPopover()
  attachInput.click()
})

attachInput.addEventListener('change', async () => {
  const files = Array.from(attachInput.files ?? [])
  attachInput.value = ''
  // 和粘贴走同一条路：图片先暂存，保存任务时再上传
  if (files.length === 0) return
  if (!isDescriptionExpanded()) expandDescription()
  for (const file of files) {
    try {
      await stageImageFile(file, file.name || 'image', file.type || 'application/octet-stream')
    } catch {
      showError('Failed to read pasted image')
    }
  }
  refreshToolbar()
})

sendButton.addEventListener('click', () => { void saveTask() })

// --- Image staging ---

function renderImageGallery(): void {
  imageGallery.innerHTML = ''
  if (pendingImages.length === 0) {
    imageGallery.classList.add('hidden')
    return
  }
  imageGallery.classList.remove('hidden')
  for (const img of pendingImages) {
    const item = document.createElement('div')
    item.className = 'image-gallery-item'
    item.dataset.uuid = img.uuid

    const el = document.createElement('img')
    el.src = img.blobUrl
    el.alt = img.name
    el.draggable = false
    item.appendChild(el)

    const del = document.createElement('button')
    del.type = 'button'
    del.className = 'image-gallery-delete'
    del.title = 'Remove image'
    del.innerHTML = '&times;'
    del.addEventListener('mousedown', (e) => e.preventDefault())
    del.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      removePendingImage(img.uuid)
    })
    item.appendChild(del)

    imageGallery.appendChild(item)
  }
}

function addPendingImage(img: PendingImage): void {
  pendingImages.push(img)
  renderImageGallery()
}

/** 一张图片进暂存区（粘贴和工具栏「附加」共用这一条路）。 */
async function stageImageFile(file: File, name: string, mime: string): Promise<void> {
  const bytes = await fileToUint8Array(file)
  const blobUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  addPendingImage({
    uuid: crypto.randomUUID().slice(0, 8),
    blobUrl,
    bytes,
    name,
    mime,
  })
}

function removePendingImage(uuid: string): void {
  const idx = pendingImages.findIndex((p) => p.uuid === uuid)
  if (idx < 0) return
  URL.revokeObjectURL(pendingImages[idx].blobUrl)
  pendingImages.splice(idx, 1)
  renderImageGallery()
}

function clearPendingImages(): void {
  for (const img of pendingImages) URL.revokeObjectURL(img.blobUrl)
  pendingImages = []
  renderImageGallery()
}

function clearNlpState(): void {
  inputHighlight.innerHTML = ''
  parsePreview.innerHTML = ''
  shownChipKeys = new Set()
  parsePreview.classList.add('hidden')
  lastParseResult = null
  suppressedTypes = new Map()
}

async function saveTask(): Promise<void> {
  const raw = input.value.trim()
  if (!raw) return

  // The notes are plain text: escaped, one <p> per line, the same with or without a link below
  // (description format contract). Empty notes stay null.
  let description: string | null = plainTextToDescriptionHtml(descriptionInput.value) || null

  // Inject Obsidian note link into description. Only now, with the note linked and the task being
  // saved, does main add the uid to the note (D-OBS-1); if that fails the shown link is used.
  if (obsidianLinked && obsidianContext) {
    if (resolvingObsidianLink) return
    resolvingObsidianLink = true
    let link = { deepLink: obsidianContext.deepLink, noteName: obsidianContext.noteName }
    try {
      const resolved = await window.quickEntryApi.resolveObsidianLink()
      if (resolved) link = { deepLink: resolved.deepLink, noteName: resolved.noteName }
    } catch { /* keep the link that was shown */ } finally {
      resolvingObsidianLink = false
    }
    const linkHtml = buildNoteLinkHtml(link.deepLink, link.noteName)
    description = description ? `${description}${linkHtml}` : linkHtml
  }

  // Inject browser page link into description
  if (!obsidianLinked && browserLinked && browserContext) {
    const linkHtml = buildPageLinkHtml(browserContext.url, browserContext.title)
    description = description ? `${description}${linkHtml}` : linkHtml
  }

  let title = raw
  let dueDate: string | null = null
  let priority: number | undefined
  let repeatAfter: number | undefined
  let repeatMode: number | undefined
  let projectId = projectCycle.length > 0 ? projectCycle[currentProjectIndex].id : null
  let parsedLabels: string[] = []
  let location: { place: string; trigger: 'arrive' | 'leave' } | undefined

  if (parserConfig.enabled && lastParseResult) {
    title = lastParseResult.title
    if (!title) return

    if (lastParseResult.dueDate) {
      // A parsed time ("tomorrow at 3pm") is kept; a bare date is date-only. The parse result
      // is only read, never changed: the preview chips keep rendering from it.
      dueDate = parsedDue(lastParseResult.dueDate, lastParseResult.dueHasTime)
    }

    if (lastParseResult.priority !== null && lastParseResult.priority > 0) {
      priority = lastParseResult.priority
    }

    if (lastParseResult.recurrence) {
      const vik = recurrenceToVikunja(lastParseResult.recurrence)
      repeatAfter = vik.repeat_after
      repeatMode = vik.repeat_mode
    }

    // Resolve project name to ID
    if (lastParseResult.project) {
      const projName = lastParseResult.project.toLowerCase()
      const match = cachedProjects.find((p) => p.title.toLowerCase() === projName)
      if (match) projectId = match.id
    }

    parsedLabels = lastParseResult.labels
    if (lastParseResult.place) location = { place: lastParseResult.place.place.id, trigger: lastParseResult.place.trigger }
  } else {
    // Parser off: only the `!` → today shortcut applies, with the same rule as the other entry
    // points (standalone, leading or trailing `!`; a `!` inside the text is not a date).
    if (exclamationTodayEnabled) {
      const bang = extractBangToday(title)
      if (bang.dueDate) {
        title = bang.title.trim()
        if (!title) return
        dueDate = dueToday()
      }
    }
  }

  input.disabled = true
  descriptionInput.disabled = true
  clearError()

  // 工具栏上点过的东西盖过文本：日期、优先级、项目各一份，标签是并集。
  if (pickedDate !== undefined) dueDate = pickedDate
  if (pickedPriority !== null) priority = pickedPriority > 0 ? pickedPriority : undefined
  if (pickedProjectId !== null) projectId = pickedProjectId
  if (pickedLabelIds.length > 0) {
    const picked = pickedLabelIds
      .map((id) => cachedLabels.find((label) => label.id === id)?.title)
      .filter((name): name is string => !!name)
    parsedLabels = [...new Set([...parsedLabels, ...picked])]
  }

  // Labels and pasted images ride along: if the create has to be queued offline the queue keeps
  // them and replays them after the task exists. Online, they are applied below as before.
  const labelRefs = parsedLabels.map((name) => {
    const match = cachedLabels.find((l) => l.title.toLowerCase() === name.toLowerCase())
    return match ? { id: match.id, title: match.title } : { title: name }
  })
  const imageInputs = pendingImages.map((img) => ({ name: img.name, mime: img.mime, bytes: img.bytes }))
  // 工具栏上选过提醒才发过去；没选过就交给主进程用设置里的默认提醒。
  const reminder = pickedReminder === undefined ? undefined : { offset: pickedReminder }
  const result = await window.quickEntryApi.saveTask(title, description || null, dueDate, projectId, priority, repeatAfter, repeatMode, { labels: labelRefs, images: imageInputs, location, reminder, block: parserConfig.enabled ? blockFields(lastParseResult) : null })

  if (result.success) {
    const createdTask = result.data as (Record<string, unknown> & { id?: number }) | undefined
    const taskId = createdTask?.id

    // Labels and images go on after the create. A step the network drops is queued, not lost.
    let queuedFollowUps = false
    if (taskId && (labelRefs.length > 0 || imageInputs.length > 0)) {
      const outcome = await applyQuickEntryFollowUps(window.quickEntryApi, {
        taskId,
        title,
        description: description ?? '',
        labels: labelRefs,
        images: imageInputs,
      })
      queuedFollowUps = outcome.queuedLabels + outcome.queuedImages > 0 && !outcome.queueError
    }

    if (result.cached || queuedFollowUps) {
      showOfflineMessage(queuedFollowUps && !result.cached ? t('Task saved \u2014 labels and images will sync when connected') : undefined)
    } else {
      window.quickEntryApi.closeWindow()
    }
  } else {
    // "The task may already exist" is a sentence to read, not a flash: it stays up longer.
    showError(result.error || 'Failed to save task', result.mayExist ? 10_000 : 3000)
    input.disabled = false
    descriptionInput.disabled = false
    input.focus()
  }
}

// When the window is hidden, reset state immediately so next show starts clean
window.quickEntryApi.onHideWindow(() => {
  container.classList.remove('visible')
  resetInput()
  obsidianContext = null
  obsidianLinked = false
  updateObsidianUI()
  browserContext = null
  browserLinked = false
  updateBrowserUI()
})

function applyConfig(cfg: QuickEntryConfig): void {
  exclamationTodayEnabled = cfg.exclamation_today !== false
  projectCycleModifier = cfg.project_cycle_modifier || 'ctrl'
  buildProjectCycle(cfg)
  parserConfig = getParserConfig({ nlp_enabled: cfg.nlp_enabled, nlp_syntax_mode: cfg.nlp_syntax_mode, exclamation_today: cfg.exclamation_today, standalone_mode: cfg.standalone_mode })
  autocomplete.setSyntaxMode(parserConfig.syntaxMode)
  autocomplete.setEnabled(parserConfig.enabled)
}

// When the main process signals the window is shown
window.quickEntryApi.onShowWindow(() => {
  resetInput()

  // Apply cached config synchronously for instant UI
  if (lastConfig) applyConfig(lastConfig)

  // Show animation + focus immediately — no awaits before this
  container.classList.remove('visible')
  void container.offsetHeight
  container.classList.add('visible')
  input.focus()

  // 窗口隐藏时主进程不会照着内容改高度（改了也看不见），所以显示之后补一次。
  requestAnimationFrame(syncWindowHeight)

  // Refresh config, pending count, and labels/projects in the background
  window.quickEntryApi.getConfig().then((cfg) => {
    if (cfg) {
      lastConfig = cfg
      applyConfig(cfg)
    }
  }).catch(() => {})

  updatePendingIndicator().catch(() => {})
  refreshLabelsAndProjects()
})

// When background sync completes, update the pending count
window.quickEntryApi.onSyncCompleted(async () => {
  await updatePendingIndicator()
})

window.quickEntryApi.onDragHover((hovering: boolean) => {
  if (dragHandle) dragHandle.classList.toggle('hover', hovering)
})

// Keyboard handling on title input
input.addEventListener('keydown', async (e) => {
  if (autocomplete.handleKeyDown(e)) return
  // 下拉列表开着的时候，Escape 先收列表，再按一次才关窗口
  if (e.key === 'Escape' && activePopover) {
    e.preventDefault()
    closeToolPopover()
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
    e.preventDefault()
    if (obsidianContext) {
      obsidianLinked = !obsidianLinked
      updateObsidianUI()
    } else if (browserContext) {
      browserLinked = !browserLinked
      updateBrowserUI()
    }
    return
  }
  if (isProjectCycleModifierPressed(e) && e.key === 'ArrowRight') {
    e.preventDefault()
    cycleProject(1)
    return
  }
  if (isProjectCycleModifierPressed(e) && e.key === 'ArrowLeft') {
    e.preventDefault()
    cycleProject(-1)
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    window.quickEntryApi.closeWindow()
    return
  }
  if (e.key === 'Tab') {
    e.preventDefault()
    expandDescription()
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    await saveTask()
  }
})

// Keyboard handling on description textarea
descriptionInput.addEventListener('keydown', async (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
    e.preventDefault()
    if (obsidianContext) {
      obsidianLinked = !obsidianLinked
      updateObsidianUI()
    } else if (browserContext) {
      browserLinked = !browserLinked
      updateBrowserUI()
    }
    return
  }
  if (isProjectCycleModifierPressed(e) && e.key === 'ArrowRight') {
    e.preventDefault()
    cycleProject(1)
    return
  }
  if (isProjectCycleModifierPressed(e) && e.key === 'ArrowLeft') {
    e.preventDefault()
    cycleProject(-1)
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    window.quickEntryApi.closeWindow()
    return
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    await saveTask()
  }
})

// IME composition guard
input.addEventListener('compositionstart', () => { isComposing = true })
input.addEventListener('compositionend', () => {
  isComposing = false
  handleInputChange()
})

// Scroll sync for highlight overlay
input.addEventListener('scroll', () => {
  inputHighlight.scrollLeft = input.scrollLeft
})

function handleInputChange(): void {
  updateTodayHints()

  const raw = input.value

  // Update autocomplete on every input change
  autocomplete.update(raw, input.selectionStart ?? raw.length)

  if (!parserConfig.enabled || !raw) {
    clearNlpState()
    refreshToolbar()
    return
  }

  const configWithSuppress: ParserConfig = suppressedTypes.size > 0
    ? { ...parserConfig, suppressTypes: [...(parserConfig.suppressTypes ?? []), ...suppressedTypes.keys()] }
    : parserConfig
  const result = parse(raw, configWithSuppress, new Date(), cachedPlaces)
  lastParseResult = result
  renderHighlights(raw, result.tokens)
  renderParsePreview(result)

  // Hide legacy today hints when parser is active and found a date
  if (result.dueDate) {
    todayHintInline.classList.add('hidden')
    todayHintBelow.classList.add('hidden')
  }

  // 按钮上的日期、优先级、标签跟着文本一起变
  refreshToolbar()
}

// Detect input changes and run parser
input.addEventListener('input', () => {
  if (isComposing) return
  // Lift suppressions only for types whose raw token text was modified
  if (suppressedTypes.size > 0) {
    const val = input.value
    let changed = false
    for (const [type, rawTexts] of suppressedTypes) {
      if (!rawTexts.every((t) => val.includes(t))) {
        suppressedTypes.delete(type)
        changed = true
      }
    }
    if (changed && suppressedTypes.size === 0) suppressedTypes = new Map()
  }
  handleInputChange()
})

// Image paste — works on both title and description; auto-expands description.
async function handleImagePaste(e: ClipboardEvent): Promise<void> {
  const images = getClipboardImages(e)
  if (images.length === 0) return // allow native text paste
  e.preventDefault()
  if (!isDescriptionExpanded()) expandDescription()
  for (const img of images) {
    try {
      await stageImageFile(img.file, img.name, img.mime)
    } catch {
      showError('Failed to read pasted image')
    }
  }
}

input.addEventListener('paste', handleImagePaste)
descriptionInput.addEventListener('paste', handleImagePaste)

// Obsidian badge remove button
obsidianBadgeRemove.addEventListener('click', () => {
  obsidianLinked = false
  updateObsidianUI()
})

browserBadgeRemove.addEventListener('click', () => {
  browserLinked = false
  updateBrowserUI()
})

// Dismiss parsed token chips — event delegation on the preview container
parsePreview.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.parse-chip-dismiss') as HTMLElement | null
  if (!btn) return
  const tokenType = btn.dataset.type as TokenType | undefined
  if (!tokenType) return
  // 记下原文，用户改到这段文字时抑制自动解除（见 input 的 listener）
  suppressTokenType(tokenType)
  refreshToolbar()
  input.focus()
})

// Obsidian context listener
window.quickEntryApi.onObsidianContext((ctx) => {
  if (!ctx) {
    obsidianContext = null
    obsidianLinked = false
    updateObsidianUI()
    return
  }
  obsidianContext = { deepLink: ctx.deepLink, noteName: ctx.noteName, isUidBased: ctx.isUidBased }
  obsidianLinked = ctx.mode === 'always'
  updateObsidianUI()
})

// Browser context listener
window.quickEntryApi.onBrowserContext((ctx) => {
  if (!ctx) {
    browserContext = null
    browserLinked = false
    updateBrowserUI()
    return
  }
  browserContext = { url: ctx.url, title: ctx.title, displayTitle: ctx.displayTitle }
  browserLinked = ctx.mode === 'always'
  updateBrowserUI()
})

// 小窗是手写 DOM，没有 JSX 可以插桩，用节点级翻译兜住界面文案
initLocale()
startDomTranslation()

// 语言是在设置里换的，这个小窗可能早就开着：换完重新载入一次，整页文案跟着换。
window.quickEntryApi.onLocaleChanged(() => { location.reload() })

// Dates follow the system locale and the Settings clock choice; main sends them and any change.
void initDateFormat(window.quickEntryApi)
subscribeDateFormat(() => {
  if (lastParseResult) renderParsePreview(lastParseResult)
  refreshToolbar()
})

// Load config on startup
async function loadInitialConfig(): Promise<void> {
  const cfg = await window.quickEntryApi.getConfig()
  if (cfg) {
    lastConfig = cfg
    applyConfig(cfg)
  }
  refreshLabelsAndProjects()
  refreshToolbar()

  await updatePendingIndicator()
  // --quick-entry 启动时窗口可能已经显示，ResizeObserver 那次早于可见性设置
  requestAnimationFrame(syncWindowHeight)
}
loadInitialConfig()

// Close window when clicking outside the container (transparent area); inside, a click away from
// the toolbar only closes the list it opened.
document.addEventListener('mousedown', (e) => {
  const target = e.target as Node
  if (!container.contains(target)) {
    window.quickEntryApi.closeWindow()
    return
  }
  if (activePopover && !toolbar.contains(target) && !toolPopover.contains(target)) closeToolPopover()
})

// Initial animation on first load
requestAnimationFrame(() => {
  container.classList.add('visible')
  input.focus()
  syncWindowHeight()
})

// Keep the window height matched to the container so rounded corners stay visible
// as the description grows, images are added, or a toolbar list opens.
function syncWindowHeight(): void {
  const h = container.offsetHeight
  if (h > 0) window.quickEntryApi.setHeight(h)
}

const resizeObserver = new ResizeObserver(() => {
  syncWindowHeight()
})
resizeObserver.observe(container)

export {}
