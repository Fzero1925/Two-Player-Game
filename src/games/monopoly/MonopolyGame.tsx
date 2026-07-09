import React, { useState, useEffect } from "react";
import { Room, Player } from "../../types.js";
import { roomManager, getOrCreatePlayer, isPlayerOnline } from "../../lib/roomManager.js";
import { BOARD } from "./board.js";
import { MonopolyState, PlayerRole, rollDiceAndMove, resolveBuyDecision } from "./logic.js";
import { ArrowLeft, Dice5, Wifi, WifiOff, Trophy, Coins } from "lucide-react";

interface MonopolyGameProps {
  room: Room;
  role: "host" | "guest" | "spectator";
  onLeave: () => void;
}

const ROLE_LABEL: Record<PlayerRole, string> = { host: "房主", guest: "访客" };
const ROLE_COLOR: Record<PlayerRole, string> = { host: "bg-indigo-500", guest: "bg-amber-500" };

export default function MonopolyGame({ room: initialRoom, role, onLeave }: MonopolyGameProps) {
  const [room, setRoom] = useState<Room>(initialRoom);
  const [error, setError] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (initialRoom.room_code === "SINGLE") {
      setRoom(initialRoom);
      return;
    }
    const unsubscribe = roomManager.subscribeToRoom(
      initialRoom.room_code,
      (updatedRoom) => {
        setRoom(updatedRoom);
        setError(null);
      },
      (err) => {
        console.error("Room subscription error:", err);
        setError("实时连接遇到了一些问题，正在重试...");
      }
    );
    return () => unsubscribe();
  }, [initialRoom.room_code]);

  useEffect(() => {
    if (room.room_code === "SINGLE") return;
    roomManager.sendHeartbeat(room.room_code).catch(console.error);
    const interval = setInterval(() => {
      roomManager.sendHeartbeat(room.room_code).catch(console.error);
    }, 4000);
    return () => clearInterval(interval);
  }, [room.room_code]);

  const players = room.players;
  const state = room.game_state as MonopolyState;
  const isHost = role === "host";
  const isGuest = role === "guest";
  const isSpectator = role === "spectator";
  const myRole: PlayerRole | null = isHost ? "host" : isGuest ? "guest" : null;

  const hostOnline = isPlayerOnline(players.host);
  const guestOnline = room.room_code === "SINGLE" ? true : isPlayerOnline(players.guest);

  const myTurn = myRole !== null && state.currentTurn === myRole && !state.winner;
  const canRoll = myTurn && !state.pendingDecision && !rolling;
  const myPendingDecision =
    state.pendingDecision && myRole && state.pendingDecision.forPlayer === myRole ? state.pendingDecision : null;

  const handleRoll = async () => {
    if (!canRoll || !myRole) return;
    setRolling(true);
    setError(null);
    try {
      const nextState = rollDiceAndMove(state, myRole);
      const status = nextState.winner ? "finished" : "playing";
      await roomManager.updateGameState(room.room_code, nextState, status);
      if (room.room_code === "SINGLE") setRoom((r) => ({ ...r, game_state: nextState, status }));
    } catch (err: any) {
      setError(err.message || "掷骰子失败");
    } finally {
      setRolling(false);
    }
  };

  const handleBuyDecision = async (choice: "buy" | "skip") => {
    if (!myRole) return;
    setError(null);
    try {
      const nextState = resolveBuyDecision(state, myRole, choice);
      const status = nextState.winner ? "finished" : "playing";
      await roomManager.updateGameState(room.room_code, nextState, status);
      if (room.room_code === "SINGLE") setRoom((r) => ({ ...r, game_state: nextState, status }));
    } catch (err: any) {
      setError(err.message || "操作失败");
    }
  };

  const renderPlayerCard = (r: PlayerRole, player: Player | null, online: boolean) => {
    const eco = state.economy[r];
    return (
      <div
        className={`flex-1 bg-white border ${
          state.currentTurn === r && !state.winner ? "border-indigo-400 shadow-md" : "border-slate-200"
        } rounded-2xl p-4 flex flex-col gap-2`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${ROLE_COLOR[r]}`} />
            <span className="text-sm font-bold text-slate-800">{player?.name || ROLE_LABEL[r]}</span>
          </div>
          {online ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-red-400" />}
        </div>
        <div className="flex items-center gap-1.5 text-amber-600 font-bold text-sm">
          <Coins size={14} />
          {eco.cash} 元
        </div>
        <div className="text-xs text-slate-500">
          位置：{BOARD[eco.position]?.name} · 持有地产 {eco.ownedTiles.length} 块
        </div>
        {eco.bankrupt && <div className="text-xs text-red-500 font-bold">已破产</div>}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 bg-white border border-slate-200 p-4 md:p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={onLeave}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-xl transition duration-200 border border-slate-200 shadow-sm text-xs font-semibold"
            title="返回大厅"
          >
            <ArrowLeft size={18} />
            <span className="hidden sm:inline">退出房间</span>
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-800">简化版大富翁</h2>
            <p className="text-xs text-slate-500">房间号：{room.room_code}</p>
          </div>
        </div>

        {!state.winner ? (
          <button
            onClick={handleRoll}
            disabled={!canRoll}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-sm transition"
          >
            <Dice5 size={20} />
            {myTurn ? (state.pendingDecision ? "请先完成上一步决定" : "掷骰子") : "等待对方操作..."}
            {state.lastDiceRoll !== null && (
              <span className="ml-1 bg-white/20 px-2 py-0.5 rounded-lg text-sm">上次: {state.lastDiceRoll}</span>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-2 text-indigo-600 font-bold">
            <Trophy size={20} />
            {state.winner === "draw" ? "平局！" : `${ROLE_LABEL[state.winner]} 获胜！`}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-100 text-red-600 text-xs px-3 py-2 rounded-xl">{error}</div>
      )}

      {/* Player status cards */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {renderPlayerCard("host", players.host, hostOnline)}
        {renderPlayerCard("guest", players.guest, guestOnline)}
      </div>

      {/* Event log line */}
      {state.lastEvent && (
        <div className="mb-6 bg-slate-100 border border-slate-200 text-slate-600 text-sm px-4 py-3 rounded-xl">
          {state.lastEvent}
        </div>
      )}

      {/* Board — v1: wrapped tile track, not a fancy circular layout yet */}
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-6">
        {BOARD.map((tile) => {
          const owner = state.ownership[tile.index];
          const hostHere = state.economy.host.position === tile.index;
          const guestHere = state.economy.guest.position === tile.index;
          return (
            <div
              key={tile.index}
              className={`relative border rounded-xl p-2 text-[10px] flex flex-col justify-between min-h-[68px] ${
                owner ? (owner === "host" ? "bg-indigo-50 border-indigo-200" : "bg-amber-50 border-amber-200") : "bg-white border-slate-200"
              }`}
            >
              <span className="font-semibold text-slate-700 leading-tight">{tile.name}</span>
              {tile.price && <span className="text-slate-400">${tile.price}</span>}
              <div className="absolute bottom-1 right-1 flex gap-0.5">
                {hostHere && <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 border border-white" />}
                {guestHere && <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-white" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Buy/skip decision modal */}
      {myPendingDecision && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-slate-800 mb-2">
              是否购买「{BOARD[myPendingDecision.tileIndex].name}」？
            </h3>
            <p className="text-sm text-slate-500 mb-5">
              价格 {BOARD[myPendingDecision.tileIndex].price} 元，租金 {BOARD[myPendingDecision.tileIndex].rent} 元
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleBuyDecision("skip")}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition"
              >
                不购买
              </button>
              <button
                onClick={() => handleBuyDecision("buy")}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition"
              >
                购买
              </button>
            </div>
          </div>
        </div>
      )}

      {isSpectator && (
        <p className="text-center text-xs text-slate-400 mt-4">你正在以观战身份查看这局游戏</p>
      )}
    </div>
  );
}
