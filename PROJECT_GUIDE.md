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
- 机会格已接入真实抽卡效果（见 `chanceCards.ts` + `logic.ts` 的 `applyChanceCard`），
  卡牌只做"改变现金"和"传送到指定格子（可选领取过起点奖金）"两种效果，且**不会
  递归结算传送到的目标格**（比如传送到对方地产不会触发付租金）——这是有意的简化，
  避免"机会卡传送到另一张机会卡"这类连锁/死循环。以后要加更多卡牌，直接往
  `CHANCE_CARDS` 数组里加对象即可，不用碰 `logic.ts`。
- 没有"卖地/抵押"机制来避免破产——**已补上**：现金变负且名下还有地产时，会暂停
  在 `must_sell` 决策，强制卖出地产（按购买价的一半回收给银行）补齐差额，卖到
  不再负数为止；只有名下已经没有地产、现金还是负的，才会真正判负。是简化版的
  "抵押"——卖出的地产直接变回无主状态，不做"赎回"，双方之后都能重新购买
- ~~没有"连续掷出双数额外回合"这类进阶规则~~ **已补上**：现在是真正的两颗骰子，
  点数相同（双数）可以再掷一次，连续3次双数直接送进监狱、作废本次移动
  （见 `logic.ts` 的 `finishTurn` / `pendingBonusRoll` / `consecutiveDoubles`）
- **新增**：集齐某个色组的全部地产后，租金翻倍（`ownsFullColorGroup`），让"攒同
  色地产"这个策略有意义，但没有做完整的盖房子系统——这是有意控制复杂度的折中
- 棋盘UI已做过一轮视觉优化（按地产分组配色+类型图标，见 `MonopolyGame.tsx`），
  这次同时修了一个 z-index 导致棋子被格子盖住看不见的 bug（grid item 的
  z-index 哪怕没设 position 也会生效，这个坑后续加高亮效果时要小心）。
  下一步视觉方向定的是 CSS/JS 做"伪3D"质感（不引入 three.js），还没开始做

**飞行棋的已知简化/待办事项**：
- 不是经典实体飞行棋的十字棋盘，是简化过的"共享环形跑道24格 + 各自专属到家小路6格"
  模型，规则等价但视觉呈现不同
- 已支持"掷到6可以再掷一次"（`consecutiveSixes` 字段 + `logic.ts` 里的
  `grantBonusRoll` 逻辑），并加了"连续3次掷出6作废本次移动机会、轮到对方"的
  防无限连庄保护，规则上更接近经典体验了
- ~~只支持双色（2人各1色/4棋子），四色版本（每人控制2色）是下一步计划~~
  **已升级为四色版**：红/蓝/绿/黄四个起飞点均匀分布在环形跑道上（每隔6格一个），
  房主控制红+绿（正对面），访客控制蓝+黄（正对面），环上是红-蓝-绿-黄交替排列。
  每人这一回合里，自己的8颗棋子（2色×4颗）任选一颗能走的动，多了"先冲哪个颜色"
  的策略选择；胜负判定改成"两个颜色一共8颗棋子全部到家"。仍然是2人对局（不是
  四人游戏），只是每人多控制了一种颜色。相关常量都在 `board.ts` 里
  （`COLOR_START_INDEX` / `COLOR_OWNER` / `ROLE_COLORS` / `COLOR_SHADES`），
  `Token.tsx` 加了 `shades` 覆盖参数支持任意配色，不再局限于 host/guest 两色。

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

## 共享UI组件（骰子/棋子）

`src/games/shared/` 放跨游戏复用的UI小组件，目前有：
- `Dice.tsx` —— SVG骰子，`rolling=true`时随机换点数+轻微旋转，配合 `rollWithAnimation()`
  （返回一个1-3秒随机延迟的Promise）实现"转动骰子"的视觉效果。任何需要骰子的新游戏
  直接复用这个组件，不要自己重画一个。
- `Token.tsx` —— SVG棋子（圆形+高光+可选数字标签），按 `role`（host/guest）区分颜色。
  以后如果想换成AI生成的角色插画，只需要改这一个文件内部的`<svg>`为`<image>`标签
  指向素材图片，所有引用`<Token/>`的地方会自动更新，不用挨个游戏改。

## 单人练习模式的"AI对手"是一个容易漏掉的坑

单人模式下，`guest` 是一个不存在真实用户的"机器人"角色。**如果只处理了"SINGLE模式跳过网络请求"，游戏在人类玩家回合结束、轮到"guest"之后会卡住不动**——因为没有任何代码会替"guest"去调用掷骰子/做决定的函数。

正确做法是加一个 `useEffect`，监听 `state.currentTurn === "guest" && room.room_code === "SINGLE"`，延迟一小段时间后自动帮"guest"完成这一回合的动作（掷骰子、如果有待决定的选择就用一个简单的启发式规则决定）。`monopoly/MonopolyGame.tsx` 和 `flightchess/FlightChessGame.tsx` 里都有现成实现，写新游戏时照抄这个模式即可。

**自检清单再加一条**：新游戏如果有单人模式，必须验证"轮到AI时游戏是否会自动继续"，不能只测"轮到自己时能不能操作"。

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
