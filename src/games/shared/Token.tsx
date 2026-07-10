import React from "react";

interface TokenProps {
  role: "host" | "guest";
  label?: number | string;
  size?: number;
}

const ROLE_FILL: Record<string, string> = { host: "#6366f1", guest: "#f59e0b" };
const ROLE_FILL_DARK: Record<string, string> = { host: "#4338ca", guest: "#b45309" };

/**
 * A simple rounded "chibi" token — a body + a highlight, so it reads as a
 * little character rather than a flat dot. If you generate real character
 * art later (see PROJECT_GUIDE.md image-prompt notes), swap the <svg> body
 * here for an <image> tag pointing at the generated asset; every call site
 * that renders <Token /> updates automatically.
 */
export default function Token({ role, label, size = 20 }: TokenProps) {
  const fill = ROLE_FILL[role];
  const darkFill = ROLE_FILL_DARK[role];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ overflow: "visible" }}>
      <ellipse cx="20" cy="34" rx="10" ry="3" fill="black" opacity="0.12" />
      <circle cx="20" cy="19" r="15" fill={fill} stroke="white" strokeWidth="2.5" />
      <circle cx="15" cy="14" r="4" fill="white" opacity="0.35" />
      {label !== undefined && (
        <text x="20" y="24" textAnchor="middle" fontSize="13" fontWeight="700" fill="white">
          {label}
        </text>
      )}
      <circle cx="20" cy="19" r="15" fill="none" stroke={darkFill} strokeWidth="1" opacity="0.3" />
    </svg>
  );
}
