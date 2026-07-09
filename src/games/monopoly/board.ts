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
}

const PROPERTY_NAMES = [
  "青云路", "望海街", "锦绣里", "星辉大道", "泉水巷",
  "梧桐街", "紫金路", "云端里", "长虹大道", "翠湖街",
  "沉香巷", "临风路", "金穗大道", "碧波里",
];

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
      const tile: Tile = {
        index,
        type,
        name: PROPERTY_NAMES[propertyIdx] || `地产${propertyIdx + 1}`,
        price,
        rent,
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
