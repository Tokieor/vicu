# 日历视图（月 / 周 / 日 / 日程）设计方案

状态：**提案，待确认**　｜　版本：v1　｜　日期：2026-11-12　｜　本文只做设计，不含实现

目标：在侧边栏新增「日历」入口，内含**月视图、周视图、日视图、日程视图**四种投影；设置中提供开关控制启用与隐藏；
四种视图是同一份任务数据的不同呈现，不引入新的数据模型、不改同步协议。

非目标（本方案明确不做）：

- 第三方日历事件（M365 / Google / Mac EventKit）——上游 `pro` 分支才有 Events 模型。
- 农历、节气、节假日。
- 多时区并排、团队共享日历。
- 跨天任务的「连续色条」视觉（v1 用重复 chip 表达，见 3.1）。

---

## 1. 现有资产（决定难度的地方）

| 能力 | 位置 | 复用方式 |
|---|---|---|
| 时间块模型：`blockOf` / `placeBlock` / `moveBlockToDay` / `resizeBlock` | `src/shared/time-blocks.ts` | 直接复用，日历不自己算时间 |
| 时间轴引擎：拖拽改时间、拉伸改时长、跨天拖、全天行、当前时间线 | `src/renderer/components/planner/Timeline.tsx`（709 行） | 周视图 = 解耦成受控组件后直接使用 |
| 手势：`use-timeline-gesture` / `use-timeline-drop` | `src/renderer/components/planner/` | 周视图沿用；月视图只复用「拖到某天」的 drop 语义 |
| 时区与日期算法（含 Auckland、New York DST 测试） | `src/shared/plan-day.ts`、`src/renderer/lib/due-dates.ts` | 月网格与分组必须走同一套函数 |
| 视图范围计算 `viewDays(view, anchor, startOfWeek)` | `src/shared/time-blocks.ts` | 抽 `calendarRange` 时对齐语义，周一为周首 |
| 按日期分组的任务列表 | `src/renderer/views/UpcomingView.tsx`（135 行） | 日程视图在其基础上加时间轴与卡片 |
| 侧边栏显隐机制 | `config-types.ts:425` `SIDEBAR_HIDEABLE_LISTS` + `components/settings/SidebarSettings.tsx` | 新增一个 `'calendar'` 键即可 |
| 视图开关 + 重定向守卫 | `PlanView.tsx:77` `if (!isPlannerEnabled(config)) return <Navigate to="/today" />` | 日历照抄这个模式 |
| 任务字段 `due_date / start_date / end_date / priority / project_id` | `src/renderer/lib/vikunja-types.ts:26` | 无需后端改动 |
| 离线队列与乐观更新 | `useUpdateTask` → `use-task-mutations.ts` | 日历所有写操作走同一入口，零改动 |

不存在的能力：月网格、日历项索引、日程时间轴 —— 需要新建（第 5 节）。

---

## 2. 术语与数据模型

### 2.1 日历项（CalendarItem）

任务在日历上的一个投影，**纯派生、不落库**：

```ts
type CalendarItem =
  | { kind: 'timed';  task: Task; day: LocalDate; startMin: number; endMin: number }        // 有时间块
  | { kind: 'dated';  task: Task; day: LocalDate }                                          // 只有日期
```

一个任务在**某一天**最多产生一个 item；跨天任务在它覆盖的每一天各产生一个 item（每个都是独立投影）。

### 2.2 日期归属优先级

| 任务状态 | 归属日期 | 说明 |
|---|---|---|
| 有时间块（`blockOf(task)` 非空） | 块的 `day` | 时间块优先于到期日（与 `docs/planner.md` 一致） |
| 有 `start_date` 且无时间块 | `start_date` 起至 `end_date`（无 `end_date` 则仅起始日） | 跨天任务逐日展开 |
| 仅 `due_date` | `due_date` | 最常见 |
| 三者皆空 | 不进日历 | 属于 Anytime / Inbox，日历不虚拟它们 |

实现上是 `calendarItemsFor(task)` 一个纯函数，返回 0..n 个 item，**必须复用** `due-dates.ts` 的 `localDateOf`，
不得用 `new Date(str).getDate()` 这类写法（UTC 偏移会错一天）。

### 2.3 为什么不分「全天事件」lane

滴答的周视图分「全天行 + 时间轴」两段。Vicu 的对应概念是「有块的」与「只有日期的」，
但周视图现有实现已把无时间的任务放在**每天的时间轴上方一行**（`docs/planner.md`「Day, 3 days, Week」）。
周视图沿用这个已有行为，不新增 lane 概念，避免与 Plan 屏幕产生两套语义。

---

## 3. 三个视图的规格

### 3.1 月视图（Month）

**布局**

- 固定 **6 行 × 7 列**（避免切换月份时行数变化导致页面跳动），周一起始。
- 列头：周一…周日；非本月日期（上/下月补位）以 `--text-tertiary` 弱化。
- 格内：日期数字 + 最多 **N 条** chip + 「+N 更多」。
  - N 由格高与行距算出（`floor((cellH - dateRowH) / chipH)`），默认桌面 3 条；窄窗口 2 条。
- 今天：日期数字加 accent 实心圆底（与侧边栏 Today 同色 `#E8A400`）。
- chip 内容：`[HH:mm] 标题`，前缀仅定时项有；左侧 3px 项目色条（`project.hex_color`）；优先级用图标而非颜色（低对比度主题下更稳）。

**跨天任务的视觉（v1）**

不做连续色条。跨天的每一天各显示一个 chip，chip 标题前加 `↳` 表示「延续中的任务」，首日显示 `→`。
理由：连续条需要在 grid 之上再叠一层绝对定位层，并且要处理换行、跨周断行、滚动裁切，
成本约为月视图整体的 1/3，而信息增量很小。v2 再评估。

**交互**

| 操作 | 结果 |
|---|---|
| 点击日期数字 / 格内空白 | 打开该天的日视图（决策 D1，见 11） |
| 点击 chip | 打开任务详情面板（复用现有 TaskDetail，右侧滑出） |
| chip 的 checkbox | 就地完成任务（走 `useUpdateTask` + completion-hold 的 toast/撤销） |
| 拖 chip 到另一格 | 改该任务的日期归属：有块 → `moveBlockToDay`；无块 → 改 `due_date`（保留时刻）。带 Undo toast |
| 双击空白格 | 新建任务，`due_date` = 该日（复用 quick-add 的新建入口，不重写表单） |
| `+N 更多` | 切到日程视图并滚动到该天（比弹浮层更省一次点击） |
| 翻页 / 今天 | 见第 4 节 |

**性能**

- 建 `Map<LocalDate, CalendarItem[]>` 索引，`useMemo` 依赖 `[tasks, projects]`，42 格只读自己的切片。
- `MonthDayCell` 用 `memo`，props 只有 `{ day, items, isToday, isOtherMonth }`。
- 格内**不挂** `TaskList` / `TaskHoverCard` / `ResizeObserver` —— 42 × 重型组件会直接卡住首帧。
- 拖拽用单一全局 drop 层 + 事件委托，不给 42 格各注册一套 listener。
- 基线：3000 个任务、其中 800 个在本月 → 首次渲染 < 120 ms，翻月 < 60 ms。

**复杂度**：中高，5–8 人日（含时区与跨月边界测试）。

### 3.2 周视图（Week）

**定位**：把 Plan 屏幕已有的 `planner_view='week'` 拿出来，换一个入口与一套更「浏览向」的外观。

**与 Plan 周模式的差异（必须只有这四点）**

| 项 | Plan 周 | 日历周 |
|---|---|---|
| 左侧来源列表 | 有（Today / Inbox / Next 7 days / Project） | 无，改用顶部 SourceChips 横排 |
| 顶部结构 | 视图切换 + 翻页 + 齿轮（Fit today 等） | 视图切换 + 翻页 + 筛选，**无齿轮** |
| 表头日期 | 点击选中该天 | 点击跳日视图 |
| 周末列 | 与平日一致 | 背景弱化一档 |

时间轴本身（拖拽、拉伸、15 分钟步进、跨天拖、当前时间线、routines 小 pill）**完全相同**，不做分叉。

**实现时补的两条（规范未覆盖，已落地）**

1. **项目色**：Vikunja 的 `hex_color` 不带 `#`（如 `1973ff`），直接丢给 CSS 会被忽略 —— 月视图与日程视图的色条此前一直没生效。三视图统一过 `normalizeHex` 转成 `#RRGGBB`，色块用「左色条 + 12% 淡色底」，与 Plan 的 block 一致；周视图的到期标记圆点也用项目色。
2. **无时间任务行**：Plan 的 `dayTopRow` 只认「纯日期的截止日」，于是「开始时间带时钟、没有结束时间、也没有截止日」的任务既不是 block 也不是 marker，在周视图里彻底消失（月视图却看得到）。日历因此不走 Plan 的规则，改用 `calendarTopRow`：按 `taskDays` 取天、排除 block、排除由网格画成 marker 的带时钟截止日。为此 `Timeline` 增加可选 `topRowOf(day)`，Plan 不传即保持原样。

**改造方式**：`Timeline.tsx` 增加一个受控外壳 `WeekTimeline`，props 为
`{ days, items, onDropTask, onResizeBlock, onOpenTask, variant: 'plan' | 'calendar' }`，
把 `variant` 里只有「周末弱化 / 表头点击行为」两处条件渲染。若解耦中发现 Timeline 与 Plan 的状态耦合过深，
退路是复制一份 `WeekTimeline`（约 700 行）后再逐步消重 —— 但这会让后续上游合并变贵，只在解耦失败时使用。

**复杂度**：低，1–3 人日（取决于解耦是否顺利）。

### 3.2a 日视图（Day，v2 追加）

只显示 anchor 那一天：左侧 24 小时刻度、单列时间轴，有时间的任务按项目色铺满整列宽
（淡底 + 左色条），高度就是时长（`13:00–18:00` 占 5 小时）。顶部一行放没有时间的任务，
跨天任务在这一天也作为一条 chip 出现。实现是 `DayTimeline.tsx` 把 `Timeline` 的 `days`
设成 `[day]`，所以拖拽改时间、拉伸改时长、点色块打开任务都与 Plan 一致；与周视图的区别是
不压暗周末、也不画跨列色带（`bands` 只在多列时有意义）。

`CalendarViewKind` / `calendar_view` / URL `?view=day` 新增 `day`；左右箭头按天翻页，
快捷键 `D`；月格点击、周视图列头点击、日程里的日期标题都切到这一天的日视图。

### 3.3 日程视图（Agenda）

**布局**

- 纵向连续滚动，按天分组的卡片流。
- 每组左侧：日期块（`11` + `周三` + 农历位留空）；右侧：时间轴上圆点 + 卡片。
- 卡片：`15:00 – 15:30` + 标题 + 项目色条；无时间的任务在组内以「无时间」分区列在时间项之后。
- 顶部吸顶条：当前月份（`2026 年 11 月`）+「今天」按钮。
- 无任务的天：折叠为一行 `11 月 14 日 周五 · 无安排`（点击展开，可在此加任务）。

**跨天任务（Vikunja 的开始/结束日期）**

任务若有 `start_date` + `end_date`，Vicu 把它们画成一段；编辑入口是日期面板（Schedule / When）里的「时间段」一行：开始与结束两个字段，**结束就是截止日期**（同一个值），两端都能设日期与时刻。同一天两端都写了时刻时就是 Vikunja 的 time block（`13:00–18:00`），面板会把它读出来继续编辑；跨天时按天展开。月历连点两下画出一段，也可以直接写「11月10日到11月15日」或「下午一点到六点」。Plan 时间轴拖拽仍然只写「同日 ≤12 小时」的块。

- 周视图：画成一条**横跨各列的色带**（`calendarBands`），带项目色左沿与 12% 淡底，两端按是否被裁切决定圆角；重叠的色带按 lane 分行走，长条优先占上排。这些任务不再在每天的 chip 行里重复出现。
- 日程视图：卡片右侧补一段区间文字 `11/10 – 11/13`（`spanLabel`），两端带时钟时写成 `11/10 9:00 – 11/13 18:00`。
- 月视图：保持按天展开 + `↳` / `→`，格子宽度放不下区间文字。
- 另有 `atMin`：只带时钟的截止/开始日期（没有时间块）现在也会在月格与日程里显示钟点，此前只有周视图的标记点画出了时间。

**范围与加载**

- 默认从**今天**起 7 天；`calendar_agenda_days` 可选 7 / 14 / 30。
- 向下滚动到末尾前 3 天时自动续加载 14 天（最多到 `+365 天`）。
- 向上最多回滚 30 天，再远用「跳转到日期」。
- 数据来自已在缓存里的 `useTasks()`，**不做分段请求**（Vicu 的 tasks query 是全量的，分段反而多一次往返）。

**交互**：勾选完成、点击开详情、空档行内「+ 添加任务」、`Alt+↑/↓` 在相邻卡片间移动焦点。

**复杂度**：低到中，2–3 人日。

---

## 4. 容器与切换状态机

### 4.1 状态

单一 `CalendarRoute`，状态全部可由 URL + 配置重建，无额外 store：

```ts
type CalendarViewKind = 'month' | 'week' | 'agenda'

interface CalendarState {
  view: CalendarViewKind     // 来自 ?view=，缺省取 config.calendar_view
  anchor: LocalDate          // 三视图共用的锚点日，来自 ?d=YYYY-MM-DD，缺省 today
}
```

派生（纯函数，可单测）：

```ts
calendarRange(view, anchor) =>
  month  → { start: startOfMonthGrid(anchor), end: startOfMonthGrid(anchor) + 41d }   // 42 格
  week   → { start: startOfWeek(anchor),      end: startOfWeek(anchor) + 6d }
  agenda → { start: max(today - 30d, anchor), end: anchor + agendaDays - 1 }
```

### 4.2 转换表

| 事件 | view=month | view=week | view=agenda |
|---|---|---|---|
| `SET_VIEW(v)` | anchor 不变；同时写 URL `?view=v&d=anchor`，并写 `config.calendar_view`（仅作为下次无 `?view` 时的默认） | 同左 | 同左 |
| `PREV` / `NEXT` | `addMonths(anchor, ∓1)`，保留日号（31 号落 2 月则钳到月末） | `addDays(anchor, ∓7)` | 滚动一屏；键盘 `PageUp/Down` 为 ∓ agendaDays |
| `TODAY` | anchor=today，滚到今天的格子 | anchor=today | anchor=today，滚到今天的组 |
| `OPEN_DAY(d)` | 见 D1 | anchor=d，切 agenda 到该日 | 滚到该天的组并高亮 |
| `PICK_MONTH(m)` | anchor=该月 1 号 | — | — |

```
                  ┌────────── SET_VIEW ──────────┐
                  ▼                              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │  Month   │◀─┤   Week   │─▶│  Agenda  │
   └────┬─────┘  └────┬─────┘  └────┬─────┘
        │ OPEN_DAY    │ OPEN_DAY    │ OPEN_DAY
        └─────────────┴─────────────┘
                      ▼
        planner_enabled ? /plan?view=day&d=… : Agenda(anchor=d)
```

**关键约束**：四视图之间切换**保持 anchor**。用户从 11 月翻到 3 月再切周视图，应看到 3 月那一周，而不是回到本周。

### 4.3 守卫

- `calendar_enabled !== true` → `/calendar` 重定向 `/today`（同 `PlanView` 的写法）。
- `standalone_mode`（无服务端）→ 日历入口不出现：没有 `due_date` 的可靠来源，日历无意义。
  `isCalendarEnabled(config)` 里一并判掉，与 `isPlannerEnabled` 同构。
- 侧边栏显隐与总开关是两层：`calendar_enabled` 决定功能是否存在，`sidebar_hidden_lists` 决定入口是否可见。
  两者都关时 `/calendar` 仍可访问（避免用户从命令面板进入时 404），但不占侧边栏。

---

## 5. 组件拆分

```
src/renderer/
├── views/
│   └── CalendarView.tsx                    (~180) 路由入口、守卫、?view/?d 解析、视图分发
├── components/calendar/
│   ├── CalendarHeader.tsx                  (~120) 标题、翻页、今天、视图切换段控、筛选
│   ├── MonthGrid.tsx                       (~150) 6×7 布局、列头、拖放层
│   ├── MonthDayCell.tsx                    (~110) 单格：日期、chip 列表、+N
│   ├── WeekTimeline.tsx                    (~200) Timeline 的日历外壳（受控）
│   ├── DayTimeline.tsx                      (~60)  单列 Timeline 的日历外壳
│   ├── AgendaList.tsx                      (~170) 分组渲染、吸顶、无限续加载
│   ├── AgendaDayGroup.tsx                  (~120) 单日：日期块、圆点、卡片
│   ├── CalendarTaskChip.tsx                (~90)  月/日程共用的小卡片
│   └── CalendarEmptyDay.tsx                (~50)  「无安排」折叠行
├── components/settings/
│   └── CalendarSettings.tsx                (~110) 设置分组（开关 / 默认视图 / 日程天数 / 显示已完成）
├── hooks/
│   └── use-calendar-config.ts              (~40)  读写 calendar_* 配置
└── lib/
    ├── calendar-range.ts                   (~90)  calendarRange / prev / next / pickMonth
    ├── calendar-items.ts                   (~130) 任务 → CalendarItem[]，索引构建
    ├── calendar-dnd.ts                     (~80)  月视图拖放（改日期/改块）
    └── smart-list-identity.ts              (改)   加 'calendar' 的图标与颜色

src/shared/
└── config-types.ts                         (改)   calendar_* 字段 + isCalendarEnabled + SIDEBAR_HIDEABLE_LISTS
```

依赖方向：`views → components/calendar → lib/calendar-*`，
`lib/calendar-*` 只依赖 `shared/time-blocks` 与 `lib/due-dates`，**不 import 任何组件**（保证可单测）。

路由注册（`router.tsx`）：

```ts
const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/calendar',
  component: lazyRouteComponent(() => import('@/views/CalendarView'), 'CalendarView'),
  validateSearch: (s: Record<string, unknown>) => ({
    view: s.view === 'week' || s.view === 'agenda' || s.view === 'month' ? s.view : undefined,
    d: typeof s.d === 'string' ? s.d : undefined,
  }),
})
```

侧边栏：`ALL_SMART_LISTS` 加 `{ id: 'calendar', label: 'Calendar', path: '/calendar' }`，
顺序放在 `plan` 之后、`upcoming` 之前。

图标与颜色要避开已占用的组合（`plan` 已用 `CalendarRange` `#2F6FED`，`upcoming` 已用 `CalendarDays` `#E5484D`）：

```ts
// src/renderer/lib/smart-list-identity.ts
calendar: { color: '#C2410C', iconName: 'Calendar', icon: Calendar },
```

同时必须改 `test-fixtures/design-tokens-v1.json` 的 `identity.lists.calendar`
（`{ "color": "#C2410C", "desktopIcon": "Calendar", "androidIcon": "Outlined.CalendarToday" }`），
否则 `src/renderer/lib/__tests__/smart-list-identity.test.ts` 会红 —— 该测试逐项比对代码表与 token 文件。

---

## 6. 配置项

```ts
// src/shared/config-types.ts
interface AppConfig {
  /** 日历视图总开关；缺省关闭（老配置无此字段 = 关）。 */
  calendar_enabled?: boolean
  /** 上次用的视图，三视图共用。 */
  calendar_view?: 'month' | 'week' | 'agenda'
  /** 月视图是否显示已完成任务，默认关。 */
  calendar_show_completed?: boolean
  /** 日程视图的默认跨度（天）。 */
  calendar_agenda_days?: 7 | 14 | 30
  /** 月/周视图是否显示 routines 小 pill，默认显示（继承当前 routines_enabled）。 */
  calendar_show_routines?: boolean
}
```

```ts
const CALENDAR_VIEWS = ['month', 'week', 'agenda'] as const

/** 缺省关闭；standalone 模式没有可靠日期来源，一并关掉。 */
export function isCalendarEnabled(
  config: Pick<AppConfig, 'calendar_enabled' | 'standalone_mode'> | null | undefined,
): boolean {
  return config?.calendar_enabled === true && config.standalone_mode !== true
}

export function readCalendarView(config: Pick<AppConfig, 'calendar_view'> | null | undefined): CalendarViewKind {
  const v = config?.calendar_view
  return v === 'week' || v === 'agenda' ? v : 'month'
}
```

- 全部字段**per device、本地**，不进 `cross-app-semantics` 的同步协议（与 `planner_view` 同待遇）。
- 未知值一律回落默认（老版本读到新字段不会崩）。
- 不新增 `config_version` 迁移逻辑：可选字段 + 缺省语义足够。

**设置页位置**：`设置 → 通用`，紧跟 `PlannerSettings` 之后新增 `CalendarSettings`：

```
日历
  [✓] 启用日历视图                    （总开关）
  默认视图      ○ 月  ● 周  ○ 日  ○ 日程
  日程跨度      7 天 / 14 天 / 30 天
  [ ] 月视图显示已完成任务
  [✓] 显示例行事务
  ─────────────────────────────
  侧边栏里的「日历」入口可在「侧边栏」分组中隐藏。
```

---

## 7. 与现有功能的关系与边界

| 现有功能 | 关系 | 处理 |
|---|---|---|
| **Plan 屏幕** | 重叠最严重（都有「周」） | **分工**：日历 = 浏览 + 轻量改期（拖日期、勾完成）；Plan = 排期工作台（时间块拖拽、Fit today、Plan my day）。日历不复刻 Plan my day / Fit today / 齿轮 |
| Today 的日视图 | 无冲突 | 「点击某天」直接跳 Plan 的 day 模式 |
| Upcoming | 日程视图与它相似 | 日程视图 = Upcoming 的「时间轴化」变体，共用分组函数；Upcoming 保持纯列表不动（它是「未来有什么」的快速扫描，定位不同） |
| Routines | 周/日程要显示 | 只读小 pill，不可拖；`calendar_show_routines` 控制 |
| 侧边栏显隐 | 直接扩展 | `SIDEBAR_HIDEABLE_LISTS` 加 `'calendar'` |
| 命令面板 | 需要新命令 | 加「日历：月/周/日程」三条 + `G then C` 跳转 |
| 快捷键 | 新增 | `M` / `W` / `D` / `A` 切视图，`←` `→` 翻页，`T` 回今天（仅在日历页生效，不与全局冲突） |
| 离线队列 / 同步 | 全部写操作走 `useUpdateTask` | **零改动**；离线时拖拽改期照常入队 |
| 打印 / quick-view | 不受影响 | 不接入 |
| i18n | 新增约 50 条文案 | `i18n-extra.json` → `gen-i18n-zh.py` 重新生成 |
| 上游合并 | `pro` 分支已有 Calendar/Events（约 1.5 万行差异） | 本方案的 `calendar-*` 命名与上游 Calendar 冲突，合并时需要改名或采纳上游实现；这是主要长期风险，见第 10 节 |

---

## 8. i18n 文案（新增约 50 条，节选）

| Key | 中文 |
|---|---|
| `Calendar` | 日历 |
| `Month` / `Week` / `Agenda` | 月 / 周 / 日程 |
| `Today` | 今天 |
| `Previous month` / `Next month` | 上个月 / 下个月 |
| `{0} more` | 还有 {0} 项 |
| `No plans` | 无安排 |
| `Nothing scheduled` | 暂无安排 |
| `Show completed tasks` | 显示已完成任务 |
| `Enable calendar views` | 启用日历视图 |
| `Default view` | 默认视图 |
| `Agenda span` | 日程跨度 |
| `Show routines` | 显示例行事务 |
| `Add a task on this day` | 在这天添加任务 |
| `Move to {0}` | 移到 {0} |
| `Calendar views are off` | 日历视图未启用 |
| `Turn on calendar views in Settings` | 在设置中启用日历视图 |

规则照旧：模块级常量里的文案要在**渲染期** `t()`（参考 `SmartListNav` 的注释），
`.ts` 文件里的文案编译期插桩覆盖不到，必须手动包 `t()`。

---

## 9. 测试计划

**单元（纯函数，主要成本在这里）**

| 套件 | 用例 |
|---|---|
| `calendar-range.test.ts` | 月末翻页（1/31 → 2/28）、跨年（12 → 1）、周首对齐、agenda 边界、`OPEN_DAY` 的锚点保持 |
| `calendar-range-auckland.test.ts` / `-new-york.test.ts` | Auckland（+13/+12）、New York（-4/-5）在 DST 切换周生成的 42 格不重不漏；照 `src/shared/__tests__/cross-app-semantics-auckland.test.ts` 的写法各跑一套 |
| `calendar-items.test.ts` | 时间块优先于 due、跨天逐日展开、无日期任务不出现、重复任务（recurring）只投影当前实例、已完成任务过滤 |
| `calendar-grid.test.ts` | 42 格固定、非本月补位、今天标记唯一 |

**组件**（项目用 vitest + 现有组件测试写法）

- 月格溢出：4 条时显示 3 条 + 「+1」。
- 切换视图后 anchor 不变。
- 未启用时 `/calendar` 重定向。

**手工验收清单**

1. 三个视图互相切换 10 次，锚点始终一致。
2. 拖一个 chip 到相邻格 → 日期正确，Undo 能还原。
3. 跨天任务在两天都出现且带 `↳`。
4. 25:00 之后的块（跨午夜）在次日正确显示。
5. 时区改成 Pacific/Auckland 后月网格日期不偏移。
6. 800 个任务下翻月无白屏。
7. 断网后拖拽改期 → 恢复网络后同步成功。
8. 中文/英文切换后无残留英文。
9. 关闭总开关 → 侧边栏入口消失、`/calendar` 回 /today。
10. 键盘 Tab 能遍历格内 chip，焦点环可见。

**性能基线**

- 3000 任务 / 本月 800 项：月视图首帧 < 120 ms，翻月 < 60 ms，拖拽期间 FPS ≥ 50。
- 日程视图 30 天 / 900 项：滚动无明显掉帧（建议对天数分组做 `content-visibility: auto`）。

---

## 10. 实施计划

| 里程碑 | 内容 | 人日 | 依赖 |
|---|---|---|---|
| **M1 骨架 + 周视图** | 路由、守卫、配置项、侧边栏入口、设置分组、`CalendarHeader`、`WeekTimeline` 解耦、命令面板与快捷键 | 3–4 | 无（最短路径验证可行性） |
| **M2 日程视图** | `AgendaList` / `AgendaDayGroup` / 空日折叠 / 续加载 / 完成勾选 | 3 | M1 的容器与配置 |
| **M3 月视图** | `calendar-range` / `calendar-items` / `MonthGrid` / `MonthDayCell` / 溢出 / 拖放改期 | 6–8 | M1 容器；时区测试先行 |
| **M4 打磨与交付** | i18n 补译、a11y、性能调优、三视图一致性回归、文档 | 2–3 | M1–M3 |
| **合计** | | **14–18 人日** | |

（初版评估为 10–16；细分后 M3 的时区与拖放测试比预估更贵，取 14–18 更稳。）

**建议顺序**：先 M1 + M2（一周内可见成果，验证入口与配置设计是否合适），再决定 M3 是否投入——
月视图是唯一真正有设计难度的部分，若试用后觉得「日程视图已经够用」，M3 可以不做。

---

## 11. 待确认的三项决策

| # | 问题 | 建议 | 备选 |
|---|---|---|---|
| **D1** | 月视图点某天，跳到哪？ | v2 起**跳到日历自己的日视图**（`?view=day&d=…`）：单列时间轴、24 小时刻度、项目色块；周视图列头与日程日期标题同理 | 早期降级为日程视图定位到该天 |
| **D2** | 日历与 Plan 的边界 | **日历=浏览+轻量改期，Plan=排期工作台**（第 7 节） | 日历吞掉 Plan 的周模式，Plan 只留 day/3days（会让 Plan 变残缺，不建议） |
| **D3** | 周起始日 | **保持周一**（`cross-app-semantics-v1.md` 写死，手机端同契约） | 提供「周日起始」开关 → 需同时改契约与手机端，本方案不做 |

另外两项默认已定（如需改请说明）：

- 跨天任务 v1 不做连续色条，用 `→` / `↳` 前缀表达。
- 日历入口只有一个（不做三个独立侧边栏项），三视图在页内切换。

---

## 12. 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 上游 `pro` 分支已有 Calendar / Events 实现 | 未来合并时命名与结构冲突，可能推翻本方案 | 本方案尽量薄（不加新数据模型），并集中放在 `components/calendar/` 与 `lib/calendar-*`，便于整体替换 |
| 月视图性能（42 格 × 任务） | 大库翻月卡顿 | 索引 + memo + 禁用重型子组件，M3 第一天先做 3000 任务基线压测 |
| 时区 / DST | 日期错一天 | 复用 `plan-day` 与 `due-dates`，照 `cross-app-semantics-auckland.test.ts` 的写法补两套 |
| Timeline 解耦失败 | 周视图变复制粘贴，维护成本上升 | 先做 M1 的解耦 spike（半天），失败则退回复制+标注待消重 |
| 与 Plan 心智重叠 | 用户困惑「两个地方都能排时间」 | 日历页头部放一句说明 + Plan 侧保留完整能力；D2 明确分工 |
| 信息密度（月视图） | 小窗口下 chip 只剩 1 条 | 窄于 960px 时自动降为「日期 + 色点 + 计数」的紧凑模式 |

---

## 附录：与 `docs/planner.md` 的术语对照

| 本方案 | planner.md | 含义 |
|---|---|---|
| 定时项 timed | block | 任务的时间块（`start_date`+`end_date` 带了时刻） |
| 有日期项 dated | due date only | 只有日期、无时刻 |
| 无时间行 | the row above the timeline | 周视图内每天上方的无时刻任务 |
| 日程视图 | — | 按天分组的纵向卡片流（新增） |
