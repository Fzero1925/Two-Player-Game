import React, { useEffect, useState } from "react";

/**
 * Shared dice component. `rolling=true` makes it cycle random faces and
 * wobble until the caller flips it back to false with the final `value`.
 * Any game that needs a dice should use this instead of drawing its own.
 */
interface DiceProps {
  value: number | null;
  rolling: boolean;
  size?: number;
}

const PIP_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[30, 30], [50, 50], [70, 70]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
  6: [[30, 25], [70, 25], [30, 50], [70, 50], [30, 75], [70, 75]],
};

/**
 * Resolves after a random 1–3s delay — the intended "rolling" duration.
 * Call this while `rolling=true` is passed to <Dice/>, then compute the
 * real dice result and flip `rolling` back to false.
 */
export function rollWithAnimation(): Promise<void> {
  const duration = 1000 + Math.random() * 2000; // 1–3 seconds
  return new Promise((resolve) => setTimeout(resolve, duration));
}

export default function Dice({ value, rolling, size = 48 }: DiceProps) {
  const [face, setFace] = useState(value ?? 1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (!rolling) {
      if (value !== null) setFace(value);
      return;
    }
    const interval = setInterval(() => {
      setFace(1 + Math.floor(Math.random() * 6));
      setRotation((r) => r + 70 + Math.random() * 110);
    }, 90);
    return () => clearInterval(interval);
  }, [rolling, value]);

  const pips = PIP_POSITIONS[face] || PIP_POSITIONS[1];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 112"
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id="dice-face" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <radialGradient id="dice-pip" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#4338ca" />
        </radialGradient>
      </defs>

      <g
        style={{
          transform: `rotate(${rotation}deg) scale(${rolling ? 0.92 : 1})`,
          transformOrigin: "50px 50px",
          transition: rolling ? "transform 0.12s linear" : "transform 0.25s ease-out",
        }}
      >
        {/* 投影：骰子悬空一点点，落在按钮上的阴影 */}
        <ellipse cx="52" cy="106" rx="34" ry="5" fill="black" opacity="0.15" />

        {/* 厚度边：右下方露出一条"侧面"，制造立方体的厚度错觉 */}
        <rect x="12" y="12" width="88" height="88" rx="18" fill="#c7d2fe" />

        {/* 正面：渐变面板，左上亮右下暗，模拟光源打在骰面上 */}
        <rect x="6" y="6" width="88" height="88" rx="18" fill="url(#dice-face)" stroke="#c7d2fe" strokeWidth="2.5" />

        {/* 内侧高光边，增强"这是一个有厚度的实体"的感觉 */}
        <rect x="10" y="10" width="80" height="34" rx="14" fill="white" opacity="0.5" />

        {pips.map(([cx, cy], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy + 1.2} r="8" fill="black" opacity="0.12" />
            <circle cx={cx} cy={cy} r="8" fill="url(#dice-pip)" />
            <circle cx={cx - 2} cy={cy - 2} r="2.4" fill="white" opacity="0.6" />
          </g>
        ))}
      </g>
    </svg>
  );
}
