import React, { useState, useEffect } from "react";
import { Room, Player } from "../../types.js";
import { roomManager, getOrCreatePlayer, isPlayerOnline } from "../../lib/roomManager.js";
import {
  TRACK_LENGTH,
  HOME_STRETCH_LENGTH,
  TOTAL_PATH_LENGTH,
  START_INDEX,
  SAFE_CELLS,
} from "./board.js";
import { FlightChessState, PlayerRole, rollDiceForFlightChess, choosePieceForFlightChess } from "./logic.js";
import { ArrowLeft, Dice5, Wifi, WifiOff, Trophy, Star } from "lucide-react";

interface FlightChessGameProps {
  room: Room;
  role: "host" | "guest" | "spectator";
  onLeave: () => void;
}

const ROLE_LABEL: Record<PlayerRole, string> = { host: "房主", guest: "访客" };
const ROLE_DOT: Record<PlayerRole, string> = { host: "bg-indigo-500", guest: "bg-amber-500" };
const ROLE_BG: Record<PlayerRole, string> = { host: "bg-indigo-50 border-indigo-200", guest: "bg-amber-50 border-amber-200" };

export default function FlightChessGame({ room: initialRoom, role, onLeave }: FlightChessGameProps) {
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
  const state = room.game_state as FlightChessState;
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

  const syncState = async (nextState: FlightChessState) => {
    const status = nextState.winner ? "finished" : "playing";
    await roomManager.updateGameState(room.room_code, nextState, status);
    if (room.room_code === "SINGLE") setRoom((r) => ({ ...r, game_state: nextState, status }));
  };

  const handleRoll = async () => {
    if (!canRoll || !myRole) return;
    setRolling(true);
    setError(null);
    try {
      await syncState(rollDiceForFlightChess(state, myRole));
    } catch (err: any) {
      setError(err.message || "掷骰子失败");
    } finally {
      setRolling(false);
    }
  };

  const handleChoosePiece = async (pieceIndex: number) => {
    if (!myRole) return;
    setError(null);
    try {
      await syncState(choosePieceForFlightChess(state, myRole, pieceIndex));
    } catch (err: any) {
      setError(err.message || "操作失败");
    }
  };

  const renderPlayerCard = (r: PlayerRole, player: Player | null, online: boolean) => {
    const pieces = state.pieces[r];
    const inBase = pieces.filter((p) => p.step === -1).length;
    const home = pieces.filter((p) => p.step === TOTAL_PATH_LENGTH - 1).length;
    const onPath = pieces.length - inBase - home;
    return (
      <div
        className={`flex-1 bg-white border ${
          state.currentTurn === r && !state.winner ? "border-indigo-400 shadow-md" : "border-slate-200"
        } rounded-2xl p-4 flex flex-col gap-2`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${ROLE_DOT[r]}`} />
            <span className="text-sm font-bold text-slate-800">{player?.name || ROLE_LABEL[r]}</span>
          </div>
          {online ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-red-400" />}
        </div>
        <div className="text-xs text-slate-500">
          营地 {inBase} · 跑道上 {onPath} · 到家 {home} / 4
        </div>
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
            <h2 className="text-lg font-bold text-slate-800">飞行棋（双色简化版）</h2>
            <p className="text-xs text-slate-500">房间号：{room.room_code} · 掷到 1 或 6 才能起飞</p>
          </div>
        </div>

        {!state.winner ? (
          <button
            onClick={handleRoll}
            disabled={!canRoll}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-sm transition"
          >
            <Dice5 size={20} />
            {myTurn ? (state.pendingDecision ? "请先选择棋子" : "掷骰子") : "等待对方操作..."}
            {state.lastDiceRoll !== null && (
              <span className="ml-1 bg-white/20 px-2 py-0.5 rounded-lg text-sm">上次: {state.lastDiceRoll}</span>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-2 text-indigo-600 font-bold">
            <Trophy size={20} />
            {ROLE_LABEL[state.winner]} 获胜！
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-100 text-red-600 text-xs px-3 py-2 rounded-xl">{error}</div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {renderPlayerCard("host", players.host, hostOnline)}
        {renderPlayerCard("guest", players.guest, guestOnline)}
      </div>

      {state.lastEvent && (
        <div className="mb-6 bg-slate-100 border border-slate-200 text-slate-600 text-sm px-4 py-3 rounded-xl">
          {state.lastEvent}
        </div>
      )}

      {/* Shared track — v1: wrapped grid, not a literal cross-shaped board yet */}
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">共享跑道</h3>
        <div className="grid grid-cols-8 sm:grid-cols-12 gap-1.5">
          {Array.from({ length: TRACK_LENGTH }, (_, cell) => {
            const isSafe = SAFE_CELLS.includes(cell);
            const isHostStart = cell === START_INDEX.host;
            const isGuestStart = cell === START_INDEX.guest;
            const hostPiecesHere = state.pieces.host
              .map((p, i) => ({ p, i }))
              .filter(({ p }) => p.step >= 0 && p.step < TRACK_LENGTH && (START_INDEX.host + p.step) % TRACK_LENGTH === cell);
            const guestPiecesHere = state.pieces.guest
              .map((p, i) => ({ p, i }))
              .filter(({ p }) => p.step >= 0 && p.step < TRACK_LENGTH && (START_INDEX.guest + p.step) % TRACK_LENGTH === cell);
            return (
              <div
                key={cell}
                className={`relative aspect-square rounded-lg border flex items-center justify-center text-[9px] ${
                  isSafe ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"
                }`}
                title={isHostStart ? "房主起飞格（安全）" : isGuestStart ? "访客起飞格（安全）" : undefined}
              >
                {isSafe && <Star size={10} className="absolute top-0.5 left-0.5 text-emerald-400" />}
                <div className="flex flex-wrap gap-0.5 items-center justify-center">
                  {hostPiecesHere.map(({ i }) => (
                    <span key={`h${i}`} className="w-2.5 h-2.5 rounded-full bg-indigo-500 border border-white" title={`房主 ${i + 1}号`} />
                  ))}
                  {guestPiecesHere.map(({ i }) => (
                    <span key={`g${i}`} className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-white" title={`访客 ${i + 1}号`} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-player home stretch + base */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {(["host", "guest"] as PlayerRole[]).map((r) => (
          <div key={r} className={`border rounded-2xl p-3 ${ROLE_BG[r]}`}>
            <p className="text-xs font-bold text-slate-600 mb-2">{ROLE_LABEL[r]} 的到家小路</p>
            <div className="flex gap-1.5 mb-3">
              {Array.from({ length: HOME_STRETCH_LENGTH }, (_, i) => {
                const stepValue = TRACK_LENGTH + i;
                const pieceHere = state.pieces[r].findIndex((p) => p.step === stepValue);
                return (
                  <div
                    key={i}
                    className="w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center text-[9px]"
                  >
                    {pieceHere >= 0 && <span className={`w-3 h-3 rounded-full ${ROLE_DOT[r]}`} title={`${pieceHere + 1}号`} />}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">
              营地：
              {state.pieces[r]
                .map((p, i) => (p.step === -1 ? i + 1 : null))
                .filter((v) => v !== null)
                .join("、") || "空"}
            </p>
          </div>
        ))}
      </div>

      {/* Choose-piece decision */}
      {myPendingDecision && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-slate-800 mb-4">请选择要移动的棋子（本次骰子：{state.lastDiceRoll}）</h3>
            <div className="grid grid-cols-2 gap-3">
              {myPendingDecision.options.map((idx) => (
                <button
                  key={idx}
                  onClick={() => handleChoosePiece(idx)}
                  className="py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition"
                >
                  {idx + 1} 号棋子
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isSpectator && <p className="text-center text-xs text-slate-400 mt-4">你正在以观战身份查看这局游戏</p>}
    </div>
  );
}
