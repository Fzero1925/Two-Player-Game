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
    registry.tsx          # ★ 每个游戏的 UI 定义（名称/图标/描述/组件），给 App.tsx 用
    pictionaryWords.ts    # 你画我猜词库（唯一副本，不要在别处再复制一份）
  components/
    GomokuGame.tsx        # 具体游戏组件
    PictionaryGame.tsx
  lib/
    roomManager.ts        # 房间管理：创建/加入/同步/心跳，双模式统一封装
  App.tsx                 # 大厅 + 路由，从 registry.tsx 读取游戏列表，不手写游戏卡片
server.ts                 # 本地兜底模式的 Express 服务器（仅用于本地预览）
```

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

## 新增一个游戏的标准步骤

1. 在 `src/games/definitions.ts` 里给 `GAME_DEFINITIONS` 加一项，
   写好 `getInitialState()`。
2. 写游戏组件 `src/components/YourGame.tsx`，props 必须是：
   ```ts
   { room: Room; role: "host" | "guest" | "spectator";
     onLeave: () => void; roomManager: typeof roomManager }
   ```
   状态同步统一调用 `roomManager.updateGameState(roomCode, newState, status?)`，
   订阅统一调用 `roomManager.subscribeToRoom(roomCode, onUpdate, onError)`。
3. 在 `src/games/registry.tsx` 的 `GAME_UI_REGISTRY` 里加一项
   （id、name、icon、badge、description、component）。
4. **完成，不要改 `App.tsx`、`server.ts`**。这两个文件已经是通用逻辑，
   加游戏不应该触碰它们。
5. 改完跑一遍 `npx tsc --noEmit` 和 `npm run build` 确认没有类型错误、
   构建能过，再交付。

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
- [ ] 新游戏的初始状态只写在 `definitions.ts` 一处
- [ ] 新游戏的 UI 只注册在 `registry.tsx` 一处
- [ ] 没有在 `App.tsx` / `server.ts` 里为具体某个游戏写 if/else 特判
