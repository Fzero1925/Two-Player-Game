import {
  BOARD,
  BOARD_SIZE,
  JAIL_TILE_INDEX,
  STARTING_CASH,
  PASS_GO_BONUS,
  MAX_TURNS,
  MAX_HOUSE_LEVEL,
  UPGRADE_COST_MULTIPLIERS,
  UPGRADE_RENT_MULTIPLIERS,
} from "./board.js";
import { ChanceCard, drawChanceCard } from "./chanceCards.js";

export type PlayerRole = "host" | "guest";

export interface PlayerEconomy {
  position: number;
  cash: number;
  ownedTiles: number[];
  bankrupt: boolean;
}

export type PendingDecision =
  | { type: "buy_or_skip"; tileIndex: number; forPlayer: PlayerRole }
  /** 现金变负且名下还有地产可以卖——必须卖到不再负数为止，才能继续下一回合。
   *  卖出的地产直接归还银行（变回无主状态，双方都可以之后重新购买），
   *  这是"抵押"规则的简化版：不做"赎回"，图的是规则简单、好上手。 */
  | { type: "must_sell"; forPlayer: PlayerRole };

export interface MonopolyState {
  economy: Record<PlayerRole, PlayerEconomy>;
  ownership: Record<number, PlayerRole>;
  currentTurn: PlayerRole;
  turnCount: number;
  lastDiceRoll: number | null;
  /** 两颗骰子各自的点数（比如 [5,5]），UI 用这个画两颗骰子；lastDiceRoll 是它们的和，
   *  用于实际移动格数。之前只存了和，界面上就只能囫囵显示一颗骰子，跟"5+5"这种
   *  双数提示文字对不上——这是那个问题的根因，这次把它修好了。 */
  lastDice: [number, number] | null;
  /** 当前玩家本回合内连续掷出双数的次数，换人时清零。用来判断"是否该送进监狱"。 */
  consecutiveDoubles: number;
  /** 这一次投掷是双数、且不是连续第3次——本次动作结算完之后，同一个人还能再掷一次。 */
  pendingBonusRoll: boolean;
  lastEvent: string | null;
  pendingDecision: PendingDecision | null;
  winner: PlayerRole | "draw" | null;
  /** 地产升级等级：key是格子下标，value是0~3。只有集齐同色地产全部地块
   *  才能开始升级，具体规则和花费/租金倍数见 board.ts 里的常量说明。
   *  没出现在这个对象里的地块视为0级（刚买下，还没升级）。 */
  houseLevel: Record<number, number>;
}

function otherRole(role: PlayerRole): PlayerRole {
  return role === "host" ? "guest" : "host";
}

export function getInitialMonopolyState(): MonopolyState {
  const freshPlayer = (): PlayerEconomy => ({
    position: 0,
    cash: STARTING_CASH,
    ownedTiles: [],
    bankrupt: false,
  });
  return {
    economy: { host: freshPlayer(), guest: freshPlayer() },
    ownership: {},
    currentTurn: "host",
    turnCount: 0,
    lastDiceRoll: null,
    lastDice: null,
    consecutiveDoubles: 0,
    pendingBonusRoll: false,
    lastEvent: "游戏开始！轮到 host 掷骰子。",
    pendingDecision: null,
    winner: null,
    houseLevel: {},
  };
}

function netWorth(state: MonopolyState, role: PlayerRole): number {
  const p = state.economy[role];
  const propertyValue = p.ownedTiles.reduce((sum, idx) => {
    const tile = BOARD[idx];
    const price = tile?.price || 0;
    const level = state.houseLevel[idx] || 0;
    const investedInHouses = UPGRADE_COST_MULTIPLIERS.slice(0, level).reduce((s, m) => s + price * m, 0);
    return sum + price + investedInHouses;
  }, 0);
  return p.cash + propertyValue;
}

function finishByNetWorth(state: MonopolyState): MonopolyState {
  const hostWorth = netWorth(state, "host");
  const guestWorth = netWorth(state, "guest");
  const winner: MonopolyState["winner"] =
    hostWorth === guestWorth ? "draw" : hostWorth > guestWorth ? "host" : "guest";
  return {
    ...state,
    winner,
    lastEvent: `达到回合上限，比较总资产：host ${hostWorth} vs guest ${guestWorth}。`,
  };
}

/**
 * 现金变负时的处理：
 *  - 名下还有地产可以卖 → 暂停在 must_sell 决策，等玩家卖到不再负数为止
 *  - 名下已经没有地产、现金还是负的 → 真正判负
 * 之前是"现金一变负直接判负"，对已经买了不少地产的一方很不公平——手里有资产
 * 却因为一次租金/税收周转不开就直接输，体验上很不合理，这也是 PROJECT_GUIDE
 * 里记录的已知简化项之一，这次把它补上。
 */
function resolveNegativeCash(state: MonopolyState, role: PlayerRole): MonopolyState {
  const player = state.economy[role];
  if (player.cash >= 0) return state;

  if (player.ownedTiles.length > 0) {
    return {
      ...state,
      pendingDecision: { type: "must_sell", forPlayer: role },
      lastEvent: `${state.lastEvent || ""} ${ROLE_LABEL_INTERNAL[role]}现金不足，必须卖出地产补齐差额。`,
    };
  }

  const winner = otherRole(role);
  return {
    ...state,
    economy: { ...state.economy, [role]: { ...player, bankrupt: true } },
    pendingDecision: null,
    winner,
    lastEvent: `${ROLE_LABEL_INTERNAL[role]}没有地产可卖、现金也不够，破产了！${ROLE_LABEL_INTERNAL[winner]}获胜。`,
  };
}

const ROLE_LABEL_INTERNAL: Record<PlayerRole, string> = { host: "房主", guest: "访客" };

/** 某一方是否集齐了某个色组的全部地产——集齐后租金翻倍，也是能开始升级
 *  的前提条件。导出给 UI 层复用（判断"这块地现在能不能升级"），避免两处
 *  各写一份、逻辑跑偏。 */
export function ownsFullColorGroup(state: MonopolyState, owner: PlayerRole, colorGroup: string | undefined): boolean {
  if (!colorGroup) return false;
  const groupTileIndices = BOARD.filter((t) => t.type === "property" && t.colorGroup === colorGroup).map(
    (t) => t.index
  );
  return groupTileIndices.length > 0 && groupTileIndices.every((idx) => state.ownership[idx] === owner);
}

/**
 * 统一的"这个动作结束后，轮次该怎么走"出口：
 *  - 还有未解决的决策（买地/卖地）→ 先不动 currentTurn，等决策解决
 *  - 本回合掷出了双数（且不是连续第3次）→ 同一个人再掷一次
 *  - 否则 → 正常换人
 */
function finishTurn(state: MonopolyState): MonopolyState {
  if (state.winner || state.pendingDecision) return state;
  if (state.pendingBonusRoll) {
    return {
      ...state,
      pendingBonusRoll: false,
      lastEvent: `${state.lastEvent || ""} 双数！可以再掷一次。`,
    };
  }
  return advanceTurn(state);
}

/**
 * Apply a drawn chance card's effect to `role`. Intentionally does NOT
 * recursively resolve whatever tile the player gets teleported to (e.g. no
 * rent charged if moveTo lands on an opponent's property) — see the
 * "设计上刻意保持简单" note in chanceCards.ts for why.
 */
function applyChanceCard(state: MonopolyState, role: PlayerRole, card: ChanceCard): MonopolyState {
  const player = state.economy[role];
  let cash = player.cash;
  let position = player.position;

  if (card.effect.cashDelta) {
    cash += card.effect.cashDelta;
  }
  if (card.effect.moveTo !== undefined) {
    position = card.effect.moveTo;
    if (card.effect.grantPassGoBonus) {
      cash += PASS_GO_BONUS;
    }
  }

  return {
    ...state,
    economy: { ...state.economy, [role]: { ...player, cash, position } },
    lastEvent: `${role === "host" ? "房主" : "访客"}抽到机会卡：${card.text}`,
  };
}

function advanceTurn(state: MonopolyState): MonopolyState {
  const nextTurnCount = state.turnCount + 1;
  if (nextTurnCount >= MAX_TURNS * 2) {
    return finishByNetWorth({ ...state, turnCount: nextTurnCount });
  }
  return {
    ...state,
    currentTurn: otherRole(state.currentTurn),
    turnCount: nextTurnCount,
    pendingDecision: null,
  };
}

/**
 * Roll the dice for `role` (must equal state.currentTurn), move their piece,
 * and resolve whatever they land on. If they land on an unowned property,
 * this sets pendingDecision instead of advancing the turn — the turn only
 * advances once resolveBuyDecision() is called.
 */
export function rollDiceAndMove(state: MonopolyState, role: PlayerRole): MonopolyState {
  if (state.winner || state.pendingDecision || state.currentTurn !== role) return state;

  // 经典大富翁用两颗骰子：点数之和决定移动步数，两颗点数相同（双数）可以再掷一次，
  // 连续三次双数则视为"手滑"，直接送进监狱、作废这次移动（防止双数刷分/无限暴走）。
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  const isDouble = d1 === d2;
  const dice = d1 + d2;
  const consecutiveDoubles = isDouble ? state.consecutiveDoubles + 1 : 0;
  const label = ROLE_LABEL_INTERNAL[role];

  if (isDouble && consecutiveDoubles >= 3) {
    const player = state.economy[role];
    return advanceTurn({
      ...state,
      lastDiceRoll: dice,
      lastDice: [d1, d2],
      consecutiveDoubles: 0,
      pendingBonusRoll: false,
      economy: { ...state.economy, [role]: { ...player, position: JAIL_TILE_INDEX } },
      lastEvent: `${label} 连续 3 次掷出双数（${d1}+${d2}），直接被送进监狱，作废本次移动。`,
    });
  }

  const player = state.economy[role];
  const rawNewPosition = player.position + dice;
  const newPosition = rawNewPosition % BOARD_SIZE;
  const passedGo = rawNewPosition >= BOARD_SIZE;

  let cash = player.cash + (passedGo ? PASS_GO_BONUS : 0);
  let event = `${label} 掷出了 ${d1} + ${d2}${isDouble ? "（双数！）" : ""}。`;
  if (passedGo) event += ` 经过起点，获得 ${PASS_GO_BONUS} 元。`;

  let nextState: MonopolyState = {
    ...state,
    lastDiceRoll: dice,
    lastDice: [d1, d2],
    consecutiveDoubles,
    pendingBonusRoll: isDouble,
    economy: {
      ...state.economy,
      [role]: { ...player, position: newPosition, cash },
    },
    lastEvent: event,
  };

  const tile = BOARD[newPosition];

  if (tile.type === "go_to_jail") {
    nextState = {
      ...nextState,
      pendingBonusRoll: false, // 进监狱直接终止本回合，哪怕这次是双数也不给奖励
      economy: {
        ...nextState.economy,
        [role]: { ...nextState.economy[role], position: JAIL_TILE_INDEX },
      },
      lastEvent: `${event} 踩到"进监狱"，直接被送去监狱探访格。`,
    };
    return advanceTurn(nextState);
  }

  if (tile.type === "tax") {
    const taxed = nextState.economy[role].cash - (tile.taxAmount || 0);
    nextState = {
      ...nextState,
      economy: { ...nextState.economy, [role]: { ...nextState.economy[role], cash: taxed } },
      lastEvent: `${event} 停在${tile.name}，缴税 ${tile.taxAmount} 元。`,
    };
    nextState = resolveNegativeCash(nextState, role);
    return finishTurn(nextState);
  }

  if (tile.type === "chance") {
    const card = drawChanceCard();
    nextState = applyChanceCard(nextState, role, card);
    nextState = resolveNegativeCash(nextState, role);
    return finishTurn(nextState);
  }

  if (tile.type === "property") {
    const owner = nextState.ownership[newPosition];
    if (!owner) {
      // Unowned — pause here and let the player decide.
      nextState = {
        ...nextState,
        pendingDecision: { type: "buy_or_skip", tileIndex: newPosition, forPlayer: role },
        lastEvent: `${event} 停在无主地产「${tile.name}」，请选择是否购买（价格 ${tile.price} 元）。`,
      };
      return nextState;
    }
    if (owner === role) {
      nextState = { ...nextState, lastEvent: `${event} 停在自己的地产「${tile.name}」，无事发生。` };
      return finishTurn(nextState);
    }
    // Owned by opponent — pay rent. 升级过的地产用升级倍数；没升级但集齐
    // 同色地产的，沿用原本"集齐同色租金翻倍"规则。
    const houseLevel = nextState.houseLevel[newPosition] || 0;
    const hasMonopoly = ownsFullColorGroup(nextState, owner, tile.colorGroup);
    const rentMultiplier = houseLevel > 0 ? UPGRADE_RENT_MULTIPLIERS[houseLevel - 1] : hasMonopoly ? 2 : 1;
    const rent = (tile.rent || 0) * rentMultiplier;
    const payerCash = nextState.economy[role].cash - rent;
    const ownerCash = nextState.economy[owner].cash + rent;
    nextState = {
      ...nextState,
      economy: {
        ...nextState.economy,
        [role]: { ...nextState.economy[role], cash: payerCash },
        [owner]: { ...nextState.economy[owner], cash: ownerCash },
      },
      lastEvent: `${event} 停在对方地产「${tile.name}」，支付租金 ${rent} 元${
        houseLevel > 0 ? `（${houseLevel}级建筑）` : hasMonopoly ? "（对方集齐同色地产，租金翻倍！）" : ""
      }。`,
    };
    nextState = resolveNegativeCash(nextState, role);
    return finishTurn(nextState);
  }

  // go / jail(visit) / free_parking — no-op tiles
  return finishTurn(nextState);
}

/**
 * Resolve a pending buy_or_skip decision, then hand off to finishTurn
 * (which respects a pending double-roll bonus, same as every other branch).
 */
export function resolveBuyDecision(
  state: MonopolyState,
  role: PlayerRole,
  choice: "buy" | "skip"
): MonopolyState {
  if (!state.pendingDecision || state.pendingDecision.type !== "buy_or_skip" || state.pendingDecision.forPlayer !== role)
    return state;
  const { tileIndex } = state.pendingDecision;
  const tile = BOARD[tileIndex];

  if (choice === "skip" || !tile.price) {
    return finishTurn({ ...state, pendingDecision: null, lastEvent: `选择不购买「${tile.name}」。` });
  }

  const player = state.economy[role];
  if (player.cash < tile.price) {
    return finishTurn({ ...state, pendingDecision: null, lastEvent: `现金不足，无法购买「${tile.name}」。` });
  }

  const nextState: MonopolyState = {
    ...state,
    pendingDecision: null,
    economy: {
      ...state.economy,
      [role]: {
        ...player,
        cash: player.cash - tile.price,
        ownedTiles: [...player.ownedTiles, tileIndex],
      },
    },
    ownership: { ...state.ownership, [tileIndex]: role },
    lastEvent: `购买了「${tile.name}」，花费 ${tile.price} 元。`,
  };
  return finishTurn(nextState);
}

/**
 * Resolve a pending must_sell decision by selling one owned property back to
 * the bank for 50% of its purchase price (simplified "mortgage" — no buy-back,
 * the tile just becomes unowned again and either player can buy it later).
 * Keeps returning a must_sell decision until cash >= 0, then hands off to
 * finishTurn. If the player runs out of properties while still negative,
 * they're declared bankrupt.
 */
export function sellPropertyToCoverDebt(state: MonopolyState, role: PlayerRole, tileIndex: number): MonopolyState {
  if (!state.pendingDecision || state.pendingDecision.type !== "must_sell" || state.pendingDecision.forPlayer !== role)
    return state;
  const player = state.economy[role];
  if (!player.ownedTiles.includes(tileIndex)) return state;

  const tile = BOARD[tileIndex];
  const level = state.houseLevel[tileIndex] || 0;
  const investedInHouses = UPGRADE_COST_MULTIPLIERS.slice(0, level).reduce((s, m) => s + (tile.price || 0) * m, 0);
  const sellValue = Math.round(((tile.price || 0) + investedInHouses) * 0.5);
  const { [tileIndex]: _removed, ...restOwnership } = state.ownership;
  const { [tileIndex]: _removedLevel, ...restHouseLevel } = state.houseLevel;

  let nextState: MonopolyState = {
    ...state,
    pendingDecision: null,
    ownership: restOwnership,
    houseLevel: restHouseLevel,
    economy: {
      ...state.economy,
      [role]: {
        ...player,
        cash: player.cash + sellValue,
        ownedTiles: player.ownedTiles.filter((idx) => idx !== tileIndex),
      },
    },
    lastEvent: `卖出「${tile.name}」换回 ${sellValue} 元。`,
  };

  nextState = resolveNegativeCash(nextState, role);
  return finishTurn(nextState);
}

/**
 * 给自己名下的一块地产升级（0→1→2→3级）。花费和租金倍数见 board.ts 里的
 * UPGRADE_COST_MULTIPLIERS / UPGRADE_RENT_MULTIPLIERS。
 *
 * 跟"掷骰子"是两件独立的事——真实大富翁里，盖房子是在自己回合内随时可以做
 * 的动作，不消耗/不等同于掷骰子这个动作本身，所以这里特意不调用 finishTurn，
 * 也不检查 pendingDecision/pendingBonusRoll 之外的东西，允许在自己回合里
 * 掷骰子前后随时升级（只要没有待处理的买地/卖地决策卡在中间）。
 */
export function upgradeProperty(state: MonopolyState, role: PlayerRole, tileIndex: number): MonopolyState {
  if (state.winner || state.pendingDecision || state.currentTurn !== role) return state;

  const player = state.economy[role];
  if (!player.ownedTiles.includes(tileIndex)) return state;

  const tile = BOARD[tileIndex];
  if (tile.type !== "property" || !tile.price) return state;
  if (!ownsFullColorGroup(state, role, tile.colorGroup)) return state;

  const currentLevel = state.houseLevel[tileIndex] || 0;
  if (currentLevel >= MAX_HOUSE_LEVEL) return state;

  const cost = Math.round(tile.price * UPGRADE_COST_MULTIPLIERS[currentLevel]);
  if (player.cash < cost) return state;

  const nextLevel = currentLevel + 1;
  return {
    ...state,
    economy: { ...state.economy, [role]: { ...player, cash: player.cash - cost } },
    houseLevel: { ...state.houseLevel, [tileIndex]: nextLevel },
    lastEvent: `${ROLE_LABEL_INTERNAL[role]}将「${tile.name}」升级到 ${nextLevel} 级，花费 ${cost} 元。`,
  };
}
