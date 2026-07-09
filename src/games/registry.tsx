/**
 * ============================================================
 * UI GAME REGISTRY
 * ============================================================
 *
 * This is the ONE place App.tsx looks at to know:
 *  - which games to show as cards in the lobby
 *  - which React component to render for a given room.game_type
 *
 * HOW TO ADD A NEW GAME (UI side)
 * ---------------------------------
 * 1. Make sure you've already added a data definition in
 *    src/games/definitions.ts (getInitialGameState).
 * 2. Build your game component in src/components/YourGame.tsx.
 *    Props contract (match this exactly, extra props are fine to ignore):
 *      { room: Room; role: "host" | "guest" | "spectator";
 *        onLeave: () => void; roomManager: typeof roomManager }
 * 3. Import your component below and add one entry to GAME_UI_REGISTRY.
 * 4. Done. Do NOT edit App.tsx's lobby JSX or routing switch — they
 *    already read from this array/map generically.
 */

import React from "react";
import GomokuGame from "../components/GomokuGame.js";
import PictionaryGame from "../components/PictionaryGame.js";
import MonopolyGame from "./monopoly/MonopolyGame.js";
import FlightChessGame from "./flightchess/FlightChessGame.js";

export interface GameComponentProps {
  room: any;
  role: "host" | "guest" | "spectator";
  onLeave: () => void;
  roomManager: any;
}

export interface GameUIDefinition {
  id: string;
  name: string;
  /** Short glyph shown in the small icon badge on the lobby card. */
  icon: string;
  badge: string;
  description: string;
  component: React.ComponentType<GameComponentProps>;
}

export const GAME_UI_REGISTRY: GameUIDefinition[] = [
  {
    id: "gomoku",
    name: "五子棋 (Gomoku)",
    icon: "五",
    badge: "联机对局",
    description:
      "经典 15×15 棋盘五子棋。双人实时下子、先达成五子连珠者获胜。支持玩家在线状态识别与防断网保护。",
    component: GomokuGame,
  },
  {
    id: "pictionary",
    name: "你画我猜 (Pictionary)",
    icon: "画",
    badge: "联机对局",
    description:
      "支持实时手绘板同步、画笔颜色与粗细调节、多人聊天室实时猜测。单人练习模式更提供智能 AI (Gemini) 实时图像辨认与精准猜测！",
    component: PictionaryGame,
  },
  {
    id: "monopoly",
    name: "简化版大富翁",
    icon: "富",
    badge: "联机对局",
    description:
      "24格环形跑道，掷骰子买地收租金，租金固定不涨、无需盖房升级，节奏更快。含机会格（卡牌效果开发中）。",
    component: MonopolyGame,
  },
  {
    id: "flightchess",
    name: "飞行棋（双色版）",
    icon: "飞",
    badge: "联机对局",
    description:
      "每人4颗棋子，掷到1或6才能起飞，撞子送回营地，起飞格安全不会被撞。先让4颗棋子都到家的一方获胜。",
    component: FlightChessGame,
  },
];

export function getGameDefinition(id: string): GameUIDefinition | undefined {
  return GAME_UI_REGISTRY.find((g) => g.id === id);
}
