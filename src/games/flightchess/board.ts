/**
 * 飞行棋（简化双色版）棋盘常量。
 *
 * 设计说明（重要，和经典实体飞行棋的十字棋盘不一样，是简化版）：
 * - 共享环形跑道 24 格（TRACK_LENGTH），两人共用。
 * - host 从跑道第 0 格起飞，guest 从跑道第 12 格起飞（正好错开半圈，公平）。
 * - 每人还有一段私有的"到家小路"（HOME_STRETCH_LENGTH 格），跑完共享环形跑道后
 *   拐进自己专属的小路，不会和对方相遇，也不会被撞。
 * - 每颗棋子的位置用 "step"（相对自己起飞点已经走了几步）表示：
 *     step === -1        还在营地，没起飞
 *     0 <= step < 24      在共享跑道上，实际格子 = (起飞点 + step) % 24
 *     24 <= step < 30     在自己的专属到家小路上
 *     step === 29 (最后一步) 到家，完成
 */

export const TRACK_LENGTH = 24;
export const HOME_STRETCH_LENGTH = 6;
export const TOTAL_PATH_LENGTH = TRACK_LENGTH + HOME_STRETCH_LENGTH; // 30
export const PIECES_PER_PLAYER = 4;

export type PlayerRole = "host" | "guest";

export const START_INDEX: Record<PlayerRole, number> = {
  host: 0,
  guest: 12,
};

// 起飞格是安全格，落在这里不会被对方棋子撞回营地。
export const SAFE_CELLS: number[] = [START_INDEX.host, START_INDEX.guest];
