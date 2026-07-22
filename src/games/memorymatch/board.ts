/**
 * 翻牌配对（记忆配对）棋盘常量。纯数据，不含 React。
 *
 * 玩法：4x4 共 16 张牌（8 组配对），初始全部背面朝上。两人轮流翻牌：
 * 每回合翻两张——配对成功就计一分、而且可以继续翻（奖励回合，经典翻牌
 * 配对游戏规则）；配对失败，两张牌盖回去，轮到对方。16张牌全部配对完
 * 结束，比谁配对数多。
 */

export type PlayerRole = "host" | "guest";

export const GRID_SIZE = 4;
export const CARD_COUNT = GRID_SIZE * GRID_SIZE; // 16
export const PAIR_COUNT = CARD_COUNT / 2; // 8

// 8 组图案——用可爱动物表情，视觉上区分度高，不需要任何外部图片素材。
export const SYMBOLS = ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼"];

// 展示两张不配对的牌多久之后自动翻回背面（毫秒）。
export const MISMATCH_REVEAL_MS = 1100;
// 单人模式下 AI 每次翻牌之间的"思考"停顿（毫秒），避免瞬间翻完。
export const AI_THINK_MS = 650;

export function cellPosition(index: number): { row: number; col: number } {
  return { row: Math.floor(index / GRID_SIZE) + 1, col: (index % GRID_SIZE) + 1 };
}

/** Fisher-Yates 洗牌，生成 16 张牌的随机符号序列（每个符号恰好出现2次）。 */
export function shuffledSymbols(): string[] {
  const deck = [...SYMBOLS, ...SYMBOLS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
