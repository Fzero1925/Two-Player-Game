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
    shared/
      Dice.tsx             # 跨游戏复用的骰子组件
      Token.tsx             # 跨游戏复用的棋子组件
    monopoly/
      board.ts              # 棋盘数据（格子/配色/十六进制色值）
      chanceCards.ts        # 机会卡数据
      logic.ts               # 纯游戏逻辑，不 import React
      MonopolyGame.tsx      # 2D UI外壳（头部/玩家卡/机会卡弹窗）+ 懒加载 Board3D
      Board3D.tsx            # 真3D棋盘，纯展示层，见下方"真3D棋盘"章节
    flightchess/
      board.ts / logic.ts / FlightChessGame.tsx / Board3D.tsx  # 结构和 monopoly/ 完全对应
    memorymatch/
      board.ts / logic.ts / MemoryMatchGame.tsx
  components/
    GomokuGame.tsx         # 还没拆分独立文件夹的老游戏，逻辑内联在组件里
    PictionaryGame.tsx      # 同上，且目前从大厅隐藏（见"已上线游戏一览"）
    TokenCluster.tsx         # 首页 Hero 区悬浮棋子装饰，复用 Token.tsx
  lib/
    roomManager.ts         # 房间管理：创建/加入/同步/心跳，双模式统一封装
  pages/
    Layout.tsx             # 共享头部/底部，<Outlet/> 承载具体页面
    Lobby.tsx               # 首页大厅：身份/加入房间/游戏选择网格
    RoomScreen.tsx          # /room/:roomCode，联机对局页面
    PracticeScreen.tsx      # /practice/:gameType，单人练习页面
  App.tsx                  # 纯路由表，不写业务逻辑
public/
  fonts/board-cjk.woff2    # 3D棋盘用的中文字体子集，monopoly+flightchess共用，见"真3D棋盘"章节
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
| 你画我猜（隐藏中） | `pictionary` | `src/components/PictionaryGame.tsx` + `definitions.ts`内联 | 中 |
| 简化版大富翁 | `monopoly` | `src/games/monopoly/` | 中高 |
| 飞行棋（四色版） | `flightchess` | `src/games/flightchess/` | 中 |
| 翻牌配对 | `memorymatch` | `src/games/memorymatch/` | 低 |

**你画我猜的去留（2026-07 拍板）**：继续隐藏，不删代码也不做进一步开发。
单人模式的 AI 识图功能依赖 server.ts 的 Express 路由，Vercel Serverless
环境跑不起来是已知问题；除非以后专门花一轮把它迁移成 Serverless
Function，否则没有理由恢复展示一个"AI功能实际是坏的"的游戏卡片。

**翻牌配对的设计说明**：4×4共16张牌（8组emoji配对），双方轮流翻两张，配对
成功计分+可以再翻一次（奖励回合，跟大富翁"双数"、飞行棋"掷6"是同一套
"做对了奖励连续行动"的设计语言），配对失败则由**当前回合玩家的客户端**
负责在展示 `MISMATCH_REVEAL_MS`（1.1秒）后调用 `resolveMismatch` 把牌盖
回去、换人——这个"由行动方客户端触发后续结算"的模式和单人AI回合、
大富翁卖地决策是同一套，写新游戏遇到"需要延迟结算"的场景可以照抄。单人
模式的AI没有"记忆"（不会刻意记住翻过的牌），纯随机选未配对未翻开的牌，
想要更强可以后续加一个简单的记忆启发式。

**大富翁的已知简化/待办事项**（不是bug，是刻意的MVP取舍，后续可以按需加）：
- ~~骰子UI只画一颗骰子~~ **修复过的真bug**（不是简化，是疏漏）：改成两颗骰子规则
  之后，state 一直只存了两颗骰子的"和"，UI 拿这个和去找骰子点数图案，超过6的
  数字找不到对应图案，画面和"X + Y"的文字提示对不上。现在 state 里加了
  `lastDice: [number, number]`，分别记录两颗骰子的点数，UI 并排渲染两颗骰子。
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
  ~~下一步视觉方向定的是 CSS/JS 做"伪3D"质感~~ **这个计划后来被推翻了**：
  评估过 CSS 伪3D之后，用户看了参考图明确要求做真3D，直接跳到了引入
  three.js（见下面"真3D棋盘"章节），CSS伪3D这条路线没有在棋盘本身上落地，
  但产出的立体质感语言（`raised-card`、骰子渐变面）保留下来用在了别处。

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
- **真3D棋盘已完成**（2026-07，跟大富翁同一轮）：环形跑道+四色到家小路+营地
  停机坪，详见下面"真3D棋盘"章节。之前"飞行棋2D圆形跑道棋子直接用CSS
  transition 在百分比坐标间插值、多格移动会穿过圆心"的问题，在3D化之前先
  单独修过一次（改成沿圆环逐格hop），3D化之后2D跑道渲染代码整体删除，
  这个修复本身也随之作废——如果以后又要做2D兜底展示，不要直接抄旧commit
  里的 `useTrackHopPosition`，那是给百分比坐标系统设计的，3D场景直接用
  `useFrame` 每帧算世界坐标，两者不通用。

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
  直接复用这个组件，不要自己重画一个。header里的骰子按钮用的就是这个。
- `Token.tsx` —— SVG棋子（径向渐变球体+高光+底座投影，立体质感，按 `role`
  (host/guest) 决定默认配色）。支持一个可选的 `shades` 参数直接传入
  `{light,mid,dark,darkest}` 四档色阶，覆盖 role 默认配色——飞行棋四色版
  就是靠这个参数让同一个组件画出红/蓝/绿/黄四种棋子，不用为每个颜色单独写
  一个组件。以后新游戏要用棋子，永远复用这一个 `<Token/>`，不要重画。
- `Die3D.tsx`（2026-07新增）—— 3D骰子，摆在两个游戏各自的3D棋盘场景里（棋盘
  中心装饰旁边的空地），跟 header 上那颗2D `<Dice/>` 共用同一个 `rolling` 状态：
  一次掷骰子，2D和3D两颗骰子同时转、同时停在同一个点数上。点数用小球体pip摆出
  标准布局，摆点坐标直接照抄了 `Dice.tsx` 的 `PIP_POSITIONS`（换算成立方体每个
  面的本地UV），两颗骰子长得是"同一颗"的两种形态。**这是 `shared/` 目录下第一个
  依赖 three.js 的组件**——`Dice.tsx`/`Token.tsx` 都是纯SVG，可以随便在哪个文件
  里 import；`Die3D.tsx` 只能从 `Board3D.tsx` 里 import（那两个文件已经在懒加载
  chunk里了），绝对不能从 `MonopolyGame.tsx`/`FlightChessGame.tsx` 这些非懒加载
  的外壳组件直接引用，否则会把 three.js 拖回主bundle。
- `useTurnReminder.ts` + `TurnReminderToggle.tsx`（2026-07新增）—— "轮到你了"
  提醒，四个游戏（五子棋/大富翁/飞行棋/翻牌配对）都接了。纯前端实现，不需要
  后端改动：标签页不是焦点时标题闪烁（不需要权限），配合一个可选的系统通知
  （需要玩家自己点按钮授权 `Notification` 权限，不会自动弹）。SINGLE练习模式
  下不显示这个开关（`room.room_code !== "SINGLE"` 挡住了，一个人练习没有"等
  对方"这回事）。**没有做"应用关掉也能收到"的真推送**（那需要 Service Worker
  + Web Push + 新的 Supabase 表存订阅 + 一个新的 serverless function 在对方
  走完之后主动发送，是完全不同量级的活）——如果以后需要，这个是新的一块，
  不是在现有 hook 上加个参数就能顺带做完的。

## 大富翁 + 飞行棋 真 3D 棋盘（2026-07，推翻了"不上 three.js"的决定）

用户看了一版 AI 生成的参考图之后，明确要求大富翁/飞行棋都做成真 3D（不是
上面那节的 CSS 伪3D）。这次真的引入了 three.js 生态，但控制了一个关键点：
**风格化几何体 + 材质配色，没有任何外部3D模型/贴图文件**，跟之前 three.js
骰子demo是同一个技术路线，不是照抄参考图那种精细写实渲染（那种效果需要
专业3D美术资产，属于另一个数量级的成本，明确排除在外）。大富翁先做，飞行棋
隔了一轮之后照同一套技术路线跟上，两个棋盘现在都是真3D。

- **技术栈**：`three` + `@react-three/fiber`（R3F，声明式写法）+
  `@react-three/drei`（RoundedBox/Text/ContactShadows/OrbitControls 这些
  现成组件），比裸写 three.js 好维护很多。两个游戏共用同一套依赖，Vite/Rollup
  会自动把 three.js/R3F/drei 这部分识别成两个懒加载chunk的公共依赖、单独
  分成一个共享chunk——不管先打开哪个3D游戏都只下载一次，第二个3D游戏打开时
  这部分已经在浏览器缓存里了，只需要再下载自己那个几KB的小文件。
- **文件**：`src/games/monopoly/Board3D.tsx` 和 `src/games/flightchess/Board3D.tsx`，
  都是纯展示层，不含任何游戏逻辑——只读各自的 state 来画画，`logic.ts` 完全
  没有改动。大富翁棋盘布局复用了之前2D版本的 `ringPosition` 公式，保证格子
  顺序/相邻关系跟2D时代完全一致；飞行棋棋盘是全新设计的布局（2D版本是纯
  CSS，没有可复用的3D坐标公式），细节见下面"飞行棋3D棋盘的布局设计"。
  大富翁的十六进制配色数据在 `board.ts` 的 `COLOR_HEX` / `TILE_TYPE_HEX`
  （2D用的是同一份数据的 Tailwind class 版本 `COLOR_GROUPS` /
  `TILE_TYPE_ACCENT`，两边配色是同一套，不是两套视觉语言）。

**飞行棋3D棋盘的布局设计**（和2D圆形跑道版本的空间关系保持一致，玩过2D
版本的人能直接认出"这是同一个棋盘"）：
- 共享跑道24格沿一个圆环排列，角度公式跟2D时代 `trackCirclePercent` 用的
  是同一个（cell/24×2π − π/2，从"上方"开始顺时针）
- 每个颜色的到家小路是一根"辐条"，角度固定在该颜色起飞格的角度上，半径从
  环外沿朝圆心方向递减——对应规则叙事"跑完一圈、经过自己起飞格时拐进专属
  小路"
- 每个颜色在环外侧有一个2×2小停机坪，停放最多4颗还没起飞的棋子——这是2D
  版本没有的（2D只在玩家卡片里用文字列"营地：1、3"），3D这版把营地也摆进了
  场景里，营地/跑道/到家小路/到家四种状态都有对应的3D坐标
- 棋子移动动画：每颗棋子自己的 `step` 是单调递增的整数（-1=营地，0~23=
  共享跑道，24~29=到家小路，不会绕圈），所以直接从"旧step+1"逐格hop到
  "新step"即可，比大富翁棋子的路径计算还简单——不需要判断"顺时针/逆时针
  哪边近"（大富翁的共享环形跑道会被多个玩家复用同一批格子，需要判断；飞行
  棋每颗棋子的 step 编号是它自己独占的坐标系，不存在这个问题）

**踩过的坑，两个3D棋盘都适用**：

1. **打包体积**：three.js + R3F + drei 加起来接近 300KB（gzip后），如果直接
   `import Board3D`，这些代码会被打进主bundle——意味着首页、五子棋、翻牌
   配对这些完全不需要3D的页面也要背上这个体积。**必须用 `React.lazy()` +
   `<Suspense>` 懒加载**，让3D相关代码单独分包，只有真正打开对应游戏才下载。
   `MonopolyGame.tsx` / `FlightChessGame.tsx` 里能看到具体写法，新游戏要加
   3D直接照抄这个模式。

2. **中文字体是个隐藏地雷**：drei 的 `<Text>` 不指定 `font` 时，底层
   troika-three-text 会在运行时自动去 `cdn.jsdelivr.net` 按字符现拉字体——
   这个CDN在国内网络环境下不一定连得上，会导致棋盘上的中文字"看不见"
   （不是报错，是安静地渲染不出来，很难排查）。解决方式是自己生成一个只包含
   实际用到的汉字的字体子集（用 `fonttools` 的 `pyftsubset`，源字体从
   `@fontsource/noto-sans-sc` 包里的
   `files/noto-sans-sc-chinese-simplified-100-normal.woff2`（Thin/100字重）
   拿），塞进 `public/fonts/board-cjk.woff2` 随站点静态资源一起部署，然后
   在每个 `<Text>` 上显式传 `font="/fonts/board-cjk.woff2"`。这份字体现在是
   两个3D棋盘**共用**的一份子集（原来叫 `monopoly-board-cjk.woff2`，只有
   大富翁在用；飞行棋3D化时把飞行棋需要的"飞行棋红蓝绿黄"7个新字也合并
   进来，改成了现在这个更中性的文件名），一共58个汉字、10KB出头。以后
   棋盘上要显示新的汉字，必须把两个 `Board3D.tsx` 实际用到的汉字合并去重
   重新生成这个子集文件，不然新字符会显示不出来——`monopoly/Board3D.tsx`
   顶部注释里有完整的重新生成命令。

3. **2D时代的"棋盘中心信息面板"（当前回合高亮+事件文字）在3D里没地方放**
   （塞进3D场景里要么被摄像机角度挡住，要么小到看不清），所以事件提示文字
   `state.lastEvent` 被挪到了棋盘上方单独一个2D卡片里，购买/交租金/抽机会
   卡这些关键反馈都从这里看，不在3D棋盘本身上显示。飞行棋的"到家小路"2D
   卡片同理保留在3D棋盘下方，没有因为3D化就删掉——3D场景负责空间沉浸感，
   2D卡片负责"一眼扫过去就知道现在什么状态"，两者分工，不是互相替代。

## CSS 伪3D质感（2026-07，不上 three.js 的立体化路线）

评估过 three.js 之后决定不引入（成本和收益不成比例，见对话历史），改用纯
CSS 做立体感，这次把它铺到了棋盘格子和骰子上（上一轮只做了棋子）。**这套
方案现在的适用范围**：大富翁/飞行棋两个棋盘本身后来都换成了真3D（见上面
"真3D棋盘"章节），CSS伪3D不再用在棋盘格子上；但 `Dice.tsx` 的渐变骰面、
`raised-card`/`raised-card-hover` 这类卡片立体感，仍然是站内非3D区域
（头部条、玩家信息卡、首页卡片等）的默认视觉语言，没有过时。
- `Dice.tsx`：渐变骰面（左上亮右下暗）+ 一条露出的"厚度边"（右下偏移的
  纯色矩形）+ 骰面下方的投影椭圆 + 点数本身也做成了带高光的小球体，
  不再是纯色圆点。
- ~~大富翁棋盘格子~~ / ~~飞行棋跑道格子~~：这两处后来都换成了真3D
  棋盘，下面两条是历史记录，不代表当前实现：
  - 大富翁曾经用 `border-b-4` 配更深一号的同色系做"方块厚度"，配合
    `shadow-[...]` 叠层——这套配色数据还在 `board.ts` 的 `COLOR_GROUPS` /
    `TILE_TYPE_ACCENT` 里（`edge` 字段），2D数据本身没删，只是不再用来
    画格子厚度了
  - 飞行棋因为格子是圆形，当时用等效的 `box-shadow` 内嵌阴影模拟同样效果
- `.raised-card` 全局工具class（`index.css`）：统一给头部条、玩家信息卡
  这类大面积白色卡片加"内侧高光+柔和投影"的立体感，避免"棋盘立体、外面的
  卡片还是纯平"两套画风混在一起。新加白色卡片容器，优先用这个 class 而
  不是 `shadow-sm`。
- `.raised-card-hover`（2026-07 新增）：`.raised-card` 的可交互变体，
  悬浮时阴影加深+轻微上浮（`translateY(-2px)`），给"这是能点的东西"一个
  明确反馈。首页游戏选择卡片这类**可点击**的卡片用这个；纯展示、不可点击
  的容器（比如玩家信息卡）继续用静态的 `.raised-card`，不要两个混用错。

## 首页视觉系统（2026-07 新增）

首页（`Lobby.tsx`）之前是能用但比较"通用SaaS后台"的风格，这次做了一轮针对性
的品牌化，不是推倒重来：
- **字体**：新增了 `Fredoka`（标题用，圆润有个性）+ `Plus Jakarta Sans`
  （正文）+ `JetBrains Mono`（房间号这类"代码感"文本）三套 Google Fonts，
  通过 Tailwind v4 的 `@theme` 在 `index.css` 里注册成 `font-display` /
  `font-body`（全局默认）/ `font-code` 三个工具类。字体链接在 `index.html`
  的 `<head>` 里，纯前端 `<link>` 引入，不需要额外构建配置。
- **签名视觉**：`src/components/TokenCluster.tsx`——首页 Hero 区右侧一小簇
  悬浮的彩色棋子，直接复用游戏里真实的 `<Token/>` 组件（不是找的装饰图），
  让首页第一眼看到的就是"等下要玩的棋子本身"。悬浮动效复用了 `index.css`
  里原本就有、但之前没被用到的 `token-float` 关键帧。在小屏幕上默认隐藏
  （`hidden sm:block`），避免和文案抢位置——如果以后想要手机上也有这个效果，
  需要单独设计一个更收敛的移动端版本，不要直接把桌面版缩小塞进去。
- 游戏卡片标题、Hero大标题、"选择休闲游戏"小标题都换成了 `font-display`，
  房间号输入框换成了 `font-code`，跟标题/正文形成有意识的字体分工。

**2026-07 增量优化**（大富翁/飞行棋3D化的同一轮）：首页当时还有两张卡片
（身份凭证、快速加入房间）和游戏选择卡片用的是 Tailwind 原生 `shadow-sm`，
没跟上 `raised-card` 这套后来才定下来的立体卡片语言，这次统一改掉了——
静态容器用 `raised-card`，可点击的游戏选择卡片用新增的 `raised-card-hover`
（悬浮态阴影加深+上浮，见"CSS伪3D质感"章节）。另外大富翁/飞行棋的卡片
`badge` 字段从跟其它游戏一样的"联机对局"改成了"3D 棋盘"，让首页能直接
看出这两个游戏和另外两个（五子棋/翻牌配对）的差异化卖点，不用点进去才
知道。

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
