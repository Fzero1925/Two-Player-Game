import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Room, Player, RoomPlayers } from "../types.js";

// Determine if Supabase credentials are configured in environment variables
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || "";
export const isSupabaseMode = !!(supabaseUrl && supabaseAnonKey);

let supabase: SupabaseClient | null = null;
if (isSupabaseMode) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

const PLAYER_ID_KEY = "game_hub_player_id";
const PLAYER_NAME_KEY = "game_hub_player_name";

/**
 * Generate a standard random UUID
 */
export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get or initialize player credentials in localStorage
 */
export function getOrCreatePlayer(): { id: string; name: string } {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = generateUUID();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  let name = localStorage.getItem(PLAYER_NAME_KEY);
  if (!name) {
    name = `玩家_${id.substring(0, 4).toUpperCase()}`;
  }
  return { id, name };
}

/**
 * Update the player's nickname in localStorage
 */
export function updatePlayerName(newName: string): string {
  const name = newName.trim() || `玩家_${getOrCreatePlayer().id.substring(0, 4).toUpperCase()}`;
  localStorage.setItem(PLAYER_NAME_KEY, name);
  return name;
}

/**
 * Helper to generate a room code
 */
function generateClientRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ==========================================
// DUAL-MODE ROOM MANAGER API
// ==========================================

export const roomManager = {
  /**
   * Create a new room
   */
  async createRoom(gameType: string, playerName: string): Promise<Room> {
    const { id: playerId } = getOrCreatePlayer();

    if (isSupabaseMode && supabase) {
      const roomCode = generateClientRoomCode();
      const hostPlayer: Player = {
        id: playerId,
        name: playerName,
        online: true,
        last_seen: Date.now(),
        ready: false,
      };

      const defaultGomokuState = {
        board: Array(15).fill(null).map(() => Array(15).fill(0)),
        current_turn: "host",
        winner: null,
      };

      const newRoom: Room = {
        room_code: roomCode,
        game_type: gameType,
        status: "waiting",
        players: {
          host: hostPlayer,
          guest: null,
        },
        game_state: defaultGomokuState,
      };

      const { data, error } = await supabase
        .from("rooms")
        .insert({
          room_code: roomCode,
          game_type: gameType,
          status: "waiting",
          players: newRoom.players,
          game_state: defaultGomokuState,
        })
        .select()
        .single();

      if (error) {
        console.error("Supabase create room error:", error);
        throw new Error(`创建房间失败: ${error.message}`);
      }

      return data as Room;
    } else {
      // Local Server Fallback Mode
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game_type: gameType,
          player_id: playerId,
          name: playerName,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "创建房间失败");
      }

      return await response.json();
    }
  },

  /**
   * Join an existing room
   */
  async joinRoom(roomCode: string, playerName: string): Promise<{ room: Room; role: "host" | "guest" | "spectator" }> {
    const { id: playerId } = getOrCreatePlayer();
    const formattedCode = roomCode.trim().toUpperCase();

    if (isSupabaseMode && supabase) {
      // 1. Fetch current room state
      const { data: room, error: fetchError } = await supabase
        .from("rooms")
        .select("*")
        .eq("room_code", formattedCode)
        .maybeSingle();

      if (fetchError) {
        throw new Error(`获取房间失败: ${fetchError.message}`);
      }
      if (!room) {
        throw new Error("房间号不存在，请检查后输入");
      }

      const players = room.players as RoomPlayers;

      // 2. Identify role
      let role: "host" | "guest" | "spectator" = "spectator";

      if (players.host?.id === playerId) {
        role = "host";
        players.host.online = true;
        players.host.name = playerName; // Update nickname if changed
        players.host.last_seen = Date.now();
      } else if (players.guest?.id === playerId) {
        role = "guest";
        players.guest.online = true;
        players.guest.name = playerName; // Update nickname if changed
        players.guest.last_seen = Date.now();
      } else if (!players.host) {
        role = "host";
        players.host = {
          id: playerId,
          name: playerName,
          online: true,
          last_seen: Date.now(),
          ready: false,
        };
      } else if (!players.guest) {
        role = "guest";
        players.guest = {
          id: playerId,
          name: playerName,
          online: true,
          last_seen: Date.now(),
          ready: false,
        };
      } else {
        // Room is full, join as spectator
        role = "spectator";
      }

      if (role !== "spectator") {
        // 3. Update database
        const { error: updateError } = await supabase
          .from("rooms")
          .update({ players })
          .eq("room_code", formattedCode);

        if (updateError) {
          throw new Error(`更新房间玩家信息失败: ${updateError.message}`);
        }
      }

      return { room: { ...room, players } as Room, role };
    } else {
      // Local Server Fallback Mode
      const response = await fetch(`/api/rooms/${formattedCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: playerId,
          name: playerName,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "加入房间失败");
      }

      const data = await response.json();
      return { room: data.room, role: data.role };
    }
  },

  /**
   * Update entire Game State (or parts of it)
   */
  async updateGameState(
    roomCode: string,
    gameState: any,
    status?: "waiting" | "playing" | "finished"
  ): Promise<Room> {
    const { id: playerId } = getOrCreatePlayer();
    const formattedCode = roomCode.trim().toUpperCase();

    if (isSupabaseMode && supabase) {
      // Fetch latest state to ensure we preserve heartbeats
      const { data: currentRoom } = await supabase
        .from("rooms")
        .select("players")
        .eq("room_code", formattedCode)
        .maybeSingle();

      const players = currentRoom ? (currentRoom.players as RoomPlayers) : null;
      if (players) {
        if (players.host?.id === playerId) {
          players.host.last_seen = Date.now();
          players.host.online = true;
        } else if (players.guest?.id === playerId) {
          players.guest.last_seen = Date.now();
          players.guest.online = true;
        }
      }

      const updateData: any = { game_state: gameState };
      if (status) {
        updateData.status = status;
      }
      if (players) {
        updateData.players = players;
      }

      const { data, error } = await supabase
        .from("rooms")
        .update(updateData)
        .eq("room_code", formattedCode)
        .select()
        .single();

      if (error) {
        throw new Error(`同步游戏状态失败: ${error.message}`);
      }

      return data as Room;
    } else {
      // Local Server Fallback Mode
      const response = await fetch(`/api/rooms/${formattedCode}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: playerId,
          game_state: gameState,
          status,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "同步游戏状态失败");
      }

      return await response.json();
    }
  },

  /**
   * Set dynamic ready state
   */
  async updateReadyStatus(roomCode: string, ready: boolean): Promise<Room> {
    const { id: playerId } = getOrCreatePlayer();
    const formattedCode = roomCode.trim().toUpperCase();

    if (isSupabaseMode && supabase) {
      // Read current state
      const { data: room, error: fetchError } = await supabase
        .from("rooms")
        .select("*")
        .eq("room_code", formattedCode)
        .maybeSingle();

      if (fetchError || !room) {
        throw new Error("更新准备状态失败，无法定位房间");
      }

      const players = room.players as RoomPlayers;
      let stateChanged = false;

      if (players.host?.id === playerId) {
        players.host.ready = ready;
        players.host.last_seen = Date.now();
        players.host.online = true;
        stateChanged = true;
      } else if (players.guest?.id === playerId) {
        players.guest.ready = ready;
        players.guest.last_seen = Date.now();
        players.guest.online = true;
        stateChanged = true;
      }

      if (stateChanged) {
        const updateData: any = { players };
        // Check if both players are now ready to start the match
        if (players.host?.ready && players.guest?.ready) {
          updateData.status = "playing";
          updateData.game_state = {
            board: Array(15).fill(null).map(() => Array(15).fill(0)),
            current_turn: "host",
            winner: null,
          };
        }

        const { data: updatedRoom, error: updateError } = await supabase
          .from("rooms")
          .update(updateData)
          .eq("room_code", formattedCode)
          .select()
          .single();

        if (updateError) {
          throw new Error(`写入准备状态失败: ${updateError.message}`);
        }
        return updatedRoom as Room;
      }

      return room as Room;
    } else {
      // Local Server Fallback Mode
      const response = await fetch(`/api/rooms/${formattedCode}/ready`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: playerId,
          ready,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "准备状态修改失败");
      }

      return await response.json();
    }
  },

  /**
   * Heartbeat ping to keep session online
   */
  async sendHeartbeat(roomCode: string): Promise<void> {
    const { id: playerId } = getOrCreatePlayer();
    const formattedCode = roomCode.trim().toUpperCase();

    if (isSupabaseMode && supabase) {
      // Heartbeats in Supabase read room, updates player JSON with fresh timestamp
      const { data: room } = await supabase
        .from("rooms")
        .select("players")
        .eq("room_code", formattedCode)
        .maybeSingle();

      if (room) {
        const players = room.players as RoomPlayers;
        let updated = false;

        if (players.host?.id === playerId) {
          players.host.last_seen = Date.now();
          players.host.online = true;
          updated = true;
        } else if (players.guest?.id === playerId) {
          players.guest.last_seen = Date.now();
          players.guest.online = true;
          updated = true;
        }

        if (updated) {
          await supabase
            .from("rooms")
            .update({ players })
            .eq("room_code", formattedCode);
        }
      }
    } else {
      // Local Server Fallback Mode
      await fetch(`/api/rooms/${formattedCode}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: playerId }),
      });
    }
  },

  /**
   * Listen to live updates of a Room (either via SSE or Supabase Realtime)
   */
  subscribeToRoom(
    roomCode: string,
    onUpdate: (room: Room) => void,
    onError?: (err: any) => void
  ): () => void {
    const formattedCode = roomCode.trim().toUpperCase();
    const { id: playerId } = getOrCreatePlayer();

    if (isSupabaseMode && supabase) {
      // 1. Initial Fetch to populate instantly
      supabase
        .from("rooms")
        .select("*")
        .eq("room_code", formattedCode)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            if (onError) onError(error);
          } else if (data) {
            onUpdate(data as Room);
          }
        });

      // 2. Setup Realtime Database Subscription
      const channel = supabase
        .channel(`room-db:${formattedCode}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "rooms",
            filter: `room_code=eq.${formattedCode}`,
          },
          (payload) => {
            onUpdate(payload.new as Room);
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" && onError) {
            onError(new Error("Supabase Realtime connection failed"));
          }
        });

      return () => {
        if (supabase) {
          supabase.removeChannel(channel);
        }
      };
    } else {
      // Local Server Fallback Mode (SSE)
      const eventSource = new EventSource(`/api/rooms/${formattedCode}/stream?player_id=${playerId}`);

      eventSource.onmessage = (event) => {
        try {
          const roomData = JSON.parse(event.data);
          onUpdate(roomData);
        } catch (e) {
          console.error("Failed to parse room update SSE payload:", e);
        }
      };

      eventSource.onerror = (err) => {
        console.error("SSE stream error:", err);
        if (onError) onError(err);
      };

      return () => {
        eventSource.close();
      };
    }
  },
};

/**
 * Determine if a player is truly online based on their online flag and heartbeat gap.
 */
export function isPlayerOnline(player: Player | null | undefined): boolean {
  if (!player) return false;
  const now = Date.now();
  const threshold = 12000; // 12 seconds buffer for network lag
  return player.online && now - player.last_seen < threshold;
}
