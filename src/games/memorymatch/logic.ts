import { CARD_COUNT, PAIR_COUNT, shuffledSymbols, PlayerRole } from "./board.js";

export interface Card {
  symbol: string;
  matchedBy: PlayerRole | null;
}

export interface MemoryMatchState {
  cards: Card[]; // length CARD_COUNT
  /** 本回合已经翻开、还没结算的牌的下标（0、1，或2张——2张时代表"配对失败，
   *  等着被盖回去"这个待结算的中间状态）。 */
  revealed: number[];
  /** revealed.length === 2 且不配对时才会是 true——用来告诉UI"现在显示的这两张
   *  牌本回合翻完了但还没盖回去，等一小段时间自动盖回、换人"。 */
  pendingFlipBack: boolean;
  currentTurn: PlayerRole;
  scores: Record<PlayerRole, number>;
  lastEvent: string | null;
  winner: PlayerRole | "draw" | null;
}

function otherRole(role: PlayerRole): PlayerRole {
  return role === "host" ? "guest" : "host";
}

function roleLabel(role: PlayerRole): string {
  return role === "host" ? "房主" : "访客";
}

export function getInitialMemoryMatchState(): MemoryMatchState {
  const symbols = shuffledSymbols();
  return {
    cards: symbols.map((symbol) => ({ symbol, matchedBy: null })),
    revealed: [],
    pendingFlipBack: false,
    currentTurn: "host",
    scores: { host: 0, guest: 0 },
    lastEvent: "游戏开始！轮到 host 翻牌，找到配对可以再翻一次。",
    winner: null,
  };
}

function checkWin(state: MemoryMatchState): MemoryMatchState {
  const allMatched = state.cards.every((c) => c.matchedBy !== null);
  if (!allMatched) return state;
  const { host, guest } = state.scores;
  const winner: PlayerRole | "draw" = host === guest ? "draw" : host > guest ? "host" : "guest";
  const event =
    winner === "draw"
      ? `全部配对完成，${host} : ${guest} 平局！`
      : `全部配对完成，${roleLabel(winner)} 以 ${state.scores[winner]} : ${
          state.scores[otherRole(winner)]
        } 获胜！`;
  return { ...state, winner, lastEvent: event };
}

/**
 * 翻开一张牌。规则里"翻两张"这个动作分两次调用：
 *  - revealed 从0张到1张：只是记录翻开了第一张，等对方/自己继续翻第二张。
 *  - revealed 从1张到2张：立即判断配对——配对成功直接结算（加分、清空
 *    revealed、不换人，可以继续翻）；配对失败则把这两张牌的下标留在
 *    revealed 里、置 pendingFlipBack=true，让 UI 稍等一下再调用
 *    `resolveMismatch` 把牌盖回去、换人。这个"稍等一下"是纯前端的
 *    setTimeout，不需要在 state 里存时间戳。
 */
export function flipCard(state: MemoryMatchState, role: PlayerRole, cardIndex: number): MemoryMatchState {
  if (state.winner || state.currentTurn !== role) return state;
  if (state.pendingFlipBack) return state; // 上一次配对失败还没盖回去，不能再翻
  if (state.revealed.length >= 2) return state;
  const card = state.cards[cardIndex];
  if (!card || card.matchedBy !== null) return state;
  if (state.revealed.includes(cardIndex)) return state;

  const revealed = [...state.revealed, cardIndex];

  if (revealed.length === 1) {
    return { ...state, revealed, lastEvent: `${roleLabel(role)} 翻开了一张牌。` };
  }

  // 第二张——立即判断配对
  const [firstIdx, secondIdx] = revealed;
  const isMatch = state.cards[firstIdx].symbol === state.cards[secondIdx].symbol;

  if (isMatch) {
    const cards = state.cards.map((c, i) => (i === firstIdx || i === secondIdx ? { ...c, matchedBy: role } : c));
    let nextState: MemoryMatchState = {
      ...state,
      cards,
      revealed: [],
      pendingFlipBack: false,
      scores: { ...state.scores, [role]: state.scores[role] + 1 },
      lastEvent: `${roleLabel(role)} 配对成功！可以继续翻牌。`,
    };
    return checkWin(nextState);
  }

  return {
    ...state,
    revealed,
    pendingFlipBack: true,
    lastEvent: `${roleLabel(role)} 没有配对成功，稍后轮到对方。`,
  };
}

/**
 * 配对失败一小段时间后调用——把两张牌盖回去、轮到对方。
 * 只应该由"当前回合玩家"的客户端调用（跟AI回合的模式一致），避免双方客户端
 * 同时各自触发一次，导致重复推进状态。
 */
export function resolveMismatch(state: MemoryMatchState, role: PlayerRole): MemoryMatchState {
  if (!state.pendingFlipBack || state.currentTurn !== role) return state;
  return {
    ...state,
    revealed: [],
    pendingFlipBack: false,
    currentTurn: otherRole(role),
  };
}

export { CARD_COUNT, PAIR_COUNT };
export type { PlayerRole };
