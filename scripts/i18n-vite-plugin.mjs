// 编译期 i18n 插桩插件（仅用于 renderer 构建）。
//
// 做的事：把 JSX 里「字典中存在的」英文文案包成 __vicu_t("...")，
//   - JSXText            <p>Cancel</p>            → <p>{__vicu_t("Cancel")}</p>
//   - 指定属性           title="Cancel"            → title={__vicu_t("Cancel")}
//   - JSX 内的模板字符串  {`${n} tasks`}            → {__vicu_t("{0} tasks", n)}
// 只包字典命中的文案，所以业务数据（用户任务标题等）永远不会被误翻译；
// 英文模式下 t() 原样返回 key，行为与汉化前完全一致。
//
// 字典来源是 src/shared/i18n/zh.ts（由 scripts/gen-i18n-zh.py 生成），
// 这里直接解析它的 key，避免插件再依赖一套 TS 构建链。

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import _generate from '@babel/generator'
import * as t from '@babel/types'

const traverse = _traverse.default ?? _traverse
const generate = _generate.default ?? _generate

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DICT_PATH = join(ROOT, 'src', 'shared', 'i18n', 'zh.ts')
const IMPORT_SOURCE = '@/lib/i18n'
const IDENT = '__vicu_t'

// 会出现在界面上、内容为纯文案的属性名。
// label/unsetLabel/unsetName 也只处理「字典命中的字面量」，变量属性（option.label 等）不碰，
// 避免把用户数据当文案翻译；这类交给源码里的渲染期 t() 处理。
const TEXT_ATTRIBUTES = new Set([
  'placeholder',
  'title',
  'aria-label',
  'aria-placeholder',
  'aria-description',
  'alt',
  'label',
  'unsetLabel',
  'unsetName',
  'heading',
  'subtitle',
  'description',
  'emptyText',
  'emptyTitle',
  'emptySubtitle',
  // 确认弹窗/表单按钮文案：这些属性最终会作为按钮文字渲染，
  // 但调用方常常传字面量，编译期不处理就会漏翻。
  'confirmLabel',
  'secondaryLabel',
  'cancelLabel',
  'submitLabel',
  'okLabel',
  'actionLabel',
])

// 对象字面量里承载界面文案的键（{ label: 'Today' } 这类内联选项表）
const TEXT_KEYS = new Set(['label', 'title', 'description', 'placeholder', 'name', 'text', 'hint', 'message'])

const WS = /\s+/g

function normalize(text) {
  return text.replace(WS, ' ').trim()
}

let cachedKeys = null

function dictionaryKeys() {
  if (cachedKeys) return cachedKeys
  const source = readFileSync(DICT_PATH, 'utf8')
  const keys = new Set()
  // 生成文件格式固定：  "key": "value",
  const line = /^\s*("(?:[^"\\]|\\.)*"):/gm
  let match
  while ((match = line.exec(source)) !== null) {
    try {
      keys.add(JSON.parse(match[1]))
    } catch {
      // 跳过解析不了的键
    }
  }
  cachedKeys = keys
  return keys
}

export function i18nPlugin(options = {}) {
  const include = options.include ?? null // 只处理该目录下的文件
  let enabled = true

  return {
    name: 'vicu-i18n',
    enforce: 'pre',

    configResolved(config) {
      // 只对渲染进程生效（主进程/预加载是纯逻辑，插桩没有意义且有风险）
      enabled = config.build?.ssr !== true
    },

    transform(code, id) {
      if (!enabled) return null
      const clean = id.split('?')[0]
      if (!/\.(jsx|tsx)$/.test(clean)) return null
      if (clean.includes('__tests__') || /\.(test|spec)\./.test(clean)) return null
      if (include && !clean.replace(/\\/g, '/').includes(include)) return null
      if (!code.includes('<')) return null

      const keys = dictionaryKeys()
      if (keys.size === 0) return null

      let ast
      try {
        ast = parse(code, {
          sourceType: 'module',
          plugins: ['jsx', 'typescript'],
          errorRecovery: false,
        })
      } catch {
        // 解析不了就原样交给后续插件，绝不阻断构建
        return null
      }

      let changed = false
      let needsImport = false

      const call = (key, args = []) =>
        t.callExpression(t.identifier(IDENT), [t.stringLiteral(key), ...args])

      traverse(ast, {
        JSXText(path) {
          const raw = path.node.value
          const key = normalize(raw)
          if (!key || !keys.has(key)) return

          const leading = /^\s/.test(raw)
          const trailing = /\s$/.test(raw)
          const nodes = []
          if (leading) nodes.push(t.jsxText(' '))
          nodes.push(t.jsxExpressionContainer(call(key)))
          if (trailing) nodes.push(t.jsxText(' '))
          path.replaceWithMultiple(nodes)
          changed = true
          needsImport = true
        },

        JSXAttribute(path) {
          const nameNode = path.node.name
          if (!t.isJSXIdentifier(nameNode) || !TEXT_ATTRIBUTES.has(nameNode.name)) return
          const value = path.node.value
          if (!t.isStringLiteral(value)) return

          const exact = value.value
          const collapsed = normalize(exact)
          const key = keys.has(exact) ? exact : keys.has(collapsed) ? collapsed : null
          if (!key) return

          path.node.value = t.jsxExpressionContainer(call(key))
          changed = true
          needsImport = true
        },

        TemplateLiteral(path) {
          // 只处理直接出现在 JSX 里的模板字符串，普通逻辑里的模板（URL、SQL 等）不动
          if (!path.parentPath.isJSXExpressionContainer()) return
          const { quasis, expressions } = path.node
          let key = ''
          quasis.forEach((quasi, index) => {
            key += quasi.value.cooked ?? quasi.value.raw
            if (index < expressions.length) key += `{${index}}`
          })
          key = normalize(key)
          if (!key || !keys.has(key)) return
          // 参数原样传入（占位符顺序与表达式顺序一致）
          path.replaceWith(call(key, expressions))
          changed = true
          needsImport = true
        },

        // {cond && 'Cancel'}、{a ? 'Yes' : 'No'}、{'Plain'}、{a ? 'A' : b ? 'B' : 'C'}
        // 这类写在表达式里的文案不会成为 JSXText，单独处理。嵌套三元要递归到每一层分支，
        // 否则 {pending ? 'Saving…' : project ? 'Save' : 'Create'} 里只有最外层会被翻。
        JSXExpressionContainer(path) {
          const wrapLiteral = (literalPath) => {
            if (!literalPath.isStringLiteral()) return
            const key = normalize(literalPath.node.value)
            if (!key || !keys.has(key)) return
            literalPath.replaceWith(call(key))
            changed = true
            needsImport = true
          }

          // 只沿着「条件/逻辑表达式」向下走，不进入任意表达式，避免碰到业务数据拼接。
          const wrapBranch = (branch) => {
            if (!branch) return
            if (branch.isStringLiteral()) {
              wrapLiteral(branch)
            } else if (branch.isConditionalExpression()) {
              wrapBranch(branch.get('consequent'))
              wrapBranch(branch.get('alternate'))
            } else if (
              branch.isLogicalExpression() &&
              (branch.node.operator === '&&' || branch.node.operator === '||')
            ) {
              wrapBranch(branch.get('right'))
            }
          }

          const expression = path.get('expression')
          if (expression.isStringLiteral()) {
            wrapLiteral(expression)
          } else if (
            expression.isLogicalExpression() &&
            (expression.node.operator === '&&' || expression.node.operator === '||')
          ) {
            wrapBranch(expression)
          } else if (expression.isConditionalExpression()) {
            wrapBranch(expression)
          }
        },

        // {[{ value: 'today', label: 'Today' }].map(...)}：写在 JSX 里的选项表。
        // 只处理渲染期求值的字面量；模块级常量包 t() 只会在加载时求值一次，语言切换后不会更新，
        // 那种情况留给源码里的渲染处调用 t()。
        ObjectProperty(path) {
          const keyNode = path.node.key
          const name = t.isIdentifier(keyNode) ? keyNode.name : t.isStringLiteral(keyNode) ? keyNode.value : null
          if (!name || !TEXT_KEYS.has(name)) return
          if (!t.isStringLiteral(path.node.value)) return
          const text = normalize(path.node.value.value)
          if (!text || !keys.has(text)) return
          if (!insideJsxExpression(path)) return
          path.node.value = call(text)
          changed = true
          needsImport = true
        },
      })

      if (!changed) return null

      if (needsImport && !hasImport(ast)) {
        ast.program.body.unshift(
          t.importDeclaration(
            [t.importSpecifier(t.identifier(IDENT), t.identifier('t'))],
            t.stringLiteral(IMPORT_SOURCE)
          )
        )
      }

      const output = generate(ast, { sourceMaps: true, retainLines: false }, code)
      return { code: output.code, map: output.map }
    },
  }
}

function hasImport(ast) {
  // 必须按本地名判断：文件里可能已经 import 了 t（源码手写的），
  // 但插桩用的是 __vicu_t 这个别名，两者不是同一个绑定。
  return ast.program.body.some(
    (node) =>
      t.isImportDeclaration(node) &&
      node.source.value === IMPORT_SOURCE &&
      node.specifiers.some((s) => t.isImportSpecifier(s) && s.local.name === IDENT)
  )
}

/** 该节点是否在 JSX 表达式里（渲染期求值），中间不跨越函数或模块边界。 */
function insideJsxExpression(path) {
  let current = path.parentPath
  while (current) {
    if (current.isJSXExpressionContainer()) return true
    if (current.isProgram() || current.isFunction()) return false
    current = current.parentPath
  }
  return false
}

export default i18nPlugin
