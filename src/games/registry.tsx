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
// 你画我猜暂时从大厅隐藏（AI猜画功能依赖 server.ts 的 Express 路由，在 Vercel
// 无服务器环境下跑不起来；联机手绘同步本身没问题，但先不在大厅展示，等决定好
// 要不要把AI识别迁移成 Serverless Function 再恢复）。组件和数据都还在，随时能加回来。
// import PictionaryGame from "../components/PictionaryGame.js";
import MonopolyGame from "./monopoly/MonopolyGame.js";
import FlightChessGame from "./flightchess/FlightChessGame.js";
import MemoryMatchGame from "./memorymatch/MemoryMatchGame.js";
import { Grid3x3, Landmark, Plane, Grid2x2 } from "lucide-react";

export interface GameComponentProps {
  room: any;
  role: "host" | "guest" | "spectator";
  onLeave: () => void;
  roomManager: any;
}

/** Per-game color identity for the lobby card — keeps each game visually
 *  distinct instead of every card wearing the same indigo badge. */
export interface GameAccent {
  iconBg: string; // icon chip background
  iconFg: string; // icon glyph color
  badgeBg: string;
  badgeFg: string;
  cardHoverBorder: string;
  cornerGlow: string; // the soft gradient blob in the card's top-right corner
  buttonBg: string;
  buttonHoverBg: string;
}

export interface GameUIDefinition {
  id: string;
  name: string;
  /** Icon component shown in the card's icon chip — a real icon now, not a single CJK glyph. */
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  badge: string;
  description: string;
  accent: GameAccent;
  component: React.ComponentType<GameComponentProps>;
}

export const GAME_UI_REGISTRY: GameUIDefinition[] = [
  {
    id: "gomoku",
    name: "五子棋 (Gomoku)",
    Icon: Grid3x3,
    badge: "联机对局",
    description:
      "经典 15×15 棋盘五子棋。双人实时下子、先达成五子连珠者获胜。支持玩家在线状态识别与防断网保护。",
    accent: {
      iconBg: "bg-stone-800",
      iconFg: "text-stone-50",
      badgeBg: "bg-stone-100",
      badgeFg: "text-stone-600",
      cardHoverBorder: "hover:border-stone-400/40",
      cornerGlow: "from-stone-500/10",
      buttonBg: "bg-stone-800",
      buttonHoverBg: "hover:bg-stone-900",
    },
    component: GomokuGame,
  },
  // 你画我猜暂时隐藏，见上方 import 处的说明。恢复时把这一项和上面的 import 一起取消注释即可。
  // {
  //   id: "pictionary",
  //   name: "你画我猜 (Pictionary)",
  //   Icon: Palette,
  //   badge: "联机对局",
  //   description:
  //     "支持实时手绘板同步、画笔颜色与粗细调节、多人聊天室实时猜测。单人练习模式更提供智能 AI (Gemini) 实时图像辨认与精准猜测！",
  //   accent: { iconBg: "bg-pink-500", iconFg: "text-white", badgeBg: "bg-pink-50", badgeFg: "text-pink-600", cardHoverBorder: "hover:border-pink-400/40", cornerGlow: "from-pink-500/10", buttonBg: "bg-pink-500", buttonHoverBg: "hover:bg-pink-600" },
  //   component: PictionaryGame,
  // },
  {
    id: "monopoly",
    name: "简化版大富翁",
    Icon: Landmark,
    badge: "3D 棋盘",
    description:
      "24格环形跑道，双骰掷点买地收租、双数可再掷一次。集齐同色地产租金翻倍，机会卡随机事件，现金不够时可以卖地补差额、不会一次周转不开就出局。",
    accent: {
      iconBg: "bg-emerald-600",
      iconFg: "text-white",
      badgeBg: "bg-emerald-50",
      badgeFg: "text-emerald-700",
      cardHoverBorder: "hover:border-emerald-500/40",
      cornerGlow: "from-emerald-500/10",
      buttonBg: "bg-emerald-600",
      buttonHoverBg: "hover:bg-emerald-700",
    },
    component: MonopolyGame,
  },
  {
    id: "flightchess",
    name: "飞行棋（四色版）",
    Icon: Plane,
    badge: "3D 棋盘",
    description:
      "房主控制红/绿两色，访客控制蓝/黄两色，每人8颗棋子任选着走。掷1或6起飞，掷6可再掷一次（连续3次作废），撞子送回营地，四色棋子在环形跑道上交替起飞。",
    accent: {
      iconBg: "bg-violet-600",
      iconFg: "text-white",
      badgeBg: "bg-violet-50",
      badgeFg: "text-violet-700",
      cardHoverBorder: "hover:border-violet-500/40",
      cornerGlow: "from-violet-500/10",
      buttonBg: "bg-violet-600",
      buttonHoverBg: "hover:bg-violet-700",
    },
    component: FlightChessGame,
  },
  {
    id: "memorymatch",
    name: "翻牌配对",
    Icon: Grid2x2,
    badge: "联机对局",
    description:
      "4×4共16张牌，双方轮流翻两张找配对。配对成功计分并可以再翻一次，配对数多的一方获胜。规则简单，一局几分钟，适合快速来一把。",
    accent: {
      iconBg: "bg-rose-500",
      iconFg: "text-white",
      badgeBg: "bg-rose-50",
      badgeFg: "text-rose-700",
      cardHoverBorder: "hover:border-rose-500/40",
      cornerGlow: "from-rose-500/10",
      buttonBg: "bg-rose-500",
      buttonHoverBg: "hover:bg-rose-600",
    },
    component: MemoryMatchGame,
  },
];

export function getGameDefinition(id: string): GameUIDefinition | undefined {
  return GAME_UI_REGISTRY.find((g) => g.id === id);
}
