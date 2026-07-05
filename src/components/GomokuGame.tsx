import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Room, GomokuState, Player } from "../types.js";
import { roomManager, getOrCreatePlayer, isPlayerOnline } from "../lib/roomManager.js";
import { Play, RotateCcw, ShieldAlert, Wifi, WifiOff, Users, ArrowLeft, Trophy } from "lucide-react";

interface GomokuGameProps {
  room: Room;
  role: "host" | "guest" | "spectator";
  onLeave: () => void;
}

export default function GomokuGame({ room: initialRoom, role, onLeave }: GomokuGameProps) {
  const [room, setRoom] = useState<Room>(initialRoom);
  const { id: playerId } = getOrCreatePlayer();
  const [error, setError] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ r: number; c: number } | null>(null);

  // Maintain local references and subscribe to changes
  useEffect(() => {
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

    return () => {
      unsubscribe();
    };
  }, [initialRoom.room_code]);

  // Periodic Heartbeat check (every 4 seconds) to announce presence
  useEffect(() => {
    roomManager.sendHeartbeat(room.room_code).catch(console.error);

    const interval = setInterval(() => {
      roomManager.sendHeartbeat(room.room_code).catch(console.error);
    }, 4000);

    return () => clearInterval(interval);
  }, [room.room_code]);

  const players = room.players;
  const gameState = room.game_state as GomokuState;

  const isHost = role === "host";
  const isGuest = role === "guest";
  const isSpectator = role === "spectator";

  const hostOnline = isPlayerOnline(players.host);
  const guestOnline = isPlayerOnline(players.guest);

  // Check if either partner is offline
  const opponentOffline =
    room.status === "playing" &&
    ((isHost && !guestOnline) || (isGuest && !hostOnline));

  // Determine current turn name
  const isMyTurn =
    room.status === "playing" &&
    ((gameState?.current_turn === "host" && isHost) ||
      (gameState?.current_turn === "guest" && isGuest));

  /**
   * Win detection from coordinate (r, c)
   */
  function checkWin(board: number[][], r: number, c: number, color: number): boolean {
    const directions = [
      [0, 1],   // horizontal
      [1, 0],   // vertical
      [1, 1],   // diagonal
      [1, -1],  // anti-diagonal
    ];

    for (const [dr, dc] of directions) {
      let count = 1;

      // Positive check
      let currR = r + dr;
      let currC = c + dc;
      while (currR >= 0 && currR < 15 && currC >= 0 && currC < 15 && board[currR][currC] === color) {
        count++;
        currR += dr;
        currC += dc;
      }

      // Negative check
      currR = r - dr;
      currC = c - dc;
      while (currR >= 0 && currR < 15 && currC >= 0 && currC < 15 && board[currR][currC] === color) {
        count++;
        currR -= dr;
        currC -= dc;
      }

      if (count >= 5) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if the grid is completely full (for draw condition)
   */
  function checkDraw(board: number[][]): boolean {
    return board.every((row) => row.every((cell) => cell !== 0));
  }

  /**
   * Handle board cell click
   */
  const handleCellClick = async (r: number, c: number) => {
    if (!room || room.status !== "playing") return;
    if (!isMyTurn) return;
    if (!gameState) return;
    if (gameState.winner) return;

    const board = gameState.board;
    if (board[r][c] !== 0) return;

    // Place piece (1 for host/Black, 2 for guest/White)
    const color = isHost ? 1 : 2;
    const newBoard = board.map((row) => [...row]);
    newBoard[r][c] = color;

    setLastMove({ r, c });

    const hasWon = checkWin(newBoard, r, c, color);
    const isDraw = !hasWon && checkDraw(newBoard);

    const updatedGameState: GomokuState = {
      board: newBoard,
      current_turn: gameState.current_turn === "host" ? "guest" : "host",
      winner: hasWon ? (isHost ? "host" : "guest") : isDraw ? "draw" : null,
    };

    try {
      await roomManager.updateGameState(
        room.room_code,
        updatedGameState,
        hasWon || isDraw ? "finished" : undefined
      );
    } catch (err: any) {
      console.error(err);
      setError("状态同步失败，请重试");
    }
  };

  /**
   * Set ready / unready status
   */
  const toggleReady = async () => {
    const currentReady = isHost ? !!players.host?.ready : !!players.guest?.ready;
    try {
      await roomManager.updateReadyStatus(room.room_code, !currentReady);
    } catch (err: any) {
      setError(err.message || "设置准备状态失败");
    }
  };

  /**
   * Re-match setup
   */
  const restartGame = async () => {
    // Both need to set unready or we reset status to waiting
    try {
      // Host resets waiting to play again
      const resetState = {
        board: Array(15).fill(null).map(() => Array(15).fill(0)),
        current_turn: "host",
        winner: null,
      };

      // Reset both player's ready flags to false
      const updatedPlayers = { ...room.players };
      if (updatedPlayers.host) updatedPlayers.host.ready = false;
      if (updatedPlayers.guest) updatedPlayers.guest.ready = false;

      // Use local server reset API (we can also do via roomManager state update)
      await roomManager.updateGameState(room.room_code, resetState, "waiting");
      await roomManager.updateReadyStatus(room.room_code, false);
    } catch (err: any) {
      setError("重新开始失败");
    }
  };

  const myReady = isHost ? !!players.host?.ready : isGuest ? !!players.guest?.ready : false;
  const opponentReady = isHost ? !!players.guest?.ready : isGuest ? !!players.host?.ready : false;
  const opponentName = isHost
    ? players.guest?.name || "等待对手加入..."
    : players.host?.name || "未知房主";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:py-10" id="gomoku-root">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8 bg-white border border-slate-200 p-4 md:p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={onLeave}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-xl transition duration-200 border border-slate-200 shadow-sm"
            title="返回大厅"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-indigo-50 text-indigo-600 font-semibold text-xs rounded-full uppercase tracking-wider border border-indigo-100">
                五子棋 对战中
              </span>
              <span className="px-3 py-1 bg-slate-100 text-slate-500 font-mono text-xs rounded-full border border-slate-200">
                房号: {room.room_code}
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold font-sans text-slate-800 tracking-tight mt-1">
              联机对局
            </h2>
          </div>
        </div>

        {/* Status indicator bar */}
        <div className="flex items-center gap-4 text-sm font-medium">
          {isSpectator ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-500 rounded-lg">
              <Users size={16} className="text-indigo-500" />
              <span>观战模式</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg">
              <span className="font-sans text-slate-500 text-xs">我的身份:</span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${isHost ? "bg-slate-800 text-white" : "bg-slate-200 text-slate-800"}`}>
                {isHost ? "房主 (执黑)" : "客方 (执白)"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Disconnect warning bar */}
      <AnimatePresence>
        {opponentOffline && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 flex items-center gap-3 bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl shadow-sm"
          >
            <ShieldAlert className="text-red-500 shrink-0 animate-pulse" size={20} />
            <span className="text-sm">
              对方已断开连接！正在等待对方重新连接（超过 10 秒无心跳将自动保持状态）。
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error alert bar */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Primary Layout: Gameboard and HUD columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: GOMOKU棋盘 */}
        <div className="col-span-1 lg:col-span-8 flex flex-col items-center">
          
          {/* Main Board Container */}
          <div className="relative w-full aspect-square max-w-[min(100vw-32px,550px)] bg-amber-100 border border-amber-950/20 rounded-2xl shadow-lg overflow-hidden p-3 md:p-5">
            
            {/* Grid Line Visuals */}
            <div className="absolute inset-3 md:inset-5 grid grid-cols-14 grid-rows-14 pointer-events-none">
              {/* Lines rendering */}
              {Array(15).fill(null).map((_, r) => (
                <div
                  key={`hl-${r}`}
                  className="absolute left-0 right-0 border-t border-amber-950/15"
                  style={{ top: `${(r / 14) * 100}%` }}
                />
              ))}
              {Array(15).fill(null).map((_, c) => (
                <div
                  key={`vl-${c}`}
                  className="absolute top-0 bottom-0 border-l border-amber-950/15"
                  style={{ left: `${(c / 14) * 100}%` }}
                />
              ))}

              {/* Star points (standard Go / Gomoku positions on 15x15: (3,3), (3,11), (7,7), (11,3), (11,11)) */}
              {[[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]].map(([sr, sc]) => (
                <div
                  key={`star-${sr}-${sc}`}
                  className="absolute w-1.5 h-1.5 md:w-2 md:h-2 bg-amber-950/60 rounded-full -translate-x-1/2 -translate-y-1/2"
                  style={{
                    top: `${(sr / 14) * 100}%`,
                    left: `${(sc / 14) * 100}%`,
                  }}
                />
              ))}
            </div>

            {/* Clickable Intersections Container */}
            <div className="relative w-full h-full grid grid-cols-15 grid-rows-15">
              {Array(15).fill(null).map((_, r) =>
                Array(15).fill(null).map((_, c) => {
                  const piece = gameState?.board?.[r]?.[c] || 0;
                  const isLatest = lastMove?.r === r && lastMove?.c === c;

                  return (
                    <div
                      key={`int-${r}-${c}`}
                      className="relative flex items-center justify-center cursor-pointer select-none group"
                      onClick={() => handleCellClick(r, c)}
                    >
                      {/* Invisible hover overlay for tap guidance */}
                      {room.status === "playing" && isMyTurn && piece === 0 && (
                        <div className="absolute w-4/5 h-4/5 rounded-full bg-amber-950/10 scale-0 group-hover:scale-100 transition-transform duration-150" />
                      )}

                      {/* Render Piece with animation */}
                      {piece !== 0 && (
                        <motion.div
                          initial={{ scale: 0.1, y: -20, opacity: 0 }}
                          animate={{ scale: 1, y: 0, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 350, damping: 20 }}
                          className={`w-4/5 h-4/5 rounded-full shadow flex items-center justify-center relative ${
                            piece === 1
                              ? "bg-gradient-to-br from-slate-800 to-slate-950 border border-slate-900"
                              : "bg-gradient-to-br from-white to-slate-100 border border-slate-300"
                          }`}
                        >
                          {/* Inner reflection accent for realism */}
                          <div
                            className={`absolute top-[12%] left-[12%] w-[35%] h-[35%] rounded-full opacity-40 ${
                              piece === 1 ? "bg-slate-200" : "bg-white"
                            }`}
                          />

                          {/* Last move indicator circle */}
                          {isLatest && (
                            <div className={`w-2 h-2 rounded-full ${piece === 1 ? "bg-indigo-400" : "bg-slate-700"}`} />
                          )}
                        </motion.div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
          {/* Active Status Ribbon under Board */}
          <div className="w-full mt-4 flex justify-between items-center px-2">
            <span className="text-slate-500 font-mono text-xs">
              棋盘规格: 15 × 15 经典五子棋
            </span>
            {room.status === "playing" && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isMyTurn ? "bg-indigo-50 text-indigo-600 border border-indigo-100" : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
                {isMyTurn ? "● 你的回合" : "○ 等待对方下子"}
              </span>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: STATUS CARDS & ACTION HUB */}
        <div className="col-span-1 lg:col-span-4 flex flex-col gap-6">
          
          {/* Game Round Control state (WAITING / PLAYING / FINISHED) */}
          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
            <h3 className="text-xs font-semibold text-slate-400 tracking-wider uppercase mb-4">
              对战大厅状态
            </h3>

            {/* Turn or End Screen announcement */}
            {room.status === "waiting" && (
              <div className="text-center py-4 bg-slate-50 rounded-xl border border-slate-100">
                <Play className="mx-auto text-indigo-600 mb-2 animate-bounce" size={24} />
                <h4 className="text-sm font-bold text-slate-700">等待玩家准备就绪</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-[200px] mx-auto leading-relaxed">
                  双方玩家都点击“准备游戏”后对局即刻开启。
                </p>
              </div>
            )}

            {room.status === "playing" && (
              <div className="flex flex-col gap-3">
                <div className="text-center py-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-xs text-slate-400 block">执子顺序</span>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <span className={`w-3 h-3 rounded-full ${gameState.current_turn === "host" ? "bg-slate-800" : "bg-white border border-slate-300"}`} />
                    <span className="text-sm font-bold text-slate-700">
                      {gameState.current_turn === "host" ? "房主 (黑棋)" : "客方 (白棋)"} 的回合
                    </span>
                  </div>
                </div>

                {isMyTurn ? (
                  <div className="bg-indigo-50 border border-indigo-100 text-indigo-600 text-xs px-3 py-2 rounded-lg text-center animate-pulse font-medium">
                    该你落子了，请在棋盘空白处点击。
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-100 text-slate-400 text-xs px-3 py-2 rounded-lg text-center font-medium">
                    对手正在思考中...
                  </div>
                )}
              </div>
            )}

            {room.status === "finished" && (
              <div className="text-center py-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center">
                <Trophy className="text-indigo-600 mb-2" size={32} />
                <h4 className="text-base font-bold text-slate-700">对局结束</h4>
                
                {gameState.winner === "draw" ? (
                  <p className="text-sm font-semibold text-indigo-600 mt-1">
                    平局！棋盘已满
                  </p>
                ) : (
                  <p className="text-sm font-bold text-indigo-600 mt-1">
                    胜者:{" "}
                    {gameState.winner === "host"
                      ? players.host?.name || "房主"
                      : players.guest?.name || "客方"}
                    （{gameState.winner === "host" ? "执黑" : "执白"}）
                  </p>
                )}

                {!isSpectator && (
                  <button
                    onClick={restartGame}
                    className="mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition duration-200"
                  >
                    <RotateCcw size={14} />
                    再来一局
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Player Cards (Host & Guest details) */}
          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col gap-4">
            <h3 className="text-xs font-semibold text-slate-400 tracking-wider uppercase">
              玩家席位
            </h3>

            {/* Host Card */}
            <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 rounded-full bg-slate-200 shadow-inner flex items-center justify-center text-slate-700 font-bold font-sans">
                  H
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-800" />
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700 line-clamp-1">
                    {players.host?.name || "房主"}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {hostOnline ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-100/60 px-1.5 py-0.5 rounded font-semibold">
                        <Wifi size={10} />
                        在线
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-semibold">
                        <WifiOff size={10} />
                        离线
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status display */}
              <div className="text-right">
                {room.status === "waiting" ? (
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${players.host?.ready ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-slate-100 text-slate-400 border border-slate-200"}`}>
                    {players.host?.ready ? "已准备" : "未准备"}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    房主
                  </span>
                )}
              </div>
            </div>

            {/* Guest Card */}
            <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 rounded-full bg-slate-200 shadow-inner flex items-center justify-center text-slate-700 font-bold font-sans">
                  G
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                    <div className="w-2.5 h-2.5 rounded-full bg-white border border-slate-300" />
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700 line-clamp-1">
                    {players.guest?.name || "等待对手..."}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {players.guest ? (
                      guestOnline ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-100/60 px-1.5 py-0.5 rounded font-semibold">
                          <Wifi size={10} />
                          在线
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-semibold">
                          <WifiOff size={10} />
                          离线
                        </span>
                      )
                    ) : (
                      <span className="text-[10px] text-slate-400 animate-pulse font-semibold">
                        等待空位加入...
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status display */}
              <div className="text-right">
                {room.status === "waiting" ? (
                  players.guest ? (
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${players.guest?.ready ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-slate-100 text-slate-400 border border-slate-200"}`}>
                      {players.guest?.ready ? "已准备" : "未准备"}
                    </span>
                  ) : null
                ) : (
                  <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    对手
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Hub (Buttons for Ready / Start) */}
          {!isSpectator && room.status === "waiting" && (
            <div className="flex flex-col gap-3">
              <button
                onClick={toggleReady}
                className={`w-full py-3 px-4 rounded-xl font-bold text-sm tracking-wide shadow-sm transition-all duration-200 ${
                  myReady
                    ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
              >
                {myReady ? "取消准备" : "确认准备就绪"}
              </button>

              {/* Guidance helper */}
              <p className="text-[10px] text-slate-400 text-center">
                对局将在双方均完成准备后自动触发启动。
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
