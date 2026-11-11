#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""从 Vicu汉化对照表.xlsx 生成 src/shared/i18n/zh.ts。

规则：
  - 只取「处理」列为「将翻译」的条目
  - 原文中的 ${expr} 归一化为 {0} {1} ...（供 t(key, ...args) 插值）
  - 译文中的 ${expr} 同样按位置归一化
  - 跳过疑似被截断的模板原文（导出时被裁掉的）
  - 去重：同一 key 保留首次出现

用法：python scripts/gen-i18n-zh.py [xlsx 路径]
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_XLSX = Path(r"C:\Users\Tokieor\WorkBuddy\2026-11-04-01-22-13\vicu_analysis\Vicu汉化对照表.xlsx")
OUT = ROOT / "src" / "shared" / "i18n" / "zh.ts"
# 对照表没覆盖到的界面文案，人工补译后放在这里，优先级高于对照表
EXTRA = ROOT / "scripts" / "i18n-extra.json"

PLACEHOLDER = re.compile(r"\$\{[^}]*\}")
WS = re.compile(r"\s+")


def normalize(text: str, counters: dict) -> str:
    """把 ${...} 换成 {n}，并压缩空白。counters 保证同一句内序号递增。"""
    seq = counters.setdefault("i", 0)

    def repl(_m):
        nonlocal seq
        # 同一句子内从 0 开始编号
        n = seq
        seq += 1
        return "{%d}" % n

    counters["i"] = 0
    out = PLACEHOLDER.sub(repl, text)
    return WS.sub(" ", out).strip()


def looks_truncated(raw: str) -> bool:
    """导出的模板字符串常被截断：引号/括号不配对，或长度异常。"""
    if len(raw) > 140:
        return True
    if raw.count('"') % 2 == 1 or raw.count("'") % 2 == 1:
        return True
    if raw.count("(") != raw.count(")") or raw.count("[") != raw.count("]"):
        return True
    return False


def main() -> int:
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx.exists():
        print("找不到对照表: %s" % xlsx, file=sys.stderr)
        return 1

    wb = openpyxl.load_workbook(xlsx, read_only=True)
    entries: dict[str, str] = {}
    skipped = 0

    for ws in wb.worksheets:
        for row in ws.iter_rows(min_row=2, values_only=True):
            if not row or not row[0]:
                continue
            raw = str(row[0])
            zh_raw = str(row[1]) if row[1] else ""
            handling = str(row[5]) if len(row) > 5 and row[5] else ""
            if handling and handling != "将翻译":
                continue
            if not zh_raw.strip():
                continue
            if "${" in raw and looks_truncated(raw):
                skipped += 1
                continue

            key = normalize(raw, {})
            val = normalize(zh_raw, {})
            if not key or not val or key == val:
                continue
            # 纯符号/纯数字/单个字母的条目没有翻译价值
            if len(key) < 2 or not re.search(r"[A-Za-z]", key):
                continue
            entries.setdefault(key, val)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    # 补译条目覆盖对照表（同一句以补译稿为准，便于统一术语）
    extra_count = 0
    if EXTRA.exists():
        extra = json.loads(EXTRA.read_text(encoding="utf-8"))
        for key, value in extra.items():
            key = key.strip()
            if not key or not value:
                continue
            entries[key] = value.strip()
            extra_count += 1

    lines = [
        "// 本文件由 scripts/gen-i18n-zh.py 从 Vicu汉化对照表.xlsx 自动生成，请勿手改。",
        "// key 为英文原文（${expr} 已归一化为 {0}{1}），value 为中文译文。",
        "",
        "export const ZH: Record<string, string> = {",
    ]
    for key in sorted(entries):
        lines.append("  %s: %s," % (json.dumps(key, ensure_ascii=False), json.dumps(entries[key], ensure_ascii=False)))
    lines.append("}")
    lines.append("")
    OUT.write_text("\n".join(lines), encoding="utf-8")

    print("写入 %s" % OUT)
    print("条目数: %d（其中补译 %d），跳过截断模板: %d" % (len(entries), extra_count, skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
