import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  getOrCreatePlayer,
  updatePlayerName,
  roomManager,
  isSupabaseMode,
} from "./lib/roomManager.js";
import { Room } from "./types.js";
import { GAME_UI_REGISTRY, getGameDefinition } from "./games/registry.js";
import { getInitialGameState } from "./games/definitions.js";
import {
  User,
  Users,
  Gamepad2,
  Tv,
  ArrowRight,
  Database,
  HelpCircle,
  Code,
  Info,
  CheckCircle2,
  Compass,
} from "lucide-react";

export default function App() {
  const [player, setPlayer] = useState({ id: "", name: "" });
  const [editingName, setEditingName] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [playerRole, setPlayerRole] = useState<"host" | "guest" | "spectator">("spectator");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  // Initialize player from local storage
  useEffect(() => {
    const p = getOrCreatePlayer();
    setPlayer(p);
    setEditingName(p.name);
  }, []);

  const handleUpdateName = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = updatePlayerName(editingName);
    setPlayer((prev) => ({ ...prev, name: updated }));
    setError(null);
  };

  const handleCreateRoom = async (gameType: string) => {
    setLoading(true);
    setError(null);
    try {
      const room = await roomManager.createRoom(gameType, player.name);
      setActiveRoom(room);
      setPlayerRole("host");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "创建房间失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleStartSinglePlayer = (gameType: string) => {
    setLoading(true);
    setError(null);
    try {
      const p = getOrCreatePlayer();
      const singleRoom: Room = {
        room_code: "SINGLE",
        game_type: gameType,
        status: "waiting",
        players: {
          host: {
            id: p.id,
            name: p.name,
            online: true,
            last_seen: Date.now(),
            ready: false,
          },
          guest: {
            id: "AI_BOT",
            name: "智能 AI (电脑)",
            online: true,
            last_seen: Date.now(),
            ready: true,
          },
        },
        game_state: getInitialGameState(gameType),
      };
      setActiveRoom(singleRoom);
      setPlayerRole("host");
    } catch (err: any) {
      setError("无法开启单人模式");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCodeInput.trim()) {
      setError("请输入 6 位房间号");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { room, role } = await roomManager.joinRoom(roomCodeInput, player.name);
      setActiveRoom(room);
      setPlayerRole(role);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "加入房间失败，请检查房间号是否正确");
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveRoom = () => {
    setActiveRoom(null);
    setRoomCodeInput("");
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-500/20 selection:text-indigo-900">
      
      {/* Dynamic Background Mesh Effect */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(79,70,229,0.04),transparent_45%)] pointer-events-none" />

      {/* Top Header Bar */}
      <header className="border-b border-slate-200 relative z-10 backdrop-blur-md bg-white/90">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-100">
              <Gamepad2 className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight font-sans text-slate-800">
                DUO<span className="text-indigo-600">PLAY</span>
              </h1>
              <span className="text-[10px] text-slate-500 block font-medium uppercase tracking-wider">
                Two-Player Game Hub
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Mode status badge */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-xs">
              <div className={`w-2 h-2 rounded-full ${isSupabaseMode ? "bg-indigo-500" : "bg-emerald-500"}`} />
              <span className="text-slate-600 font-medium">
                {isSupabaseMode ? "Supabase 云联机" : "本地直连引擎"}
              </span>
            </div>

            <button
              onClick={() => setShowGuide(!showGuide)}
              className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-200 font-medium"
            >
              <HelpCircle size={14} className="text-indigo-500" />
              <span>部署与配置指南</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container Router */}
      <main className="flex-grow container mx-auto px-4 py-8 relative z-10 max-w-7xl">
        <AnimatePresence mode="wait">
          {activeRoom ? (
            // ==========================================
            // ACTIVE GAME SCREEN
            // ==========================================
            <motion.div
              key="active-game"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              {(() => {
                const gameDef = getGameDefinition(activeRoom.game_type);
                if (!gameDef) {
                  return (
                    <div className="bg-white border border-red-200 text-red-600 p-6 rounded-2xl text-sm">
                      未知的游戏类型 "{activeRoom.game_type}"，请检查 src/games/registry.tsx 是否已注册该游戏。
                    </div>
                  );
                }
                const GameComponent = gameDef.component;
                return (
                  <GameComponent
                    room={activeRoom}
                    role={playerRole}
                    onLeave={handleLeaveRoom}
                    roomManager={roomManager}
                  />
                );
              })()}
            </motion.div>
          ) : (
            // ==========================================
            // GAME LOBBY
            // ==========================================
            <motion.div
              key="lobby"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            >
              {/* LEFT AREA: Profiles & Connection Controls */}
              <div className="col-span-1 lg:col-span-5 flex flex-col gap-6">
                
                {/* 1. Player identity settings card */}
                <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 text-slate-100">
                    <User size={64} className="opacity-40 stroke-[1]" />
                  </div>

                  <h3 className="text-sm font-semibold text-slate-400 tracking-wider uppercase mb-4 flex items-center gap-2">
                    <User size={16} className="text-indigo-600" />
                    我的身份凭证
                  </h3>

                  <form onSubmit={handleUpdateName} className="flex flex-col gap-3">
                    <label className="text-xs text-slate-500 font-medium">
                      设定你的游戏昵称 (保存在本地)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        placeholder="请输入游戏昵称..."
                        maxLength={16}
                        className="flex-grow bg-slate-50 border border-slate-200 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-sm text-slate-800 outline-none transition duration-150"
                      />
                      <button
                        type="submit"
                        disabled={editingName.trim() === player.name}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-xs font-bold text-white rounded-xl transition duration-150 shadow-sm"
                      >
                        保存
                      </button>
                    </div>
                  </form>

                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>我的识别码:</span>
                    <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                      {player.id ? player.id.substring(0, 18) + "..." : "正在初始化..."}
                    </span>
                  </div>
                </div>

                {/* 2. Direct Code Joining box */}
                <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-400 tracking-wider uppercase mb-4 flex items-center gap-2">
                    <Users size={16} className="text-indigo-600" />
                    快速加入房间
                  </h3>

                  <form onSubmit={handleJoinRoom} className="flex flex-col gap-3">
                    <label className="text-xs text-slate-500 font-medium">
                      输入 6 位字母数字房间号进行对局
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={roomCodeInput}
                        onChange={(e) => setRoomCodeInput(e.target.value)}
                        placeholder="例如: DX89A1"
                        maxLength={6}
                        className="flex-grow uppercase bg-slate-50 border border-slate-200 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm font-bold tracking-widest text-slate-800 outline-none transition duration-150"
                      />
                      <button
                        type="submit"
                        disabled={loading || !roomCodeInput.trim()}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-sm transition duration-200 flex items-center gap-1.5"
                      >
                        {loading ? "正在加入..." : "加入游戏"}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </form>

                  {error && (
                    <div className="mt-3 bg-red-50 border border-red-100 text-red-600 text-xs px-3 py-2 rounded-xl animate-shake">
                      {error}
                    </div>
                  )}
                </div>

                {/* 3. Connection Setup state notice card */}
                <div className="bg-white border border-slate-200 p-5 rounded-2xl text-xs text-slate-500 flex flex-col gap-2.5 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-800 font-semibold">
                    <Database size={14} className="text-indigo-600" />
                    <span>联机服务状态</span>
                  </div>
                  <p className="leading-relaxed text-slate-600">
                    本网站为<b>双人联机游戏专属平台</b>，使用<b>无账号系统设计</b>。
                    我们采用双工通信。目前连接到：
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col">
                      <span className="text-[10px] text-slate-400 font-medium uppercase">引擎模式</span>
                      <span className={`text-xs font-bold mt-0.5 ${isSupabaseMode ? "text-indigo-600" : "text-emerald-600"}`}>
                        {isSupabaseMode ? "Supabase Realtime" : "本地 SSE 服务器"}
                      </span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col">
                      <span className="text-[10px] text-slate-400 font-medium uppercase">掉线探测</span>
                      <span className="text-xs font-bold text-slate-700 mt-0.5">
                        心跳监测 (10s 掉线)
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* RIGHT AREA: Active Games Selection Grid */}
              <div className="col-span-1 lg:col-span-7 flex flex-col gap-6">
                
                {/* Section title */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Gamepad2 className="text-indigo-600" size={18} />
                    选择休闲游戏
                  </h2>
                  <span className="text-xs text-slate-500">双人同屏/联机</span>
                </div>

                {/* Games selection grid — generated from src/games/registry.tsx.
                    Adding a game to that registry automatically adds a card here. */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {GAME_UI_REGISTRY.map((game) => (
                    <div
                      key={game.id}
                      className="group bg-white border border-slate-200 hover:border-indigo-500/30 p-5 rounded-2xl shadow-sm hover:shadow-md transition duration-200 flex flex-col h-full relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-500/5 to-transparent rounded-bl-full pointer-events-none" />

                      <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50/80 text-indigo-600 flex items-center justify-center font-bold">
                          {game.icon}
                        </div>
                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full font-semibold tracking-wider">
                          {game.badge}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-slate-800 mb-1 group-hover:text-indigo-600 transition">
                        {game.name}
                      </h3>
                      <p className="text-xs text-slate-500 leading-relaxed flex-grow mb-6">
                        {game.description}
                      </p>

                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => handleCreateRoom(game.id)}
                          disabled={loading}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition duration-150 flex items-center justify-center gap-1.5"
                        >
                          {loading ? "正在创建..." : "创建专属房间"}
                        </button>
                        <button
                          onClick={() => handleStartSinglePlayer(game.id)}
                          disabled={loading}
                          className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 text-xs font-bold rounded-xl transition duration-150 flex items-center justify-center gap-1.5"
                        >
                          单人练习
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Database guide panel if toggled */}
                <AnimatePresence>
                  {showGuide && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-white border border-slate-200 p-6 rounded-2xl overflow-hidden mt-2 shadow-sm"
                    >
                      <div className="flex items-center gap-2 pb-4 border-b border-slate-100 mb-4">
                        <Code className="text-indigo-600" size={18} />
                        <h3 className="text-sm font-bold text-slate-800">
                          Supabase 后台数据库建表 & Realtime 开启指南
                        </h3>
                      </div>

                      <div className="text-xs text-slate-500 flex flex-col gap-4">
                        <p>
                          本应用内置双重网络适配器。默认无需配置即可在 AI Studio 网页预览中直接双人对战。
                          如果您打算将本项目部署至 Vercel，并对接您自己的 <b>Supabase</b> 数据库，请按以下步骤配置：
                        </p>

                        <div className="flex flex-col gap-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider block">
                            第 1 步: 在 Supabase SQL Editor 中运行以下 SQL 脚本创建表
                          </span>
                          <pre className="text-[10px] text-slate-700 font-mono overflow-x-auto whitespace-pre p-2 bg-white rounded border border-slate-200">
{`-- 1. 创建 rooms 房间表
CREATE TABLE IF NOT EXISTS public.rooms (
    room_code TEXT PRIMARY KEY,
    game_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    players JSONB NOT NULL DEFAULT '{}'::jsonb,
    game_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 启用行级安全（对未注册用户开启，允许匿名读写）
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read rooms" 
ON public.rooms FOR SELECT USING (true);

CREATE POLICY "Allow anonymous insert rooms" 
ON public.rooms FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous update rooms" 
ON public.rooms FOR UPDATE USING (true);`}
                          </pre>
                        </div>

                        <div className="flex flex-col gap-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider block">
                            第 2 步: 开启 Supabase Realtime (实时推送)
                          </span>
                          <ul className="list-decimal pl-4 space-y-1">
                            <li>登录 Supabase 仪表盘，进入左侧菜单的 <b>Database</b>。</li>
                            <li>点击 <b>Replication</b> 选项。</li>
                            <li>
                              在 <b>supabase_realtime</b> 发布包（Publication）中，点击 <b>Source</b>，
                              并将 <b>rooms</b> 表勾选并启用。或者直接在 SQL 页面执行：
                              <code className="block bg-slate-100 text-slate-700 font-mono text-[10px] p-1 rounded border border-slate-200 mt-1">
                                alter publication supabase_realtime add table public.rooms;
                              </code>
                            </li>
                          </ul>
                        </div>

                        <div className="flex flex-col gap-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider block">
                            第 3 步: 环境变量绑定
                          </span>
                          <p>
                            在 Vercel 部署后台或本地 <code className="text-slate-800 font-semibold">.env</code> 中添加：
                          </p>
                          <pre className="text-[10px] text-indigo-600 font-mono p-1">
{`VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-public-key"`}
                          </pre>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer copyright */}
      <footer className="border-t border-slate-200 py-6 text-center text-slate-400 text-xs mt-auto bg-white/40">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p>© 2026 双人休闲游乐场. 技术驱动，代码简洁，支持高可扩展性。</p>
          <div className="flex gap-4">
            <span className="hover:text-slate-600 cursor-pointer">服务协议</span>
            <span className="hover:text-slate-600 cursor-pointer">隐私声明</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
