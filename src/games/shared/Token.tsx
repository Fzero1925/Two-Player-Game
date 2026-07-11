import React, { useId } from "react";

interface TokenProps {
  role: "host" | "guest";
  label?: number | string;
  size?: number;
  /** 可选：直接指定一套渐变色阶，覆盖 role 默认的配色（飞行棋四色版用这个，
   *  因为一个 role 现在对应2种颜色，光靠 role 已经区分不出具体是哪个颜色了）。 */
  shades?: { light: string; mid: string; dark: string; darkest: string };
}

// 三档色阶（亮/中/暗）用来做球体的径向渐变着色，比之前"纯色+一个高光圆"更接近
// 真实光照下的球体质感（亮部/中间调/暗部/边缘反光，经典的"三点布光"配色思路）。
const ROLE_SHADES: Record<TokenProps["role"], { light: string; mid: string; dark: string; darkest: string }> = {
  host: { light: "#e0e7ff", mid: "#6366f1", dark: "#4338ca", darkest: "#312e81" },
  guest: { light: "#fef3c7", mid: "#f59e0b", dark: "#b45309", darkest: "#78350f" },
};

/**
 * 立体球形棋子——纯 SVG 渐变实现，不依赖任何外部图片/three.js：
 *  - 球体本体：径向渐变（左上亮 → 中间本色 → 右下暗），模拟光源打在球面上的效果
 *  - 高光：左上角一小块半透明白色高光，模拟反光点
 *  - 底部基座：一个扁椭圆片，让棋子看起来"立"在格子上，而不是贴纸一样飘着
 *  - 投影：基座下方再叠一层模糊阴影，加强"离开桌面一点"的悬浮感
 * 小尺寸（16-22px）下也能保持清晰，没有用细长的"棋子身体"这种在小尺寸会糊掉的造型。
 */
export default function Token({ role, label, size = 20, shades }: TokenProps) {
  const uid = useId().replace(/[:]/g, "");
  const s = shades ?? ROLE_SHADES[role];
  const sphereGradId = `token-sphere-${role}-${uid}`;
  const baseGradId = `token-base-${role}-${uid}`;

  return (
    <svg width={size} height={size} viewBox="0 0 40 44" style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={sphereGradId} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor={s.light} />
          <stop offset="45%" stopColor={s.mid} />
          <stop offset="100%" stopColor={s.dark} />
        </radialGradient>
        <linearGradient id={baseGradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={s.dark} />
          <stop offset="100%" stopColor={s.darkest} />
        </linearGradient>
      </defs>

      {/* 投影：模拟棋子悬空一点点，落在格子上的阴影 */}
      <ellipse cx="20" cy="40" rx="11" ry="2.6" fill="black" opacity="0.18" />

      {/* 底座：扁椭圆片，让棋子有"站立"的支撑感 */}
      <ellipse cx="20" cy="35" rx="10" ry="3.2" fill={`url(#${baseGradId})`} />
      <ellipse cx="20" cy="34" rx="10" ry="3.2" fill={s.dark} opacity="0.9" />

      {/* 球体本体 */}
      <circle cx="20" cy="19" r="15.5" fill={`url(#${sphereGradId})`} />

      {/* 高光：左上角的反光点 */}
      <ellipse cx="14" cy="12" rx="4.5" ry="3" fill="white" opacity="0.55" transform="rotate(-25 14 12)" />
      <ellipse cx="13" cy="11" rx="1.8" ry="1.1" fill="white" opacity="0.75" transform="rotate(-25 13 11)" />

      {/* 细边框，让球体边缘更清晰 */}
      <circle cx="20" cy="19" r="15.5" fill="none" stroke={s.darkest} strokeWidth="1" opacity="0.35" />

      {label !== undefined && (
        <text
          x="20"
          y="24"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="white"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
        >
          {label}
        </text>
      )}
    </svg>
  );
}
