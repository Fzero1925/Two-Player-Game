import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Brush,
  Eraser,
  Trash2,
  Undo,
  Send,
  Sparkles,
  Trophy,
  Smile,
  Info,
  CheckCircle2,
  HelpCircle,
  Clock,
  ArrowRight
} from "lucide-react";
import { Room, Player } from "../types";

// Standard client-side helper to check online status (within 10 seconds)
const isPlayerOnline = (p: Player | null | undefined) => {
  if (!p) return false;
  return p.online && Date.now() - p.last_seen < 10000;
};

const CLIENT_PICTIONARY_WORDS = [
  { word: "猫", category: "动物" },
  { word: "狗", category: "动物" },
  { word: "熊猫", category: "动物" },
  { word: "兔子", category: "动物" },
  { word: "老虎", category: "动物" },
  { word: "大象", category: "动物" },
  { word: "企鹅", category: "动物" },
  { word: "海豚", category: "动物" },
  { word: "苹果", category: "水果" },
  { word: "香蕉", category: "水果" },
  { word: "西瓜", category: "水果" },
  { word: "草莓", category: "水果" },
  { word: "汉堡", category: "食物" },
  { word: "比萨", category: "食物" },
  { word: "冰激凌", category: "食物" },
  { word: "蛋糕", category: "食物" },
  { word: "汽车", category: "交通工具" },
  { word: "自行车", category: "交通工具" },
  { word: "飞机", category: "交通工具" },
  { word: "手机", category: "电子产品" },
  { word: "电脑", category: "电子产品" },
  { word: "太阳", category: "大自然" },
  { word: "月亮", category: "大自然" },
  { word: "星星", category: "大自然" },
  { word: "彩虹", category: "大自然" },
  { word: "雨伞", category: "生活用品" },
  { word: "眼镜", category: "生活用品" },
  { word: "房子", category: "建筑物" },
  { word: "花朵", category: "大自然" },
  { word: "大树", category: "大自然" },
  { word: "气球", category: "玩具" }
];

function getRandomWord() {
  return CLIENT_PICTIONARY_WORDS[Math.floor(Math.random() * CLIENT_PICTIONARY_WORDS.length)];
}

interface PictionaryGameProps {
  room: Room;
  role: "host" | "guest" | "spectator";
  onLeave: () => void;
  roomManager: {
    updateGameState: (roomCode: string, state: any, status?: string) => Promise<any>;
    updateReadyStatus: (roomCode: string, ready: boolean) => Promise<any>;
    sendHeartbeat: (roomCode: string) => Promise<any>;
    subscribeToRoom: (roomCode: string, onUpdate: (room: Room) => void) => () => void;
  };
}

interface Stroke {
  points: number[];
  color: string;
  width: number;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  text: string;
  is_correct: boolean;
  timestamp: number;
}

export default function PictionaryGame({
  room: initialRoom,
  role,
  onLeave,
  roomManager
}: PictionaryGameProps) {
  const [room, setRoom] = useState<Room>(initialRoom);
  const [error, setError] = useState<string | null>(null);

  // Canvas drawing state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState("#0f172a");
  const [brushWidth, setBrushWidth] = useState(6);
  const [isEraser, setIsEraser] = useState(false);
  
  // Chat typing state
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // AI guess loading state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  // Setup reactive room state from backend stream
  useEffect(() => {
    if (initialRoom.room_code === "SINGLE") {
      setRoom(initialRoom);
      return;
    }

    const unsubscribe = roomManager.subscribeToRoom(initialRoom.room_code, (updatedRoom) => {
      setRoom(updatedRoom);
    });

    return () => unsubscribe();
  }, [initialRoom.room_code, initialRoom.game_type]);

  // Periodic heartbeat
  useEffect(() => {
    if (room.room_code === "SINGLE") return;

    roomManager.sendHeartbeat(room.room_code).catch(console.error);
    const interval = setInterval(() => {
      roomManager.sendHeartbeat(room.room_code).catch(console.error);
    }, 4000);

    return () => clearInterval(interval);
  }, [room.room_code]);

  const players = room.players;
  const isHost = role === "host";
  const isGuest = role === "guest";
  const isSpectator = role === "spectator";

  const hostOnline = isPlayerOnline(players.host);
  const guestOnline = room.room_code === "SINGLE" ? true : isPlayerOnline(players.guest);

  const opponentOffline =
    room.room_code !== "SINGLE" &&
    room.status === "playing" &&
    ((isHost && !guestOnline) || (isGuest && !hostOnline));

  // Extract Pictionary details
  const gameState = room.game_state || {
    drawer: "host",
    secret_word: "猫",
    hint: "动物",
    lines: [],
    chat: [],
    winner: null
  };

  const currentDrawer = gameState.drawer || "host";
  const isMyTurnToDraw =
    (currentDrawer === "host" && isHost) ||
    (currentDrawer === "guest" && isGuest);

  const lines: Stroke[] = gameState.lines || [];
  const chats: ChatMessage[] = gameState.chat || [];
  const secretWord = gameState.secret_word || "猫";
  const categoryHint = gameState.hint || "大自然";

  // Redraw canvas whenever lines change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear and draw white backdrop
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render strokes
    lines.forEach((line) => {
      if (!line.points || line.points.length < 2) return;
      ctx.beginPath();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.width;
      ctx.moveTo(line.points[0], line.points[1]);
      for (let i = 2; i < line.points.length; i += 2) {
        ctx.lineTo(line.points[i], line.points[i + 1]);
      }
      ctx.stroke();
    });
  }, [lines]);

  // Scroll chats to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats, aiFeedback]);

  // Handle local and sync draw actions
  const getCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isMyTurnToDraw || room.status !== "playing") return;
    const coords = getCoordinates(e);
    if (!coords) return;

    setIsDrawing(true);
    // Create new line
    const color = isEraser ? "#ffffff" : brushColor;
    const newLine: Stroke = {
      points: [coords.x, coords.y],
      color,
      width: brushWidth
    };

    const updatedLines = [...lines, newLine];
    updateLocalAndSyncLines(updatedLines);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isMyTurnToDraw || room.status !== "playing") return;
    const coords = getCoordinates(e);
    if (!coords) return;

    const updatedLines = [...lines];
    const currentStroke = updatedLines[updatedLines.length - 1];
    if (currentStroke) {
      currentStroke.points.push(coords.x, coords.y);
      // Redraw immediately locally
      setRoom((prev) => ({
        ...prev,
        game_state: {
          ...prev.game_state,
          lines: updatedLines
        }
      }));
    }
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    // Commit the final stroke to the server
    syncGameStateToBackend(lines);
  };

  const updateLocalAndSyncLines = (newLines: Stroke[]) => {
    // Update local state
    setRoom((prev) => ({
      ...prev,
      game_state: {
        ...prev.game_state,
        lines: newLines
      }
    }));
  };

  const syncGameStateToBackend = async (finalLines: Stroke[], alternateStatus?: string) => {
    if (room.room_code === "SINGLE") {
      setRoom((prev) => ({
        ...prev,
        game_state: {
          ...prev.game_state,
          lines: finalLines
        },
        status: alternateStatus || prev.status
      }));
      return;
    }

    try {
      const updatedGameState = {
        ...gameState,
        lines: finalLines
      };
      await roomManager.updateGameState(room.room_code, updatedGameState, alternateStatus);
    } catch (err) {
      setError("网络同步失败，请检查连接");
    }
  };

  // Undo and Clear
  const handleUndo = () => {
    if (!isMyTurnToDraw || lines.length === 0) return;
    const updatedLines = lines.slice(0, -1);
    updateLocalAndSyncLines(updatedLines);
    syncGameStateToBackend(updatedLines);
  };

  const handleClear = () => {
    if (!isMyTurnToDraw) return;
    updateLocalAndSyncLines([]);
    syncGameStateToBackend([]);
  };

  // Chat Submission
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const text = chatInput.trim();
    setChatInput("");

    // Check if the guess is correct
    const isCorrect = text.toLowerCase() === secretWord.toLowerCase();

    const senderName = isHost
      ? players.host?.name || "房主"
      : players.guest?.name || "客方";

    const newMessage: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      sender_id: isHost ? players.host?.id || "host" : players.guest?.id || "guest",
      sender_name: senderName,
      text,
      is_correct: isCorrect,
      timestamp: Date.now()
    };

    const updatedChats = [...chats, newMessage];

    if (room.room_code === "SINGLE") {
      // In single player, user is the drawer, so usually they aren't guessing.
      // But if they type, we just show it.
      setRoom((prev) => ({
        ...prev,
        game_state: {
          ...prev.game_state,
          chat: updatedChats
        }
      }));
      return;
    }

    // Sync to other players
    const updatedState = {
      ...gameState,
      chat: updatedChats,
      winner: isCorrect ? (isHost ? "host" : "guest") : gameState.winner
    };

    const nextStatus = isCorrect ? "finished" : room.status;

    try {
      await roomManager.updateGameState(room.room_code, updatedState, nextStatus);
    } catch (err) {
      setError("发送消息失败");
    }
  };

  // AI Guessing logic (Single Player)
  const askAiToGuess = async () => {
    const canvas = canvasRef.current;
    if (!canvas || lines.length === 0) return;

    setAiLoading(true);
    setAiFeedback(null);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const res = await fetch("/api/pictionary/ai-guess", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ image: dataUrl })
      });

      if (!res.ok) throw new Error("AI 无法辨认");
      const data = await res.json();
      const aiGuess = data.guess;

      const isCorrect = aiGuess.includes(secretWord) || secretWord.includes(aiGuess);

      const aiMessage: ChatMessage = {
        id: Math.random().toString(36).substring(2, 9),
        sender_id: "AI_BOT",
        sender_name: "智能 AI (电脑)",
        text: `我猜这幅画是【${aiGuess}】！`,
        is_correct: isCorrect,
        timestamp: Date.now()
      };

      const updatedChats = [...chats, aiMessage];

      setRoom((prev) => ({
        ...prev,
        status: isCorrect ? "finished" : prev.status,
        game_state: {
          ...prev.game_state,
          chat: updatedChats,
          winner: isCorrect ? "guest" : prev.game_state.winner
        }
      }));

      if (isCorrect) {
        setAiFeedback("✨ 哇塞！AI 猜中了！太厉害了！");
      } else {
        setAiFeedback("🤖 嗯...好像不是这个，让我再仔细琢磨琢磨，继续加点细节吧！");
      }
    } catch (err) {
      setError("AI 猜测失败，请稍后重试");
    } finally {
      setAiLoading(false);
    }
  };

  // Toggle Ready
  const toggleReady = async () => {
    if (room.room_code === "SINGLE") {
      const nextReady = !players.host?.ready;
      setRoom((prev) => {
        const updatedPlayers = { ...prev.players };
        if (updatedPlayers.host) {
          updatedPlayers.host.ready = nextReady;
        }
        return {
          ...prev,
          players: updatedPlayers,
          status: nextReady ? "playing" : "waiting",
          game_state: {
            drawer: "host",
            secret_word: getRandomWord().word,
            hint: getRandomWord().category,
            lines: [],
            chat: [],
            winner: null
          }
        };
      });
      return;
    }

    const currentReady = isHost ? !!players.host?.ready : !!players.guest?.ready;
    try {
      await roomManager.updateReadyStatus(room.room_code, !currentReady);
    } catch (err) {
      setError("准备状态更新失败");
    }
  };

  // Restart / Swapping drawers
  const startNextRound = async () => {
    // Next drawer is the other player
    const nextDrawer = currentDrawer === "host" ? "guest" : "host";

    if (room.room_code === "SINGLE") {
      setRoom((prev) => ({
        ...prev,
        status: "playing",
        players: {
          host: { ...(prev.players.host || {}), ready: true } as Player,
          guest: { ...(prev.players.guest || {}), ready: true } as Player
        },
        game_state: {
          drawer: "host", // User is always drawing in single-player
          secret_word: getRandomWord().word,
          hint: getRandomWord().category,
          lines: [],
          chat: [],
          winner: null
        }
      }));
      return;
    }

    const nextWord = getRandomWord();
    const resetState = {
      drawer: nextDrawer,
      secret_word: nextWord.word,
      hint: nextWord.category,
      lines: [],
      chat: [],
      winner: null
    };

    try {
      await roomManager.updateGameState(room.room_code, resetState, "playing");
    } catch (err) {
      setError("重置下一局失败");
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:py-10" id="pictionary-root">
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
                你画我猜 趣味对决
              </span>
              <span className="px-3 py-1 bg-slate-100 text-slate-500 font-mono text-xs rounded-full border border-slate-200">
                房号: {room.room_code}
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold font-sans text-slate-800 tracking-tight mt-1">
              {room.room_code === "SINGLE" ? "单人练习模式" : "双人趣味联机"}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm font-medium">
          {isSpectator ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-500 rounded-lg">
              <HelpCircle size={16} className="text-indigo-500" />
              <span>观战模式</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg">
              <span className="font-sans text-slate-500 text-xs">我的角色:</span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-bold ${
                  isMyTurnToDraw ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-800"
                }`}
              >
                {isMyTurnToDraw ? "画手 (正在画)" : "猜手 (正在猜)"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Connection & Error alerts */}
      <AnimatePresence>
        {opponentOffline && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 flex items-center gap-3 bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl shadow-sm"
          >
            <Info className="text-red-500 shrink-0 animate-pulse" size={20} />
            <span className="text-sm">对方已断开连接！正在等待对手上线。</span>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Main Board Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: Drawing Canvas & Brush Toolkit */}
        <div className="col-span-1 lg:col-span-8 flex flex-col gap-4">
          {/* Dashboard Hub above Canvas */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-wrap justify-between items-center gap-4 shadow-md">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400">
                <Clock size={18} />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  词语分类
                </span>
                <span className="text-sm font-bold">{categoryHint}</span>
              </div>
            </div>

            {/* Secret word only shown to the drawer */}
            {isMyTurnToDraw || room.status === "finished" ? (
              <div className="bg-slate-800 border border-slate-700/50 px-4 py-2 rounded-xl text-center">
                <span className="text-[10px] text-indigo-400 font-semibold block uppercase">
                  题目秘密词
                </span>
                <span className="text-base font-bold text-amber-400 tracking-wide">
                  {secretWord}
                </span>
              </div>
            ) : (
              <div className="bg-slate-800 border border-slate-700/50 px-4 py-2 rounded-xl text-center">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                  字数提示
                </span>
                <span className="text-sm font-bold text-indigo-300">
                  {secretWord.length} 个字
                </span>
              </div>
            )}

            {/* AI Guessing helper in single player */}
            {room.room_code === "SINGLE" && room.status === "playing" && (
              <button
                onClick={askAiToGuess}
                disabled={aiLoading || lines.length === 0}
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:from-slate-700 disabled:to-slate-800 disabled:opacity-50 font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg transition duration-200"
              >
                <Sparkles size={14} className={aiLoading ? "animate-spin" : ""} />
                {aiLoading ? "AI 辨认中..." : "让智能 AI 猜猜看"}
              </button>
            )}
          </div>

          {/* Canvas Wrapper */}
          <div className="relative w-full aspect-square bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden flex items-center justify-center p-1">
            <canvas
              ref={canvasRef}
              width={600}
              height={600}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className={`w-full aspect-square max-w-[550px] bg-white touch-none ${
                isMyTurnToDraw && room.status === "playing"
                  ? "cursor-crosshair"
                  : "pointer-events-none"
              }`}
              style={{ imageRendering: "pixelated" }}
            />

            {/* Victory overlay */}
            <AnimatePresence>
              {room.status === "finished" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center"
                >
                  <motion.div
                    initial={{ scale: 0.5, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    transition={{ type: "spring", damping: 15 }}
                    className="bg-white rounded-3xl p-8 max-w-sm shadow-2xl border border-slate-100 flex flex-col items-center"
                  >
                    <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500 mb-4 animate-bounce">
                      <Trophy size={36} />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-800">猜中啦！</h3>
                    <p className="text-sm text-slate-500 mt-2">
                      正确答案是：<b className="text-indigo-600 text-base">{secretWord}</b>
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {room.room_code === "SINGLE"
                        ? "恭喜，智能 AI 成功识别了你的杰作！"
                        : `${currentDrawer === "host" ? "客方" : "房主"} 凭借敏锐的直觉夺得本轮胜利！`}
                    </p>

                    <button
                      onClick={startNextRound}
                      className="mt-6 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-sm transition duration-150 flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/10"
                    >
                      <span>{room.room_code === "SINGLE" ? "下一关 (再画一个)" : "下一局 (换手对决)"}</span>
                      <ArrowRight size={16} />
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Brush Toolkit Panel */}
          {isMyTurnToDraw && room.status === "playing" && (
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-4">
              {/* Tool selector */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEraser(false)}
                  className={`p-2.5 rounded-xl border transition ${
                    !isEraser
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                  }`}
                  title="画笔"
                >
                  <Brush size={18} />
                </button>
                <button
                  onClick={() => setIsEraser(true)}
                  className={`p-2.5 rounded-xl border transition ${
                    isEraser
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                  }`}
                  title="橡皮擦"
                >
                  <Eraser size={18} />
                </button>
              </div>

              {/* Color Swatches */}
              {!isEraser && (
                <div className="flex items-center gap-2.5 overflow-x-auto py-1">
                  {[
                    "#0f172a", // Charcoal
                    "#ef4444", // Red
                    "#3b82f6", // Blue
                    "#10b981", // Green
                    "#f59e0b", // Yellow
                    "#8b5cf6", // Purple
                    "#f97316", // Orange
                    "#ec4899"  // Pink
                  ].map((color) => (
                    <button
                      key={color}
                      onClick={() => setBrushColor(color)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform duration-100 ${
                        brushColor === color ? "scale-125 border-indigo-500 shadow-sm" : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              )}

              {/* Brush Width Slider */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 font-medium">粗细</span>
                <input
                  type="range"
                  min="2"
                  max="24"
                  value={brushWidth}
                  onChange={(e) => setBrushWidth(parseInt(e.target.value))}
                  className="w-24 accent-indigo-600 cursor-pointer"
                />
                <span className="text-xs font-mono text-slate-600 font-bold min-w-[20px]">
                  {brushWidth}px
                </span>
              </div>

              {/* Utility actions */}
              <div className="flex items-center gap-2 border-l border-slate-100 pl-4">
                <button
                  onClick={handleUndo}
                  disabled={lines.length === 0}
                  className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl transition disabled:opacity-40 disabled:hover:bg-slate-50"
                  title="撤销"
                >
                  <Undo size={16} />
                </button>
                <button
                  onClick={handleClear}
                  disabled={lines.length === 0}
                  className="p-2.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-xl transition disabled:opacity-40 disabled:hover:bg-red-50"
                  title="清除画板"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: GUESSING logs, Chat & Player HUD */}
        <div className="col-span-1 lg:col-span-4 flex flex-col gap-6">
          {/* Game state controller */}
          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
            <h3 className="text-xs font-semibold text-slate-400 tracking-wider uppercase mb-4">
              房间对决状态
            </h3>

            {room.status === "waiting" ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 text-xs rounded-xl border border-amber-100">
                  <Info size={14} className="shrink-0" />
                  <span>准备完毕后游戏将自动开始</span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="text-sm">
                    <span className="font-bold text-slate-800">
                      {players.host?.name || "未知房主"}
                    </span>
                    <span className="text-xs text-slate-400 block">房主 (执画笔)</span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      players.host?.ready ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {players.host?.ready ? "已准备" : "待准备"}
                  </span>
                </div>

                {room.room_code !== "SINGLE" && (
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="text-sm">
                      <span className="font-bold text-slate-800">
                        {players.guest?.name || "等待对手加入..."}
                      </span>
                      <span className="text-xs text-slate-400 block">客方 (猜词手)</span>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        players.guest?.ready ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {players.guest?.ready ? "已准备" : "待准备"}
                    </span>
                  </div>
                )}

                {/* Ready trigger button */}
                {!isSpectator && (
                  <button
                    onClick={toggleReady}
                    className={`w-full py-3 font-bold rounded-2xl text-sm transition duration-150 ${
                      (isHost && players.host?.ready) || (isGuest && players.guest?.ready)
                        ? "bg-slate-200 hover:bg-slate-300 text-slate-700"
                        : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/10"
                    }`}
                  >
                    {(isHost && players.host?.ready) || (isGuest && players.guest?.ready)
                      ? "取消准备"
                      : "开始准备 / 开启对决"}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-ping" />
                  <span className="text-xs font-bold text-slate-600">比赛火热进行中</span>
                </div>

                <div className="space-y-2 text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="flex justify-between">
                    <span>本局画手:</span>
                    <span className="font-bold text-slate-700">
                      {currentDrawer === "host"
                        ? players.host?.name || "房主"
                        : players.guest?.name || "客方"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>本局猜手:</span>
                    <span className="font-bold text-slate-700">
                      {currentDrawer === "host"
                        ? room.room_code === "SINGLE"
                          ? "智能 AI (电脑)"
                          : players.guest?.name || "客方"
                        : players.host?.name || "房主"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Chat & Guesses Box */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col h-[350px] overflow-hidden">
            {/* Header */}
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center shrink-0">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Smile size={14} className="text-indigo-500" />
                <span>实时猜测与对话</span>
              </span>
              <span className="px-2 py-0.5 bg-slate-200/60 text-[10px] text-slate-500 font-bold rounded">
                {chats.length} 条记录
              </span>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chats.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center gap-2">
                  <Smile size={24} className="stroke-[1.5] text-slate-300" />
                  <p className="text-xs">
                    {isMyTurnToDraw
                      ? "等待对方猜测..."
                      : "在下方输入框中写下你的猜测吧！"}
                  </p>
                </div>
              ) : (
                chats.map((chat) => (
                  <div
                    key={chat.id}
                    className={`flex flex-col ${
                      chat.is_correct ? "bg-green-50 border border-green-100 p-2.5 rounded-xl" : ""
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-xs font-bold text-slate-700">
                        {chat.sender_name}
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono">
                        {new Date(chat.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit"
                        })}
                      </span>
                    </div>

                    <p
                      className={`text-xs mt-1 leading-relaxed ${
                        chat.is_correct
                          ? "text-green-700 font-bold flex items-center gap-1"
                          : "text-slate-600"
                      }`}
                    >
                      {chat.is_correct && <CheckCircle2 size={13} className="shrink-0" />}
                      {chat.text}
                    </p>
                  </div>
                ))
              )}

              {aiFeedback && (
                <div className="bg-indigo-50 border border-indigo-100 p-2.5 rounded-xl flex flex-col">
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-xs font-bold text-indigo-700 flex items-center gap-1">
                      <Sparkles size={12} />
                      AI 反馈
                    </span>
                  </div>
                  <p className="text-xs mt-1 text-indigo-800 font-medium">
                    {aiFeedback}
                  </p>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Chat Input footer */}
            {room.status === "playing" && !isMyTurnToDraw && !isSpectator && (
              <form
                onSubmit={handleSendChat}
                className="p-3 border-t border-slate-200 bg-slate-50 flex gap-2 shrink-0"
              >
                <input
                  type="text"
                  placeholder="写下你的大胆猜测..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500 placeholder-slate-400"
                />
                <button
                  type="submit"
                  className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition"
                >
                  <Send size={14} />
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
