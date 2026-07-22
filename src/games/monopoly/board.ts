/**
 * Monopoly (简化版大富翁) board layout.
 * 24 tiles, fixed rent (no house/hotel upgrades — per spec).
 *
 * This file is intentionally pure data. All game logic lives in logic.ts.
 */

export type TileType =
  | "go"
  | "property"
  | "chance"
  | "tax"
  | "jail"
  | "free_parking"
  | "go_to_jail";

export interface Tile {
  index: number;
  type: TileType;
  name: string;
  price?: number; // property only
  rent?: number; // property only, fixed rent
  taxAmount?: number; // tax only
  /** property only — which color group this belongs to, for the classic
   *  Monopoly-style color-banded board UI (see COLOR_GROUPS below). */
  colorGroup?: string;
}

const PROPERTY_NAMES = [
  "青云路", "望海街", "锦绣里", "星辉大道", "泉水巷",
  "梧桐街", "紫金路", "云端里", "长虹大道", "翠湖街",
  "沉香巷", "临风路", "金穗大道", "碧波里",
];

/**
 * Classic Monopoly boards group properties into color bands (brown, light
 * blue, pink, orange...) that go up in price as you go around the board.
 * We have 14 properties here — grouped into pairs in board order, cycling
 * through 7 colors. Tailwind class names are defined once here (not
 * scattered across the UI file) so the palette is easy to retune later.
 */
export const COLOR_GROUPS: Record<string, { bar: string; bg: string; border: string; edge: string; label: string }> = {
  brown: { bar: "bg-amber-700", bg: "bg-amber-100", border: "border-amber-300", edge: "border-b-amber-800", label: "棕色地产" },
  cyan: { bar: "bg-cyan-500", bg: "bg-cyan-100", border: "border-cyan-300", edge: "border-b-cyan-700", label: "浅蓝地产" },
  pink: { bar: "bg-pink-500", bg: "bg-pink-100", border: "border-pink-300", edge: "border-b-pink-700", label: "粉色地产" },
  orange: { bar: "bg-orange-500", bg: "bg-orange-100", border: "border-orange-300", edge: "border-b-orange-700", label: "橙色地产" },
  red: { bar: "bg-red-500", bg: "bg-red-100", border: "border-red-300", edge: "border-b-red-700", label: "红色地产" },
  yellow: { bar: "bg-yellow-500", bg: "bg-yellow-100", border: "border-yellow-300", edge: "border-b-yellow-600", label: "黄色地产" },
  green: { bar: "bg-emerald-600", bg: "bg-emerald-100", border: "border-emerald-300", edge: "border-b-emerald-800", label: "绿色地产" },
};
const COLOR_GROUP_ORDER = ["brown", "cyan", "pink", "orange", "red", "yellow", "green"];

/**
 * 3D棋盘（Board3D.tsx）用的实际十六进制色值——three.js 的材质要真实颜色，
 * 不能直接吃 Tailwind class 字符串。这里的每个色值都对应上面 Tailwind
 * class 用的同一个色号（比如 amber-700 = #b45309），保证2D/3D两个版本
 * 看起来是同一套配色体系，不是两套视觉语言。
 */
export const COLOR_HEX: Record<string, { top: string; side: string; owned: { host: string; guest: string } }> = {
  brown: { top: "#f59e0b", side: "#b45309", owned: { host: "#4338ca", guest: "#b45309" } },
  cyan: { top: "#22d3ee", side: "#0e7490", owned: { host: "#4338ca", guest: "#b45309" } },
  pink: { top: "#f472b6", side: "#be185d", owned: { host: "#4338ca", guest: "#b45309" } },
  orange: { top: "#fb923c", side: "#c2410c", owned: { host: "#4338ca", guest: "#b45309" } },
  red: { top: "#f87171", side: "#b91c1c", owned: { host: "#4338ca", guest: "#b45309" } },
  yellow: { top: "#facc15", side: "#a16207", owned: { host: "#4338ca", guest: "#b45309" } },
  green: { top: "#34d399", side: "#047857", owned: { host: "#4338ca", guest: "#b45309" } },
};

export const TILE_TYPE_HEX: Partial<Record<TileType, { top: string; side: string }>> = {
  go: { top: "#2dd4bf", side: "#0f766e" },
  chance: { top: "#a78bfa", side: "#6d28d9" },
  tax: { top: "#fb7185", side: "#be123c" },
  jail: { top: "#cbd5e1", side: "#64748b" },
  free_parking: { top: "#38bdf8", side: "#0369a1" },
  go_to_jail: { top: "#fb923c", side: "#9a3412" },
};

/**
 * 非地产格（起点/机会/税务/监狱/免费停车/进监狱）也各自给一个主题色，
 * 之前这些格子是纯白/纯灰，整个棋盘看起来很单调——现在每种类型都有
 * 辨识度很强的底色，一眼就能分清格子类型，不用凑近看文字。
 * `edge` 是更深一号的同色系，用在格子底边，做出"立体方块"的厚度感。
 */
export const TILE_TYPE_ACCENT: Partial<Record<TileType, { bar: string; bg: string; border: string; edge: string }>> = {
  go: { bar: "bg-teal-500", bg: "bg-teal-100", border: "border-teal-300", edge: "border-b-teal-700" },
  chance: { bar: "bg-violet-500", bg: "bg-violet-100", border: "border-violet-300", edge: "border-b-violet-700" },
  tax: { bar: "bg-rose-500", bg: "bg-rose-100", border: "border-rose-300", edge: "border-b-rose-700" },
  jail: { bar: "bg-slate-400", bg: "bg-slate-100", border: "border-slate-300", edge: "border-b-slate-600" },
  free_parking: { bar: "bg-sky-500", bg: "bg-sky-100", border: "border-sky-300", edge: "border-b-sky-700" },
  go_to_jail: { bar: "bg-orange-600", bg: "bg-orange-200", border: "border-orange-400", edge: "border-b-orange-800" },
};

function buildBoard(): Tile[] {
  const layout: TileType[] = [
    "go", "property", "property", "chance", "tax",
    "property", "property", "property", "jail", "property",
    "property", "chance", "property", "property", "free_parking",
    "property", "property", "chance", "tax", "property",
    "go_to_jail", "property", "property", "chance",
  ];

  let propertyIdx = 0;
  return layout.map((type, index) => {
    if (type === "property") {
      const price = 120 + propertyIdx * 40; // increasing price around the board
      const rent = Math.round(price * 0.15);
      const colorGroup = COLOR_GROUP_ORDER[Math.floor(propertyIdx / 2) % COLOR_GROUP_ORDER.length];
      const tile: Tile = {
        index,
        type,
        name: PROPERTY_NAMES[propertyIdx] || `地产${propertyIdx + 1}`,
        price,
        rent,
        colorGroup,
      };
      propertyIdx += 1;
      return tile;
    }
    if (type === "tax") {
      return { index, type, name: "税务局", taxAmount: 100 };
    }
    const names: Record<string, string> = {
      go: "起点 (GO)",
      chance: "机会",
      jail: "监狱 (仅探访)",
      free_parking: "免费停车",
      go_to_jail: "进监狱",
    };
    return { index, type, name: names[type] };
  });
}

export const BOARD: Tile[] = buildBoard();
export const BOARD_SIZE = BOARD.length;
export const JAIL_TILE_INDEX = BOARD.findIndex((t) => t.type === "jail");
export const STARTING_CASH = 1500;
export const PASS_GO_BONUS = 200;
export const MAX_TURNS = 30; // per player, i.e. 30 rounds total before scoring by net worth
