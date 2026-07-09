import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getOrCreatePlayer, updatePlayerName, roomManager } from "../lib/roomManager.js";
import { GAME_UI_REGISTRY } from "../games/registry.js";
import { User, Users, Gamepad2, ArrowRight } from "lucide-react";

export default function Lobby() {
  const navigate = useNavigate();
  const [player, setPlayer] = useState({ id: "", name: "" });
  const [editingName, setEditingName] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      // Seed the room screen with what we already fetched, via router state,
      // so it doesn't need to make a second network round-trip on mount.
      navigate(`/room/${room.room_code}`, { state: { room, role: "host" } });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "创建房间失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleStartSinglePlayer = (gameType: string) => {
    navigate(`/practice/${gameType}`);
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
      navigate(`/room/${room.room_code}`, { state: { room, role } });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "加入房间失败，请检查房间号是否正确");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* LEFT AREA: Profile & Join */}
      <div className="col-span-1 lg:col-span-5 flex flex-col gap-6">
        {/* Player identity settings card */}
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
        </div>

        {/* Direct Code Joining box */}
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
      </div>

      {/* RIGHT AREA: Game selection grid — generated from src/games/registry.tsx */}
      <div className="col-span-1 lg:col-span-7 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Gamepad2 className="text-indigo-600" size={18} />
            选择休闲游戏
          </h2>
          <span className="text-xs text-slate-500">双人同屏/联机</span>
        </div>

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
      </div>
    </div>
  );
}
