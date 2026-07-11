/**
 * 飞行棋（四色版）棋盘常量。
 *
 * 设计说明（和经典实体飞行棋的十字棋盘依然不一样，是简化版，但四色化了）：
 * - 共享环形跑道 24 格（TRACK_LENGTH），四种颜色共用。
 * - 红/蓝/绿/黄 四个起飞点均匀分布在环上（每隔 6 格一个：0/6/12/18），
 *   房主（host）拥有 红+绿（正对面的两个位置），访客（guest）拥有 蓝+黄
 *   （也是正对面），这样棋盘上是 红-蓝-绿-黄 交替排列，视觉上更接近经典
 *   十字棋盘"四个玩家轮流坐一圈"的感觉，而不是像双色版那样各占半圈。
 * - 每人仍然只有一次真实回合（还是 host/guest 两个人在玩，不是四人游戏）——
 *   区别是每人这一回合里，8颗棋子（自己的2个颜色 × 4颗）里任选一颗能走的动，
 *   策略上多了"先冲哪个颜色"的选择。
 * - 每种颜色还有一段私有的"到家小路"（HOME_STRETCH_LENGTH 格），跑完共享环形
 *   跑道后拐进自己专属的小路，不会和别的颜色相遇。
 * - 每颗棋子的位置用 "step"（相对自己颜色起飞点已经走了几步）表示：
 *     step === -1        还在营地，没起飞
 *     0 <= step < 24      在共享跑道上，实际格子 = (该颜色起飞点 + step) % 24
 *     24 <= step < 30     在该颜色专属的到家小路上
 *     step === 29 (最后一步) 到家，完成
 */

export const TRACK_LENGTH = 24;
export const HOME_STRETCH_LENGTH = 6;
export const TOTAL_PATH_LENGTH = TRACK_LENGTH + HOME_STRETCH_LENGTH; // 30
export const PIECES_PER_COLOR = 4;

export type PlayerRole = "host" | "guest";
export type PieceColor = "red" | "blue" | "green" | "yellow";

export const COLORS: PieceColor[] = ["red", "blue", "green", "yellow"];

export const COLOR_START_INDEX: Record<PieceColor, number> = {
  red: 0,
  blue: 6,
  green: 12,
  yellow: 18,
};

// 房主拿红+绿（正对面），访客拿蓝+黄（正对面）——环上是 红-蓝-绿-黄 交替。
export const COLOR_OWNER: Record<PieceColor, PlayerRole> = {
  red: "host",
  blue: "guest",
  green: "host",
  yellow: "guest",
};

export const ROLE_COLORS: Record<PlayerRole, PieceColor[]> = {
  host: ["red", "green"],
  guest: ["blue", "yellow"],
};

export const COLOR_LABEL: Record<PieceColor, string> = {
  red: "红",
  blue: "蓝",
  green: "绿",
  yellow: "黄",
};

// 四个颜色的球体棋子渐变配色（浅/中/深/最深），喂给 <Token shades={...} /> 用。
export const COLOR_SHADES: Record<PieceColor, { light: string; mid: string; dark: string; darkest: string }> = {
  red: { light: "#fecaca", mid: "#ef4444", dark: "#b91c1c", darkest: "#7f1d1d" },
  blue: { light: "#bfdbfe", mid: "#3b82f6", dark: "#1d4ed8", darkest: "#1e3a8a" },
  green: { light: "#bbf7d0", mid: "#22c55e", dark: "#15803d", darkest: "#14532d" },
  yellow: { light: "#fef08a", mid: "#eab308", dark: "#a16207", darkest: "#713f12" },
};

// 起飞格是安全格，落在这里不会被对方棋子撞回营地。四色版有四个安全格。
export const SAFE_CELLS: number[] = COLORS.map((c) => COLOR_START_INDEX[c]);
