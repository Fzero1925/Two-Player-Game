import React from "react";
import Token from "../games/shared/Token.js";
import { COLOR_SHADES } from "../games/flightchess/board.js";

/**
 * 首页 Hero 区的"签名视觉"——不是随便找的装饰图案，而是直接复用游戏里真实的
 * 立体棋子组件（跟大富翁/飞行棋棋盘上跑的是同一个 <Token/>），只是摆成一小簇
 * 悬浮的彩色球体。让首页第一眼看到的东西，就是"你等下要玩的这些棋子"本身，
 * 而不是一张和产品无关的插画。
 *
 * 悬浮动效复用了 index.css 里的 token-float 关键帧，每颗棋子给了不同的
 * animationDelay/duration，让整簇棋子看起来是自然漂浮而不是齐步走。
 */
const CLUSTER_TOKENS: Array<{
  shades: { light: string; mid: string; dark: string; darkest: string };
  size: number;
  top: string;
  left: string;
  delay: string;
  duration: string;
}> = [
  { shades: COLOR_SHADES.red, size: 44, top: "6%", left: "18%", delay: "0s", duration: "2.6s" },
  { shades: { light: "#e0e7ff", mid: "#6366f1", dark: "#4338ca", darkest: "#312e81" }, size: 60, top: "38%", left: "2%", delay: "0.4s", duration: "3.1s" },
  { shades: COLOR_SHADES.yellow, size: 36, top: "68%", left: "22%", delay: "0.9s", duration: "2.3s" },
  { shades: COLOR_SHADES.green, size: 50, top: "2%", left: "62%", delay: "0.2s", duration: "2.9s" },
  { shades: { light: "#fef3c7", mid: "#f59e0b", dark: "#b45309", darkest: "#78350f" }, size: 40, top: "60%", left: "82%", delay: "0.6s", duration: "2.5s" },
  { shades: COLOR_SHADES.blue, size: 30, top: "30%", left: "88%", delay: "1.1s", duration: "2.2s" },
];

export default function TokenCluster({ className = "" }: { className?: string }) {
  return (
    <div className={`relative pointer-events-none select-none ${className}`} aria-hidden="true">
      {CLUSTER_TOKENS.map((t, i) => (
        <div
          key={i}
          className="absolute token-float drop-shadow-lg"
          style={{ top: t.top, left: t.left, animationDelay: t.delay, animationDuration: t.duration }}
        >
          <Token role="host" shades={t.shades} size={t.size} />
        </div>
      ))}
    </div>
  );
}
