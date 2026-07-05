import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Room, Player } from "./src/types.js";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" })); // Increased limit to receive base64 drawings safely

// Lazy-initialized Gemini API client
let aiInstance: GoogleGenAI | null = null;
function getGenAI() {
  if (!aiInstance && process.env.GEMINI_API_KEY) {
    aiInstance = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

// Word list for Pictionary
const PICTIONARY_WORDS = [
  { word: "猫", category: "动物" },
  { word: "狗", category: "动物" },
  { word: "熊猫", category: "动物" },
  { word: "兔子", category: "动物" },
  { word: "老虎", category: "动物" },
  { word: "大象", category: "动物" },
  { word: "恐龙", category: "动物" },
  { word: "企鹅", category: "动物" },
  { word: "海豚", category: "动物" },
  { word: "章鱼", category: "动物" },
  { word: "小鸟", category: "动物" },
  { word: "长颈鹿", category: "动物" },
  { word: "苹果", category: "水果" },
  { word: "香蕉", category: "水果" },
  { word: "西瓜", category: "水果" },
  { word: "草莓", category: "水果" },
  { word: "葡萄", category: "水果" },
  { word: "橙子", category: "水果" },
  { word: "汉堡", category: "食物" },
  { word: "比萨", category: "食物" },
  { word: "冰激凌", category: "食物" },
  { word: "面条", category: "食物" },
  { word: "蛋糕", category: "食物" },
  { word: "汽车", category: "交通工具" },
  { word: "自行车", category: "交通工具" },
  { word: "飞机", category: "交通工具" },
  { word: "轮船", category: "交通工具" },
  { word: "火箭", category: "交通工具" },
  { word: "手机", category: "电子产品" },
  { word: "电脑", category: "电子产品" },
  { word: "电视", category: "电子产品" },
  { word: "太阳", category: "大自然" },
  { word: "月亮", category: "大自然" },
  { word: "星星", category: "大自然" },
  { word: "彩虹", category: "大自然" },
  { word: "云朵", category: "大自然" },
  { word: "雨伞", category: "生活用品" },
  { word: "眼镜", category: "生活用品" },
  { word: "帽子", category: "服饰" },
  { word: "鞋子", category: "服饰" },
  { word: "书包", category: "生活用品" },
  { word: "杯子", category: "生活用品" },
  { word: "铅笔", category: "生活用品" },
  { word: "吉他", category: "乐器" },
  { word: "钢琴", category: "乐器" },
  { word: "房子", category: "建筑物" },
  { word: "雪人", category: "大自然" },
  { word: "花朵", category: "大自然" },
  { word: "大树", category: "大自然" },
  { word: "气球", category: "玩具" }
];

function getRandomWord() {
  return PICTIONARY_WORDS[Math.floor(Math.random() * PICTIONARY_WORDS.length)];
}

// In-memory Room storage for Local Fallback Mode
const rooms: Record<string, Room> = {};

// Active SSE Connections: roomCode -> Array of active subscribers
interface SseClient {
  playerId: string;
  res: any;
}
const roomClients: Record<string, SseClient[]> = {};

// Helper: Broadcast updated room state to all players in a room
function broadcastToRoom(roomCode: string) {
  const room = rooms[roomCode];
  if (!room) return;

  const clients = roomClients[roomCode] || [];
  const payload = JSON.stringify(room);

  clients.forEach((client) => {
    try {
      client.res.write(`data: ${payload}\n\n`);
    } catch (err) {
      console.error(`Failed to send update to player ${client.playerId} in room ${roomCode}:`, err);
    }
  });
}

// Generate an uppercase alphanumeric 6-character room code
function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Guarantee uniqueness
  if (rooms[code]) {
    return generateRoomCode();
  }
  return code;
}

// API Routes for Room Synchronization (Local Fallback)

// 1. Create a Room
app.post("/api/rooms", (req, res) => {
  const { game_type, player_id, name } = req.body;
  if (!game_type || !player_id || !name) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const roomCode = generateRoomCode();
  const hostPlayer: Player = {
    id: player_id,
    name,
    online: true,
    last_seen: Date.now(),
    ready: false,
  };

  const isPictionary = game_type === "pictionary";
  const pWord = isPictionary ? getRandomWord() : null;

  const newRoom: Room = {
    room_code: roomCode,
    game_type,
    status: "waiting",
    players: {
      host: hostPlayer,
      guest: null,
    },
    game_state: isPictionary
      ? {
          drawer: "host",
          secret_word: pWord?.word || "猫",
          hint: pWord?.category || "动物",
          lines: [],
          chat: [],
          winner: null,
        }
      : {
          board: Array(15).fill(null).map(() => Array(15).fill(0)),
          current_turn: "host",
          winner: null,
        },
    created_at: new Date().toISOString(),
  };

  rooms[roomCode] = newRoom;
  res.json(newRoom);
});

// 2. Join a Room
app.post("/api/rooms/:code/join", (req, res) => {
  const { code } = req.params;
  const { player_id, name } = req.body;

  const roomCode = code.toUpperCase();
  const room = rooms[roomCode];

  if (!room) {
    return res.status(404).json({ error: "房间号不存在" });
  }

  if (!player_id || !name) {
    return res.status(400).json({ error: "参数不完整" });
  }

  const players = room.players;

  // Check if player is already registered in the room
  if (players.host?.id === player_id) {
    players.host.online = true;
    players.host.last_seen = Date.now();
    broadcastToRoom(roomCode);
    return res.json({ room, role: "host" });
  }

  if (players.guest?.id === player_id) {
    players.guest.online = true;
    players.guest.last_seen = Date.now();
    broadcastToRoom(roomCode);
    return res.json({ room, role: "guest" });
  }

  // If player is not registered, try to assign them a vacant slot
  if (!players.host) {
    players.host = {
      id: player_id,
      name,
      online: true,
      last_seen: Date.now(),
      ready: false,
    };
    broadcastToRoom(roomCode);
    return res.json({ room, role: "host" });
  }

  if (!players.guest) {
    players.guest = {
      id: player_id,
      name,
      online: true,
      last_seen: Date.now(),
      ready: false,
    };
    broadcastToRoom(roomCode);
    return res.json({ room, role: "guest" });
  }

  // Room is full for players, let them connect as spectator
  return res.status(400).json({ error: "房间已满，无法加入游戏" });
});

// 3. Update Game State
app.post("/api/rooms/:code/state", (req, res) => {
  const { code } = req.params;
  const { player_id, game_state, status } = req.body;

  const roomCode = code.toUpperCase();
  const room = rooms[roomCode];

  if (!room) {
    return res.status(404).json({ error: "房间不存在" });
  }

  // Validate player role
  const isHost = room.players.host?.id === player_id;
  const isGuest = room.players.guest?.id === player_id;

  if (!isHost && !isGuest) {
    return res.status(403).json({ error: "无权修改该房间的游戏状态" });
  }

  if (game_state !== undefined) {
    room.game_state = game_state;
  }
  if (status !== undefined) {
    room.status = status;
  }

  // Record active heartbeat on update
  if (isHost && room.players.host) {
    room.players.host.last_seen = Date.now();
    room.players.host.online = true;
  } else if (isGuest && room.players.guest) {
    room.players.guest.last_seen = Date.now();
    room.players.guest.online = true;
  }

  broadcastToRoom(roomCode);
  res.json(room);
});

// 4. Update Ready Status
app.post("/api/rooms/:code/ready", (req, res) => {
  const { code } = req.params;
  const { player_id, ready } = req.body;

  const roomCode = code.toUpperCase();
  const room = rooms[roomCode];

  if (!room) {
    return res.status(404).json({ error: "房间不存在" });
  }

  let stateChanged = false;

  if (room.players.host?.id === player_id) {
    room.players.host.ready = ready;
    room.players.host.last_seen = Date.now();
    room.players.host.online = true;
    stateChanged = true;
  } else if (room.players.guest?.id === player_id) {
    room.players.guest.ready = ready;
    room.players.guest.last_seen = Date.now();
    room.players.guest.online = true;
    stateChanged = true;
  }

  // Auto-start game if both players are ready
  if (room.players.host?.ready && room.players.guest?.ready) {
    room.status = "playing";
    if (room.game_type === "pictionary") {
      const pWord = getRandomWord();
      room.game_state = {
        drawer: "host",
        secret_word: pWord.word,
        hint: pWord.category,
        lines: [],
        chat: [],
        winner: null,
      };
    } else {
      room.game_state = {
        board: Array(15).fill(null).map(() => Array(15).fill(0)),
        current_turn: "host",
        winner: null,
      };
    }
  }

  if (stateChanged) {
    broadcastToRoom(roomCode);
  }

  res.json(room);
});

// 5. Player Heartbeat
app.post("/api/rooms/:code/heartbeat", (req, res) => {
  const { code } = req.params;
  const { player_id } = req.body;

  const roomCode = code.toUpperCase();
  const room = rooms[roomCode];

  if (!room) {
    return res.status(404).json({ error: "房间不存在" });
  }

  let changed = false;

  if (room.players.host?.id === player_id) {
    if (!room.players.host.online) {
      room.players.host.online = true;
      changed = true;
    }
    room.players.host.last_seen = Date.now();
  } else if (room.players.guest?.id === player_id) {
    if (!room.players.guest.online) {
      room.players.guest.online = true;
      changed = true;
    }
    room.players.guest.last_seen = Date.now();
  }

  if (changed) {
    broadcastToRoom(roomCode);
  }

  res.json({ success: true });
});

// 5.5. AI Guess Drawing (Gemini API)
app.post("/api/pictionary/ai-guess", async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: "缺少图像数据" });
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

    const aiClient = getGenAI();
    if (!aiClient) {
      const fallbacks = ["苹果", "猫", "房子", "太阳", "气球", "雨伞", "小树", "气球"];
      const guess = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      return res.json({ guess: `${guess} (本地随机猜测)` });
    }

    const imagePart = {
      inlineData: {
        mimeType: "image/png",
        data: base64Data,
      },
    };

    const textPart = {
      text: "你正在玩一个'你画我猜'的游戏。请仔细看这幅由玩家绘制的手绘简笔画，推测它是画的什么。请直接返回你最可能的猜测（例如：苹果、猫、自行车、飞机），字数要极简，通常是1-3个字词，不要带任何废话、标点符号、或前缀。",
    };

    const response = await aiClient.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, textPart] },
    });

    const guess = response.text ? response.text.trim().replace(/[。.!?！？\s]/g, "") : "不确定";
    res.json({ guess });
  } catch (err: any) {
    console.error("Gemini API error:", err);
    res.status(500).json({ error: "AI 猜测失败", details: err.message });
  }
});

// 6. Server-Sent Events (SSE) Stream to listen for real-time room changes
app.get("/api/rooms/:code/stream", (req, res) => {
  const { code } = req.params;
  const { player_id } = req.query;

  const roomCode = code.toUpperCase();
  const room = rooms[roomCode];

  if (!room) {
    res.status(404).end("Room not found");
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const clientId = String(player_id);
  const client: SseClient = { playerId: clientId, res };

  if (!roomClients[roomCode]) {
    roomClients[roomCode] = [];
  }
  roomClients[roomCode].push(client);

  // Instantly push current state on connect
  res.write(`data: ${JSON.stringify(room)}\n\n`);

  req.on("close", () => {
    // Remove client connection
    if (roomClients[roomCode]) {
      roomClients[roomCode] = roomClients[roomCode].filter((c) => c.res !== res);
    }
  });
});

// Background Worker: Heartbeat check for offline detection every 2 seconds
setInterval(() => {
  const now = Date.now();
  const heartbeatTimeout = 10000; // 10 seconds timeout

  Object.keys(rooms).forEach((roomCode) => {
    const room = rooms[roomCode];
    let changed = false;

    // Check host player
    if (room.players.host && room.players.host.online) {
      if (now - room.players.host.last_seen > heartbeatTimeout) {
        room.players.host.online = false;
        changed = true;
        console.log(`Player host (${room.players.host.name}) in room ${roomCode} marked offline due to heartbeat timeout.`);
      }
    }

    // Check guest player
    if (room.players.guest && room.players.guest.online) {
      if (now - room.players.guest.last_seen > heartbeatTimeout) {
        room.players.guest.online = false;
        changed = true;
        console.log(`Player guest (${room.players.guest.name}) in room ${roomCode} marked offline due to heartbeat timeout.`);
      }
    }

    // Broadcast if state changed
    if (changed) {
      broadcastToRoom(roomCode);
    }
  });
}, 2000);

// Integrate Vite Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
