/**
 * 大富翁机会卡牌数据。纯数据文件，不含 React、不 import 任何 .tsx。
 *
 * 设计上刻意保持简单：
 * - 卡牌效果只有"改变现金"和"传送到指定格子（可选领取过起点奖金）"两种，
 *   不会递归触发目标格子的效果（比如传送到别人地产不用付租金）——这是为了
 *   避免"机会卡传送到另一张机会卡格子"这类连锁/死循环的复杂度，符合本项目
 *   一贯的 MVP 取舍风格。以后如果想做递归效果，可以单独讨论。
 */

import { JAIL_TILE_INDEX } from "./board.js";

export interface ChanceEffect {
  /** 现金变化，正数为获得，负数为支付。 */
  cashDelta?: number;
  /** 传送到的目标格子下标（绝对位置）。 */
  moveTo?: number;
  /** moveTo 存在时，是否额外发放一次过起点奖金（不判断是否真的"经过"了起点，卡面写了就发）。 */
  grantPassGoBonus?: boolean;
}

export interface ChanceCard {
  id: string;
  text: string;
  effect: ChanceEffect;
}

export const CHANCE_CARDS: ChanceCard[] = [
  { id: "dividend_small", text: "银行发放股息，获得 50 元。", effect: { cashDelta: 50 } },
  { id: "dividend_big", text: "投资眼光独到，获得 150 元。", effect: { cashDelta: 150 } },
  { id: "birthday", text: "今天是你的生日，大家凑份子，获得 80 元。", effect: { cashDelta: 80 } },
  { id: "fine_small", text: "违章停车，罚款 50 元。", effect: { cashDelta: -50 } },
  { id: "fine_big", text: "税务稽查不合格，罚款 100 元。", effect: { cashDelta: -100 } },
  { id: "repair", text: "房屋维修费，支付 70 元。", effect: { cashDelta: -70 } },
  { id: "to_go", text: "前进到起点，领取过起点奖金。", effect: { moveTo: 0, grantPassGoBonus: true } },
  { id: "to_jail", text: "直接进监狱探访格（不用缴纳罚款，也不算被捕）。", effect: { moveTo: JAIL_TILE_INDEX } },
];

export function drawChanceCard(): ChanceCard {
  return CHANCE_CARDS[Math.floor(Math.random() * CHANCE_CARDS.length)];
}
