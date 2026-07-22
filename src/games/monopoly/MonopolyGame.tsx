import React, { useState, useEffect, Suspense, lazy } from "react";
import { Room, Player } from "../../types.js";
import { roomManager, getOrCreatePlayer, isPlayerOnline } from "../../lib/roomManager.js";
import { BOARD, COLOR_GROUPS } from "./board.js";
import { MonopolyState, PlayerRole, rollDiceAndMove, resolveBuyDecision, sellPropertyToCoverDebt } from "./logic.js";
import { ArrowLeft, Wifi, WifiOff, Trophy, Coins } from "lucide-react";
import Dice, { rollWithAnimation } from "../shared/Dice.js";
import { useTurnReminder } from "../shared/useTurnReminder.js";
import TurnReminderToggle from "../shared/TurnReminderToggle.js";

// 懒加载3D棋盘：three.js + @react-three/fiber + @react-three/drei 加起来
// 有小几百KB，如果直接 import，这些代码会被打进主bundle——意味着首页、
// 五子棋、翻牌配对这些完全不需要3D的页面也要背上这个体积，手机上尤其伤。
// 用 React.lazy 之后，这部分代码会被 Vite 单独分包，只有真正点进大富翁
// 这一局时才会去下载，其他游戏和首页完全不受影响。
const Board3D = lazy(() => import("./Board3D.js"));

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

  const state = room.game_state as MonopolyState;
  const players = room.players;

  // AI turn (single-player mode only). The "guest" side is a bot with no
  // real user clicking anything, so without this effect the game just sits
  // there forever after the human's turn ends — this was the reported bug.
  useEffect(() => {
    if (room.room_code !== "SINGLE") return;
    if (state.winner) return;
    if (state.currentTurn !== "guest") return;

    let cancelled = false;
    const thinkDelay = setTimeout(async () => {
      if (cancelled) return;

      if (state.pendingDecision && state.pendingDecision.forPlayer === "guest") {
        if (state.pendingDecision.type === "buy_or_skip") {
          // Simple AI heuristic: buy if it can afford it, otherwise skip.
          const tile = BOARD[state.pendingDecision.tileIndex];
          const canAfford = tile.price !== undefined && state.economy.guest.cash >= tile.price;
          const nextState = resolveBuyDecision(state, "guest", canAfford ? "buy" : "skip");
          if (!cancelled) setRoom((r) => ({ ...r, game_state: nextState, status: nextState.winner ? "finished" : "playing" }));
          return;
        }
        // must_sell：卖掉持有地产里最便宜的一块，够用就行，尽量少亏
        const owned = state.economy.guest.ownedTiles
          .map((idx) => BOARD[idx])
          .sort((a, b) => (a.price || 0) - (b.price || 0));
        const cheapest = owned[0];
        const nextState = cheapest
          ? sellPropertyToCoverDebt(state, "guest", cheapest.index)
          : state;
        if (!cancelled) setRoom((r) => ({ ...r, game_state: nextState, status: nextState.winner ? "finished" : "playing" }));
        return;
      }

      setRolling(true);
      await rollWithAnimation();
      if (cancelled) return;
      const nextState = rollDiceAndMove(state, "guest");
      setRoom((r) => ({ ...r, game_state: nextState, status: nextState.winner ? "finished" : "playing" }));
      setRolling(false);
    }, 700); // brief pause so the AI's turn doesn't feel instant/jarring

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
    "简化版大富翁"
  );
  const canRoll = myTurn && !state.pendingDecision && !rolling;
  const myPendingDecision =
    state.pendingDecision && myRole && state.pendingDecision.forPlayer === myRole ? state.pendingDecision : null;

  const handleRoll = async () => {
    if (!canRoll || !myRole) return;
    setRolling(true);
    setError(null);
    try {
      await rollWithAnimation();
      const nextState = rollDiceAndMove(state, myRole);
      const status = nextState.winner ? "finished" : "playing";
      if (room.room_code === "SINGLE") {
        setRoom((r) => ({ ...r, game_state: nextState, status }));
      } else {
        await roomManager.updateGameState(room.room_code, nextState, status);
      }
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
      if (room.room_code === "SINGLE") {
        setRoom((r) => ({ ...r, game_state: nextState, status }));
      } else {
        await roomManager.updateGameState(room.room_code, nextState, status);
      }
    } catch (err: any) {
      setError(err.message || "操作失败");
    }
  };

  const handleSellDecision = async (tileIndex: number) => {
    if (!myRole) return;
    setError(null);
    try {
      const nextState = sellPropertyToCoverDebt(state, myRole, tileIndex);
      const status = nextState.winner ? "finished" : "playing";
      if (room.room_code === "SINGLE") {
        setRoom((r) => ({ ...r, game_state: nextState, status }));
      } else {
        await roomManager.updateGameState(room.room_code, nextState, status);
      }
    } catch (err: any) {
      setError(err.message || "操作失败");
    }
  };

  const renderPlayerCard = (r: PlayerRole, player: Player | null, online: boolean) => {
    const eco = state.economy[r];
    return (
      <div
        className={`flex-1 bg-white border ${
          state.currentTurn === r && !state.winner ? "border-indigo-400 shadow-md" : "border-slate-200 raised-card"
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
            <h2 className="text-lg font-bold text-slate-800">简化版大富翁</h2>
            <p className="text-xs text-slate-500">
              房间号：{room.room_code} · 双数可再掷一次（连续3次送进监狱）· 集齐同色地产租金翻倍
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
            <div className="flex items-center gap-1.5">
              <Dice value={state.lastDice ? state.lastDice[0] : null} rolling={rolling} size={26} />
              <Dice value={state.lastDice ? state.lastDice[1] : null} rolling={rolling} size={26} />
            </div>
            {myTurn ? (state.pendingDecision ? "请先完成上一步决定" : rolling ? "骰子转动中..." : "掷骰子") : "等待对方操作..."}
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

      {/* Event feed — 之前2D棋盘时这段文字是放在棋盘中间空心区域里的，3D棋盘
          没有对应的"空心中心"能塞文字进去（塞了也会被摄像机角度挡住/太小看不清），
          所以单独拎出来放棋盘上方，不能删，否则买地/交租金/抽机会卡这些关键
          反馈就没地方显示了。 */}
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

      {/* Color-group legend — explains each color group even from the 3D camera angle */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mb-6 max-w-2xl mx-auto">
        {Object.entries(COLOR_GROUPS).map(([key, group]) => (
          <div key={key} className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className={`w-2.5 h-2.5 rounded-sm ${group.bar}`} />
            {group.label}
          </div>
        ))}
      </div>

      {/* Buy/skip decision modal */}
      {myPendingDecision && myPendingDecision.type === "buy_or_skip" && (
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

      {/* Must-sell decision modal — cash went negative, forced to sell owned
          properties (at 50% of purchase price) until solvent again. */}
      {myPendingDecision && myPendingDecision.type === "must_sell" && myRole && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-red-600 mb-1">现金不足，必须卖地补齐差额</h3>
            <p className="text-sm text-slate-500 mb-4">
              当前现金 {state.economy[myRole].cash} 元。选一块地产卖给银行（按购买价的一半回收），卖到现金不再是负数为止。
            </p>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {state.economy[myRole].ownedTiles.map((idx) => {
                const tile = BOARD[idx];
                return (
                  <button
                    key={idx}
                    onClick={() => handleSellDecision(idx)}
                    className="flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-300 rounded-xl transition text-left"
                  >
                    <span className="text-sm font-semibold text-slate-700">{tile.name}</span>
                    <span className="text-xs text-rose-500 font-bold">
                      卖 {Math.round((tile.price || 0) * 0.5)} 元
                    </span>
                  </button>
                );
              })}
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
