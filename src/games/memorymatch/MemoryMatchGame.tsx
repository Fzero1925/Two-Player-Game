import React, { useState, useEffect } from "react";
import { Room, Player } from "../../types.js";
import { roomManager, isPlayerOnline } from "../../lib/roomManager.js";
import { GRID_SIZE, MISMATCH_REVEAL_MS, AI_THINK_MS } from "./board.js";
import { MemoryMatchState, PlayerRole, flipCard, resolveMismatch } from "./logic.js";
import { ArrowLeft, Wifi, WifiOff, Trophy, Sparkles, Check } from "lucide-react";
import { useTurnReminder } from "../shared/useTurnReminder.js";
import TurnReminderToggle from "../shared/TurnReminderToggle.js";

interface MemoryMatchGameProps {
  room: Room;
  role: "host" | "guest" | "spectator";
  onLeave: () => void;
}

const ROLE_LABEL: Record<PlayerRole, string> = { host: "房主", guest: "访客" };
const ROLE_DOT: Record<PlayerRole, string> = { host: "bg-indigo-500", guest: "bg-amber-500" };
const MATCHED_STYLE: Record<PlayerRole, string> = {
  host: "bg-indigo-50 border-indigo-300 text-indigo-400",
  guest: "bg-amber-50 border-amber-300 text-amber-400",
};

export default function MemoryMatchGame({ room: initialRoom, role, onLeave }: MemoryMatchGameProps) {
  const [room, setRoom] = useState<Room>(initialRoom);
  const [error, setError] = useState<string | null>(null);

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
  const state = room.game_state as MemoryMatchState;

  const isHost = role === "host";
  const isGuest = role === "guest";
  const isSpectator = role === "spectator";
  const myRole: PlayerRole | null = isHost ? "host" : isGuest ? "guest" : null;

  const hostOnline = isPlayerOnline(players.host);
  const guestOnline = room.room_code === "SINGLE" ? true : isPlayerOnline(players.guest);

  const syncState = async (nextState: MemoryMatchState) => {
    const status = nextState.winner ? "finished" : "playing";
    if (room.room_code === "SINGLE") {
      setRoom((r) => ({ ...r, game_state: nextState, status }));
      return;
    }
    await roomManager.updateGameState(room.room_code, nextState, status);
  };

  // 配对失败之后，"当前回合玩家"的客户端负责在展示一小段时间后把牌盖回去、换人。
  // 跟大富翁/飞行棋里"由行动方的客户端触发后续结算"是同一个模式，避免双方客户端
  // 抢着调用导致状态被推进两次。
  useEffect(() => {
    if (!state.pendingFlipBack || state.winner) return;
    if (!myRole || state.currentTurn !== myRole) return;
    const timer = setTimeout(() => {
      syncState(resolveMismatch(state, myRole));
    }, MISMATCH_REVEAL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pendingFlipBack, state.revealed.join(","), myRole]);

  // 单人模式下的"AI对手"：guest 是机器人。这一版 AI 没有记忆（不会刻意记住
  // 之前翻开过的牌），每次都是在未配对、未翻开的牌里随机选——足够好玩，
  // 想要更强的 AI 可以后续加一个"记住最近翻过的牌"的启发式。
  useEffect(() => {
    if (room.room_code !== "SINGLE") return;
    if (state.winner) return;
    if (state.currentTurn !== "guest") return;
    if (state.pendingFlipBack) return; // 上面那个 effect 会负责盖牌换人
    if (state.revealed.length >= 2) return;

    const timer = setTimeout(() => {
      const available = state.cards
        .map((c, idx) => ({ c, idx }))
        .filter(({ c, idx }) => c.matchedBy === null && !state.revealed.includes(idx));
      if (available.length === 0) return;
      const pick = available[Math.floor(Math.random() * available.length)].idx;
      syncState(flipCard(state, "guest", pick));
    }, AI_THINK_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.room_code, state]);

  const myTurn = myRole !== null && state.currentTurn === myRole && !state.winner;
  const { permission: reminderPermission, requestPermission: requestReminderPermission } = useTurnReminder(
    myTurn,
    "翻牌配对"
  );

  const handleFlip = async (index: number) => {
    if (!myRole || !myTurn || state.pendingFlipBack) return;
    setError(null);
    try {
      await syncState(flipCard(state, myRole, index));
    } catch (err: any) {
      setError(err.message || "翻牌失败");
    }
  };

  const renderPlayerCard = (r: PlayerRole, player: Player | null, online: boolean) => (
    <div
      className={`flex-1 bg-white border ${
        state.currentTurn === r && !state.winner ? "border-indigo-400 shadow-md" : "border-slate-200 raised-card"
      } rounded-2xl p-4 flex items-center justify-between gap-2`}
    >
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${ROLE_DOT[r]}`} />
        <span className="text-sm font-bold text-slate-800">{player?.name || ROLE_LABEL[r]}</span>
        {online ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-red-400" />}
      </div>
      <div className="text-lg font-display font-bold text-slate-700">{state.scores[r]}</div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 bg-white border border-slate-200 p-4 md:p-6 rounded-2xl raised-card">
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
            <h2 className="text-lg font-display font-semibold text-slate-800">翻牌配对</h2>
            <p className="text-xs text-slate-500">
              房间号：{room.room_code} · 每回合翻两张，配对成功可以再翻一次，配对数多的获胜
            </p>
            {room.room_code !== "SINGLE" && (
              <div className="mt-2">
                <TurnReminderToggle permission={reminderPermission} onRequest={requestReminderPermission} />
              </div>
            )}
          </div>
        </div>

        {state.winner ? (
          <div className="flex items-center gap-2 text-indigo-600 font-bold">
            <Trophy size={20} />
            {state.winner === "draw" ? "平局！" : `${ROLE_LABEL[state.winner]} 获胜！`}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Sparkles size={16} className={myTurn ? "text-indigo-500" : "text-slate-300"} />
            {myTurn ? "轮到你翻牌" : "等待对方操作..."}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-100 text-red-600 text-xs px-3 py-2 rounded-xl">{error}</div>
      )}

      <div className="flex gap-4 mb-6">
        {renderPlayerCard("host", players.host, hostOnline)}
        {renderPlayerCard("guest", players.guest, guestOnline)}
      </div>

      {state.lastEvent && (
        <div className="mb-6 bg-slate-100 border border-slate-200 text-slate-600 text-sm px-4 py-3 rounded-xl">
          {state.lastEvent}
        </div>
      )}

      {/* Card grid */}
      <div
        className="grid gap-2.5 sm:gap-3 max-w-md mx-auto"
        style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}
      >
        {state.cards.map((card, index) => {
          const isRevealed = state.revealed.includes(index);
          const isMatched = card.matchedBy !== null;
          const faceUp = isRevealed || isMatched;
          const clickable = myTurn && !isMatched && !isRevealed && !state.pendingFlipBack;

          return (
            <button
              key={index}
              onClick={() => handleFlip(index)}
              disabled={!clickable}
              className={`relative aspect-square rounded-xl border flex items-center justify-center text-2xl sm:text-3xl transition-all duration-200 ${
                isMatched
                  ? `${MATCHED_STYLE[card.matchedBy as PlayerRole]} cursor-default`
                  : faceUp
                  ? "bg-white border-indigo-300 shadow-md scale-[1.03]"
                  : clickable
                  ? "cursor-pointer hover:scale-[1.04] active:scale-95"
                  : "cursor-default opacity-90"
              }`}
              style={
                !faceUp
                  ? {
                      // 卡背：跟骰子/棋盘格子同一套渐变+厚度边的立体语言，
                      // 而不是随便一个纯色方块。
                      background: "linear-gradient(135deg, #818cf8 0%, #6366f1 55%, #4338ca 100%)",
                      boxShadow:
                        "0 3px 5px rgba(67,56,202,0.35), inset 0 1.5px 0 0 rgba(255,255,255,0.35), inset 0 -3px 4px 0 rgba(49,46,129,0.4)",
                    }
                  : undefined
              }
            >
              {isMatched ? (
                <>
                  <span className="opacity-40">{card.symbol}</span>
                  <Check size={14} className="absolute top-1 right-1" />
                </>
              ) : faceUp ? (
                card.symbol
              ) : (
                <span className="text-white/70 text-lg font-display">?</span>
              )}
            </button>
          );
        })}
      </div>

      {isSpectator && <p className="text-center text-xs text-slate-400 mt-4">你正在以观战身份查看这局游戏</p>}
    </div>
  );
}
