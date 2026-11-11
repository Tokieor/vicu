// 覆盖率审计：扫描 renderer 下所有 tsx，算出字典命中率，并列出未命中的文案。
// 用法：node scripts/__i18n-audit.mjs [--missing]
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'

const traverse = _traverse.default ?? _traverse
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RENDERER = join(ROOT, 'src', 'renderer')

const WS = /\s+/g
const normalize = (s) => s.replace(WS, ' ').trim()

// 读字典 key
const dictSource = readFileSync(join(ROOT, 'src/shared/i18n/zh.ts'), 'utf8')
const keys = new Set()
for (const m of dictSource.matchAll(/^\s*("(?:[^"\\]|\\.)*"):/gm)) {
  try {
    keys.add(JSON.parse(m[1]))
  } catch {}
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      walk(p, out)
    } else if (/\.tsx$/.test(name) && !/\.(test|spec)\./.test(name)) {
      out.push(p)
    }
  }
  return out
}

const missing = new Map()
let hit = 0
let total = 0
let filesChanged = 0

const ATTRS = new Set(['placeholder', 'title', 'aria-label', 'aria-placeholder', 'aria-description', 'alt'])

for (const file of walk(RENDERER)) {
  const code = readFileSync(file, 'utf8')
  let ast
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  } catch {
    continue
  }
  let fileHits = 0
  traverse(ast, {
    JSXText(path) {
      const key = normalize(path.node.value)
      if (!key || !/[A-Za-z]/.test(key)) return
      total++
      if (keys.has(key)) {
        hit++
        fileHits++
      } else {
        missing.set(key, (missing.get(key) ?? 0) + 1)
      }
    },
    JSXAttribute(path) {
      const n = path.node.name
      if (!n || n.type !== 'JSXIdentifier' || !ATTRS.has(n.name)) return
      if (path.node.value?.type !== 'StringLiteral') return
      const raw = path.node.value.value
      const key = keys.has(raw) ? raw : normalize(raw)
      if (!/[A-Za-z]/.test(key)) return
      total++
      if (keys.has(key)) {
        hit++
        fileHits++
      } else {
        missing.set(key, (missing.get(key) ?? 0) + 1)
      }
    },
    JSXExpressionContainer(path) {
      const check = (nodePath) => {
        if (!nodePath.isStringLiteral || !nodePath.isStringLiteral()) return
        const key = normalize(nodePath.node.value)
        if (!key || !/[A-Za-z]/.test(key)) return
        total++
        if (keys.has(key)) {
          hit++
          fileHits++
        } else {
          missing.set(key, (missing.get(key) ?? 0) + 1)
        }
      }
      const e = path.get('expression')
      if (e.isStringLiteral()) check(e)
      else if (e.isLogicalExpression()) check(e.get('right'))
      else if (e.isConditionalExpression()) {
        check(e.get('consequent'))
        check(e.get('alternate'))
      }
    },
  })
  if (fileHits > 0) filesChanged++
}

const pct = total ? ((hit / total) * 100).toFixed(1) : '0'
console.log(`字典条目: ${keys.size}`)
console.log(`renderer 文案节点总数: ${total}`)
console.log(`命中: ${hit} (${pct}%)   未命中: ${total - hit}`)
console.log(`未命中去重后: ${missing.size}`)
console.log(`有插桩的文件数: ${filesChanged}`)

if (process.argv.includes('--missing')) {
  const rows = [...missing.entries()].sort((a, b) => b[1] - a[1])
  console.log('\n--- 未命中文案（按出现次数）---')
  for (const [text, count] of rows) console.log(`${String(count).padStart(3)}  ${text}`)
}
