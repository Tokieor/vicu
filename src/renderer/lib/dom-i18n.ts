// 给非 React 的两个小窗（快速录入 quick-entry、快速查看 quick-view）用的 DOM 级翻译。
//
// 这两个页面是手写 DOM + innerHTML 拼字符串，没有 JSX 可插桩；文案又分散在 HTML 和
// 各处逻辑里。这里按「节点文本 / 几个可读属性」查同一份字典，命中就替换，
// 英文模式下 t() 原样返回 key，等于什么都不做。
//
// 只处理文本节点与 placeholder/title/aria-label，文本节点不进 input、textarea、contenteditable
// （用户输入的内容不会被碰到）；placeholder 恰好长在这两个标签上，所以它们的属性要单独翻。
import { hasTranslation, t } from '../../shared/i18n'

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE'])
// 输入框里的文字是用户的，可它们的 placeholder 是界面的：属性照翻，文本节点不碰。
const ATTRIBUTE_ONLY_TAGS = new Set(['TEXTAREA', 'INPUT'])
const TEXT_ATTRIBUTES = ['placeholder', 'title', 'aria-label']

const WHITESPACE = /\s+/g

function normalize(text: string): string {
  return text.replace(WHITESPACE, ' ').trim()
}

function translateTextNode(node: Text): void {
  const raw = node.nodeValue
  if (!raw) return
  const key = normalize(raw)
  if (!key || !hasTranslation(key)) return

  const leading = /^\s/.test(raw) ? raw.slice(0, raw.length - raw.trimStart().length) : ''
  const trailing = /\s$/.test(raw) ? raw.slice(raw.trimEnd().length) : ''
  const next = leading + t(key) + trailing
  if (next !== raw) node.nodeValue = next
}

function translateElement(element: Element): void {
  if (SKIP_TAGS.has(element.tagName) && !ATTRIBUTE_ONLY_TAGS.has(element.tagName)) return
  if (element.getAttribute('contenteditable') === 'true') return
  for (const attribute of TEXT_ATTRIBUTES) {
    const value = element.getAttribute(attribute)
    if (!value) continue
    const key = normalize(value)
    if (!key || !hasTranslation(key)) continue
    const next = t(key)
    if (next !== value) element.setAttribute(attribute, next)
  }
}

function translateTree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text)
    return
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return
  if (root.nodeType === Node.ELEMENT_NODE) {
    const element = root as Element
    // 输入框只翻属性，不进它的子节点（那里是用户输入的值）
    if (ATTRIBUTE_ONLY_TAGS.has(element.tagName)) {
      translateElement(element)
      return
    }
    if (SKIP_TAGS.has(element.tagName)) return
    translateElement(element)
  }
  for (const child of Array.from(root.childNodes)) translateTree(child)
}

/**
 * 先把当前页面翻译一遍，再盯着后续的 DOM 变化。
 * 返回的函数用来断开监听（页面卸载时调用）。
 */
export function startDomTranslation(): () => void {
  translateTree(document.body)

  let scheduled = false
  const pending = new Set<Node>()

  const flush = (): void => {
    scheduled = false
    for (const node of pending) {
      if (node.isConnected) translateTree(node)
    }
    pending.clear()
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') {
        pending.add(record.target)
      } else {
        for (const node of Array.from(record.addedNodes)) pending.add(node)
      }
    }
    if (scheduled || pending.size === 0) return
    scheduled = true
    queueMicrotask(flush)
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  return () => observer.disconnect()
}
