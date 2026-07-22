import React, { useState, useEffect, Suspense, lazy } from "react";
import { Room, Player } from "../../types.js";
import { roomManager, getOrCreatePlayer, isPlayerOnline } from "../../lib/roomManager.js";
import {
  TRACK_LENGTH,
  HOME_STRETCH_LENGTH,
  TOTAL_PATH_LENGTH,
  ROLE_COLORS,
  COLOR_LABEL,
  COLOR_SHADES,
  PieceColor,
} from "./board.js";
import {
  FlightChessState,
  PlayerRole,
  rollDiceForFlightChess,
  choosePieceForFlightChess,
  pieceLabel,
} from "./logic.js";
import { ArrowLeft, Wifi, WifiOff, Trophy } from "lucide-react";
import { useTurnReminder } from "../shared/useTurnReminder.js";
import TurnReminderToggle from "../shared/TurnReminderToggle.js";
import Dice, { rollWithAnimation } from "../shared/Dice.js";
import Token from "../shared/Token.js";

// 懒加载3D棋盘，原因和写法跟 monopoly/MonopolyGame.tsx 里一致：three.js +
// @react-three/fiber + @react-three/drei 加起来有小几百KB，不用 React.lazy
// 的话这些代码会被打进主bundle，首页、五子棋、翻牌配对这些完全不需要3D的
// 页面也要背上这个体积。用 lazy() 之后 Vite 单独分包，只有真正点进飞行棋
// 这一局时才会去下载。
const Board3D = lazy(() => import("./Board3D.js"));

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

  // AI turn (single-player mode only) — same fix as Monopoly: without this,
  // the "guest" bot never acts and the game just sits there after your turn.
  useEffect(() => {
    if (room.room_code !== "SINGLE") return;
    if (state.winner) return;
    if (state.currentTurn !== "guest") return;

    let cancelled = false;
    const thinkDelay = setTimeout(async () => {
      if (cancelled) return;

      if (state.pendingDecision && state.pendingDecision.forPlayer === "guest") {
        // Simple AI heuristic: just move the first legal piece.
        const choice = state.pendingDecision.options[0];
        const nextState = choosePieceForFlightChess(state, "guest", choice);
        if (!cancelled) setRoom((r) => ({ ...r, game_state: nextState, status: nextState.winner ? "finished" : "playing" }));
        return;
      }

      setRolling(true);
      await rollWithAnimation();
      if (cancelled) return;
      const nextState = rollDiceForFlightChess(state, "guest");
      setRoom((r) => ({ ...r, game_state: nextState, status: nextState.winner ? "finished" : "playing" }));
      setRolling(false);
    }, 700);

    return () => {
      cancelled = true;
      clearTimeout(thinkDelay);
    };
  }, [room.room_code, state]);

  const isHost = role === "host";
  const isGuest = role === "guest";
  const isSpectator = role === "spectator";
  const myRole: PlayerRole | null = isHost ? "host" : isGuest ? "guest" : null;

  const hostOnline = isPlayerOnline(players.host);
  const guestOnline = room.room_code === "SINGLE" ? true : isPlayerOnline(players.guest);

  const myTurn = myRole !== null && state.currentTurn === myRole && !state.winner;
  const { permission: reminderPermission, requestPermission: requestReminderPermission } = useTurnReminder(
    myTurn,
    "飞行棋"
  );
  const canRoll = myTurn && !state.pendingDecision && !rolling;
  const myPendingDecision =
    state.pendingDecision && myRole && state.pendingDecision.forPlayer === myRole ? state.pendingDecision : null;

  const syncState = async (nextState: FlightChessState) => {
    const status = nextState.winner ? "finished" : "playing";
    if (room.room_code === "SINGLE") {
      setRoom((r) => ({ ...r, game_state: nextState, status }));
      return;
    }
    await roomManager.updateGameState(room.room_code, nextState, status);
  };

  const handleRoll = async () => {
    if (!canRoll || !myRole) return;
    setRolling(true);
    setError(null);
    try {
      await rollWithAnimation();
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
          state.currentTurn === r && !state.winner ? "border-indigo-400 shadow-md" : "border-slate-200 raised-card"
        } rounded-2xl p-4 flex flex-col gap-2`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${ROLE_DOT[r]}`} />
            <span className="text-sm font-bold text-slate-800">{player?.name || ROLE_LABEL[r]}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {ROLE_COLORS[r].map((c) => (
                <span
                  key={c}
                  className="w-2.5 h-2.5 rounded-full border border-white shadow-sm"
                  style={{ backgroundColor: COLOR_SHADES[c].mid }}
                  title={`${COLOR_LABEL[c]}方`}
                />
              ))}
            </div>
            {online ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-red-400" />}
          </div>
        </div>
        <div className="text-xs text-slate-500">
          营地 {inBase} · 跑道上 {onPath} · 到家 {home} / {pieces.length}
        </div>
      </div>
    );
  };

  // A single color's home-stretch strip + camp summary — used twice per player card.
  const renderColorLane = (r: PlayerRole, color: PieceColor) => {
    const pieces = state.pieces[r];
    const inBase = pieces
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.color === color && p.step === -1);
    return (
      <div key={color} className="flex-1 min-w-[140px]">
        <p className="text-xs font-bold mb-1.5 flex items-center gap-1.5" style={{ color: COLOR_SHADES[color].dark }}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLOR_SHADES[color].mid }} />
          {COLOR_LABEL[color]}色
        </p>
        <div className="flex gap-1 mb-2">
          {Array.from({ length: HOME_STRETCH_LENGTH }, (_, i) => {
            const stepValue = TRACK_LENGTH + i;
            const found = pieces
              .map((p, idx) => ({ p, idx }))
              .find(({ p }) => p.color === color && p.step === stepValue);
            return (
              <div
                key={i}
                className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center"
                style={{
                  boxShadow:
                    "0 1.5px 2px rgba(15,23,42,0.12), inset 0 1px 0 0 rgba(255,255,255,0.75), inset 0 -1.5px 1px 0 rgba(15,23,42,0.1)",
                }}
              >
                {found && <Token role={r} shades={COLOR_SHADES[color]} label={(found.idx % 4) + 1} size={14} />}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500">
          营地：{inBase.length > 0 ? inBase.map(({ i }) => (i % 4) + 1).join("、") : "空"}
        </p>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:py-10">
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
            <h2 className="text-lg font-bold text-slate-800">飞行棋（四色版）</h2>
            <p className="text-xs text-slate-500">
              房间号：{room.room_code} · 房主控制红/绿，访客控制蓝/黄 · 掷 1或6 起飞 · 掷 6 再来一次（连续3次作废）
            </p>
            {room.room_code !== "SINGLE" && (
              <div className="mt-2">
                <TurnReminderToggle permission={reminderPermission} onRequest={requestReminderPermission} />
              </div>
            )}
          </div>
        </div>

        {!state.winner ? (
          <button
            onClick={handleRoll}
            disabled={!canRoll}
            className="flex items-center gap-3 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-sm transition"
          >
            <Dice value={state.lastDiceRoll} rolling={rolling} size={32} />
            {myTurn ? (state.pendingDecision ? "请先选择棋子" : rolling ? "骰子转动中..." : "掷骰子") : "等待对方操作..."}
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

      {/* Board — 3D 场景，纯展示层，逻辑仍然是 logic.ts 里那一套，Board3D 只是
          把 state 画出来。懒加载，见文件顶部 lazy() 的注释。加载占位保持和
          Board3D 内部容器同样的尺寸（aspect-square max-w-2xl），避免代码
          下载完成后棋盘"跳出来"引起页面布局跳动。 */}
      <Suspense
        fallback={
          <div className="relative w-full aspect-square max-w-2xl mx-auto mb-6 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
            <span className="text-xs text-slate-400">3D 棋盘加载中...</span>
          </div>
        }
      >
        <Board3D state={state} rolling={rolling} />
      </Suspense>

      {/* Per-player home stretches + camps — each player card now splits into
          their two colors side by side. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {(["host", "guest"] as PlayerRole[]).map((r) => (
          <div key={r} className={`border rounded-2xl p-3 ${ROLE_BG[r]}`}>
            <p className="text-xs font-bold text-slate-600 mb-2">{ROLE_LABEL[r]} 的到家小路</p>
            <div className="flex gap-3 flex-wrap">
              {ROLE_COLORS[r].map((color) => renderColorLane(r, color))}
            </div>
          </div>
        ))}
      </div>

      {/* Choose-piece decision — buttons are tinted by each piece's actual color
          so it's immediately clear which one you're picking. */}
      {myPendingDecision && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-slate-800 mb-4">请选择要移动的棋子（本次骰子：{state.lastDiceRoll}）</h3>
            <div className="grid grid-cols-2 gap-3">
              {myPendingDecision.options.map((idx) => {
                const piece = myRole ? state.pieces[myRole][idx] : null;
                if (!piece) return null;
                const shade = COLOR_SHADES[piece.color];
                return (
                  <button
                    key={idx}
                    onClick={() => handleChoosePiece(idx)}
                    className="py-3 text-white text-sm font-bold rounded-xl transition hover:brightness-110"
                    style={{ backgroundColor: shade.mid }}
                  >
                    {pieceLabel(piece, idx)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {isSpectator && <p className="text-center text-xs text-slate-400 mt-4">你正在以观战身份查看这局游戏</p>}
    </div>
  );
}
