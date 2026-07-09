import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { getOrCreatePlayer, roomManager } from "../lib/roomManager.js";
import { getGameDefinition } from "../games/registry.js";
import { Room } from "../types.js";
import { Loader2 } from "lucide-react";

export default function RoomScreen() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const seeded = (location.state as { room?: Room; role?: "host" | "guest" | "spectator" } | null) || null;

  const [room, setRoom] = useState<Room | null>(seeded?.room || null);
  const [role, setRole] = useState<"host" | "guest" | "spectator">(seeded?.role || "spectator");
  const [loading, setLoading] = useState(!seeded?.room);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If we already got a room+role from Lobby's navigate(state), skip the
    // extra network call. Otherwise (direct link, page refresh, browser
    // back/forward) fetch/attach to the room now.
    if (seeded?.room || !roomCode) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const player = getOrCreatePlayer();
        const { room: fetchedRoom, role: fetchedRole } = await roomManager.joinRoom(roomCode, player.name);
        if (!cancelled) {
          setRoom(fetchedRoom);
          setRole(fetchedRole);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "无法加入该房间");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  const handleLeave = () => navigate("/");

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500">
        <Loader2 className="animate-spin text-indigo-600" size={28} />
        <span className="text-sm">正在加入房间 {roomCode}...</span>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="max-w-md mx-auto bg-white border border-red-200 p-6 rounded-2xl text-center shadow-sm">
        <p className="text-red-600 text-sm mb-4">{error || "房间不存在"}</p>
        <Link
          to="/"
          className="inline-block px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition"
        >
          返回大厅
        </Link>
      </div>
    );
  }

  const gameDef = getGameDefinition(room.game_type);
  if (!gameDef) {
    return (
      <div className="bg-white border border-red-200 text-red-600 p-6 rounded-2xl text-sm">
        未知的游戏类型 "{room.game_type}"，请检查 src/games/registry.tsx 是否已注册该游戏。
      </div>
    );
  }

  const GameComponent = gameDef.component;
  return <GameComponent room={room} role={role} onLeave={handleLeave} roomManager={roomManager} />;
}
