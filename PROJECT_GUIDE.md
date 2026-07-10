# DuoPlay 项目开发指南

> **给未来的我（或任何接手这个项目的 AI）看的**：如果你是刚接手这个对话/任务，
> 请先完整读完这份文档，再动代码。这个项目的开发者明确要求过"限制好自己"，
> 意思是：不要凭记忆或直觉重新设计架构，先按这里写的规则走。

## 这是什么项目

一个双人联机休闲游戏网站，仅供开发者本人和女朋友两人使用（非商业化）。
核心诉求：**简单、稳定、好维护**，不追求功能堆砌。

## 部署形态（重要，不要搞混）

项目支持两种运行模式，代码里通过 `isSupabaseMode` 这个变量自动切换，**不需要手写 if/else 判断该用哪个**：

| 模式 | 触发条件 | 用途 | 状态存储 |
|---|---|---|---|
| 本地兜底模式 | 没有配置 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` | AI Studio 本地预览、本地开发调试 | 内存变量（重启即丢失），走 `server.ts` 里的 Express + SSE |
| Supabase 生产模式 | 配置了上述两个环境变量 | **线上正式环境（Vercel部署用这个）** | Supabase Postgres `rooms` 表 + Realtime |

**线上（Vercel）必须用 Supabase 模式**。`server.ts` 里那套 Express 常驻服务器 + `setInterval`
的写法在 Vercel 的 Serverless 环境下是跑不起来的（内存不持久、不支持长驻进程），
这套代码只用来支持 AI Studio 的本地预览，不要指望它能直接部署到 Vercel。

## 目录结构与职责

```
src/
  types.ts               # 全局共享类型（Room, Player 等）
  games/
    definitions.ts       # ★ 每个游戏的"初始状态"逻辑，纯数据/逻辑，不含 React
    registry.tsx          # ★ 每个游戏的 UI 定义（名称/图标/描述/组件），给页面用
    pictionaryWords.ts    # 你画我猜词库（唯一副本，不要在别处再复制一份）
  components/
    GomokuGame.tsx        # 具体游戏组件
    PictionaryGame.tsx
  lib/
    roomManager.ts        # 房间管理：创建/加入/同步/心跳，双模式统一封装
  pages/
    Layout.tsx             # 共享头部/底部，<Outlet/> 承载具体页面
    Lobby.tsx               # 首页大厅：身份/加入房间/游戏选择网格
    RoomScreen.tsx          # /room/:roomCode，联机对局页面
    PracticeScreen.tsx      # /practice/:gameType，单人练习页面
  App.tsx                  # 纯路由表，不写业务逻辑
server.ts                 # 本地兜底模式的 Express 服务器（仅用于本地预览）
vercel.json                # SPA 路由重写规则，删了的话线上刷新/直接访问 /room/xxx 会 404
```

## 路由结构（2026-07 新增）

这个项目现在是**真正的多页面路由**（`react-router-dom`），不再是"一个页面靠状态切换"：

| 路径 | 页面 | 说明 |
|---|---|---|
| `/` | Lobby | 大厅：设昵称、输房间号加入、选游戏 |
| `/room/:roomCode` | RoomScreen | 联机对局页。直接访问/刷新会自动调用 `roomManager.joinRoom` 重新接入；从大厅点击创建/加入房间时，会通过路由的 `state` 直接带上房间数据，不用重新请求一次 |
| `/practice/:gameType` | PracticeScreen | 单人练习页，纯本地状态，不联网 |

**这意味着**：
- 浏览器返回键、点击左上角Logo，现在都能正确回到大厅（之前这两个操作没反应的bug已修）
- 房间链接可以直接分享：把 `https://你的域名/room/DX89A1` 发给对方，对方点开链接会自动尝试加入这个房间，不需要再手动输入房间号
- 刷新页面不会再把你强制弹回大厅——如果你刷新时正在房间里，页面会重新自动加入同一个房间（前提是房间还存在、没过期）

**加游戏时不用碰这几个页面文件**（`Layout.tsx`/`Lobby.tsx`/`RoomScreen.tsx`/`PracticeScreen.tsx`），它们都是从 `registry.tsx` 动态读取的，和之前"新增游戏的标准步骤"完全一致，路由层不需要任何改动。

**部署时注意**：`vercel.json` 里的SPA重写规则是必须的，否则直接访问或刷新 `/room/xxx` 这种非首页路径，Vercel会返回404（因为物理上并没有这个文件，需要重写规则告诉Vercel"所有路径都返回index.html，由前端路由自己处理"）。

## 核心设计原则（不要破坏）

1. **一个游戏的"初始状态"只能定义在一个地方**：`src/games/definitions.ts`
   的 `GAME_DEFINITIONS`。`server.ts`、`roomManager.ts`、`App.tsx` 都调用
   `getInitialGameState(gameType)`，不允许在这三个文件里再手写一份初始状态。

   > 历史教训：之前 Gemini 写代码时，`roomManager.ts` 的 Supabase 分支里
   > 硬编码了五子棋的初始状态，导致 Supabase 模式下创建"你画我猜"房间时
   > 初始状态是错的。这个 bug 已在这次重构中修复，**不要再犯**。

2. **一个游戏的 UI（组件+大厅卡片文案）只能注册在一个地方**：
   `src/games/registry.tsx` 的 `GAME_UI_REGISTRY`。`App.tsx` 的大厅卡片和
   房间路由都是从这个数组动态生成的，不允许在 `App.tsx` 里手写某个具体
   游戏的 JSX 卡片或 if/else 路由分支。

3. **`rooms` 表结构固定，不要为新游戏建新表**。所有游戏共用一张 Supabase
   `rooms` 表，`game_state` 是 `jsonb` 字段，内部结构由游戏自己定义。
   Schema 见下方"Supabase 建表 SQL"。

## 新增一个游戏的标准步骤（2026-07 更新：独立文件夹写法）

从大富翁开始，新游戏采用**独立文件夹**的写法，而不是像五子棋/你画我猜那样把状态定义写在 `definitions.ts`、组件放在 `src/components/`——这样每个游戏的内部复杂逻辑（棋盘数据、规则计算）完全和其他游戏、和框架代码隔离，改一个游戏不会影响别的游戏。

```
src/games/你的游戏/
  board.ts (或叫 data.ts)   # 纯数据，不含 React，比如棋盘布局、卡牌列表
  logic.ts                  # 纯逻辑函数，不含 React：getInitialState + 所有规则计算
  YourGame.tsx               # React 组件，UI 渲染 + 调用 roomManager 同步状态
```

**重要规则：`logic.ts` 绝对不能 import 任何 `.tsx` 文件或 React**。原因是 `definitions.ts`
会被 `server.ts`（Node服务器）直接import，如果 `logic.ts` 里混进了React代码，
Node打包时会把整个React组件一起打包进服务器代码，虽然不一定报错，但完全没必要、还会拖慢构建。

> 历史教训：第一版大富翁开发时，我贪方便建了一个 `monopoly/index.ts` 统一导出
> `getInitialMonopolyState` 和 `MonopolyGame` 组件，结果导致 `definitions.ts`
> 通过这个"总出口"意外把React组件带进了 `server.ts` 的打包产物里。后来去掉了
> 这个统一导出文件，改成两处分别精确import自己需要的子模块。**不要再建这种
> "把逻辑和UI混在一起导出"的barrel文件**。

具体步骤：
1. 建 `src/games/你的游戏/board.ts`（如果需要静态数据）和 `logic.ts`（`getInitialState()` +
   规则函数），全程不引入React。
2. 建 `src/games/你的游戏/YourGame.tsx`，props 必须是：
   ```ts
   { room: Room; role: "host" | "guest" | "spectator"; onLeave: () => void }
   ```
   订阅/同步统一调用 `roomManager.subscribeToRoom` / `roomManager.updateGameState`
   / `roomManager.sendHeartbeat`，照抄 `monopoly/MonopolyGame.tsx` 开头那几个
   `useEffect` 即可，这部分是固定模板。
3. 在 `src/games/definitions.ts` 里 `import { getInitialXxxState } from "./你的游戏/logic.js"`
   （**直接指向 logic.ts，不要指向某个barrel文件**），加一项到 `GAME_DEFINITIONS`。
4. 在 `src/games/registry.tsx` 里 `import YourGame from "./你的游戏/YourGame.js"`，
   加一项到 `GAME_UI_REGISTRY`。
5. **不要改 `App.tsx`、`server.ts`、`src/pages/` 下任何文件**。这些都是通用逻辑，
   加游戏不应该触碰它们。
6. 改完跑一遍 `npx tsc --noEmit` 和 `npm run build` 确认没有类型错误、
   构建能过，再交付。

（老游戏五子棋/你画我猜暂时保留原来"扁平文件"的写法，没有强制迁移，因为它们
已经跑得很稳定，重新搬文件夹只有风险没有收益。如果以后想统一成一个风格，
可以单独提出来做一次低风险的搬家清理，不用现在做。）

## 已上线游戏一览

| 游戏 | game_type | 文件位置 | 复杂度 |
|---|---|---|---|
| 五子棋 | `gomoku` | `src/components/GomokuGame.tsx` + `definitions.ts`内联 | 低 |
| 你画我猜 | `pictionary` | `src/components/PictionaryGame.tsx` + `definitions.ts`内联 | 中 |
| 简化版大富翁 | `monopoly` | `src/games/monopoly/` | 中高 |
| 飞行棋（双色版） | `flightchess` | `src/games/flightchess/` | 中 |

**大富翁的已知简化/待办事项**（不是bug，是刻意的MVP取舍，后续可以按需加）：
- 机会格目前是空操作占位符，落地后只显示提示文字，没有真正的抽卡效果——卡牌
  内容和效果逻辑是有意留到下一步再做的（`logic.ts` 里 `tile.type === "chance"`
  那个分支有标注 `Step 2 TODO`）
- 没有"卖地/抵押"机制来避免破产——现金变负数会直接判负，没有"卖地抵债"这个
  缓冲步骤，这是为了控制第一版规则复杂度的简化
- 没有"连续掷出双数额外回合"这类进阶规则
- 棋盘UI是简单的网格铺开展示，不是经典的环形棋盘视觉效果（v1先保证能玩，
  视觉效果可以后续单独迭代）

**飞行棋的已知简化/待办事项**：
- 不是经典实体飞行棋的十字棋盘，是简化过的"共享环形跑道24格 + 各自专属到家小路6格"
  模型，规则等价但视觉呈现不同
- 没有"连续掷出6可以再掷一次"这类进阶规则（v1先图简单、避免死循环风险，
  后续如果想要更接近经典体验可以加）
- 只支持双色（2人各1色/4棋子），四色版本（每人控制2色）是下一步计划

## Supabase 建表 SQL（首次上线用，或者切换到新 Supabase 项目时用）

```sql
CREATE TABLE IF NOT EXISTS public.rooms (
    room_code TEXT PRIMARY KEY,
    game_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    players JSONB NOT NULL DEFAULT '{}'::jsonb,
    game_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read rooms" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert rooms" ON public.rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update rooms" ON public.rooms FOR UPDATE USING (true);

alter publication supabase_realtime add table public.rooms;
```

然后在 Vercel 项目环境变量里加：
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

## 已知的遗留问题（还没修，按需处理）

- **你画我猜的 AI 识别功能**（`/api/pictionary/ai-guess`）是 Express 路由，
  依赖 `server.ts` 常驻进程，**在 Vercel 上不会工作**。如果这个功能要留着，
  需要把它改写成 Vercel Serverless Function（`api/` 目录下的独立文件），
  目前这次重构没有处理这一块，因为开发者两人对战场景下不一定需要它。
- `server.ts` 里调用的模型名是 `gemini-3.5-flash`，这个版本号看起来有点
  奇怪（不确定是否是真实存在的模型名），如果以后要修复AI猜词功能，
  记得先核实当前可用的 Gemini 模型名称。

## 每次交付前的自检清单

- [ ] `npx tsc --noEmit` 无报错
- [ ] `npm run build` 能正常构建（vite build + server esbuild 都过）
- [ ] `vercel.json` 还在，没有被误删（否则线上直接访问 `/room/xxx` 会404）
- [ ] 新游戏的初始状态只写在 `definitions.ts` 一处
- [ ] 新游戏的 UI 只注册在 `registry.tsx` 一处
- [ ] 没有在 `App.tsx` / `server.ts` / `src/pages/` 里为具体某个游戏写 if/else 特判
- [ ] 新游戏文件夹里的 `logic.ts`/`board.ts` 没有 import React 或任何 `.tsx` 文件
- [ ] 单人练习模式（`room.room_code === "SINGLE"`）的每一处状态更新，都在调用
      `roomManager.updateGameState` **之前**先判断房间号，SINGLE的话直接更新本地
      state、不发网络请求（这个坑已经在大富翁和飞行棋刚上线时踩过一次：单人模式的
      房间根本没有写进Supabase的`rooms`表，调用更新接口会报错
      `Cannot coerce the result to a single JSON object`，因为Supabase找不到这一行）
