import React, { useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getOrCreatePlayer, roomManager } from "../lib/roomManager.js";
import { getGameDefinition } from "../games/registry.js";
import { getInitialGameState, isValidGameType } from "../games/definitions.js";
import { Room } from "../types.js";

export default function PracticeScreen() {
  const { gameType } = useParams<{ gameType: string }>();
  const navigate = useNavigate();

  const room = useMemo<Room | null>(() => {
    if (!gameType || !isValidGameType(gameType)) return null;
    const p = getOrCreatePlayer();
    return {
      room_code: "SINGLE",
      game_type: gameType,
      status: "waiting",
      players: {
        host: { id: p.id, name: p.name, online: true, last_seen: Date.now(), ready: false },
        guest: { id: "AI_BOT", name: "智能 AI (电脑)", online: true, last_seen: Date.now(), ready: true },
      },
      game_state: getInitialGameState(gameType),
    };
    // Intentionally built once per mount — refreshing /practice/:gameType
    // starts a fresh single-player session, which is the expected behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameType]);

  const handleLeave = () => navigate("/");

  if (!room) {
    return (
      <div className="max-w-md mx-auto bg-white border border-red-200 p-6 rounded-2xl text-center shadow-sm">
        <p className="text-red-600 text-sm mb-4">未知的游戏类型 "{gameType}"</p>
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
  return <GameComponent room={room} role="host" onLeave={handleLeave} roomManager={roomManager} />;
}
