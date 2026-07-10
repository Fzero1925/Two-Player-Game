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
      viewBox="0 0 100 100"
      style={{
        transform: `rotate(${rotation}deg) scale(${rolling ? 0.92 : 1})`,
        transition: rolling ? "transform 0.12s linear" : "transform 0.25s ease-out",
      }}
    >
      <rect x="6" y="6" width="88" height="88" rx="18" fill="white" stroke="#c7d2fe" strokeWidth="5" />
      {pips.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="8" fill="#4f46e5" />
      ))}
    </svg>
  );
}
