import { BOARD, BOARD_SIZE, JAIL_TILE_INDEX, STARTING_CASH, PASS_GO_BONUS, MAX_TURNS } from "./board.js";
import { ChanceCard, drawChanceCard } from "./chanceCards.js";

export type PlayerRole = "host" | "guest";

export interface PlayerEconomy {
  position: number;
  cash: number;
  ownedTiles: number[];
  bankrupt: boolean;
}

export interface PendingDecision {
  type: "buy_or_skip";
  tileIndex: number;
  forPlayer: PlayerRole;
}

export interface MonopolyState {
  economy: Record<PlayerRole, PlayerEconomy>;
  ownership: Record<number, PlayerRole>;
  currentTurn: PlayerRole;
  turnCount: number;
  lastDiceRoll: number | null;
  lastEvent: string | null;
  pendingDecision: PendingDecision | null;
  winner: PlayerRole | "draw" | null;
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
    lastEvent: "游戏开始！轮到 host 掷骰子。",
    pendingDecision: null,
    winner: null,
  };
}

function netWorth(state: MonopolyState, role: PlayerRole): number {
  const p = state.economy[role];
  const propertyValue = p.ownedTiles.reduce((sum, idx) => {
    const tile = BOARD[idx];
    return sum + (tile?.price || 0);
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

function checkBankruptcy(state: MonopolyState, role: PlayerRole): MonopolyState {
  if (state.economy[role].cash < 0) {
    const loser = role;
    const winner = otherRole(role);
    return {
      ...state,
      economy: {
        ...state.economy,
        [loser]: { ...state.economy[loser], bankrupt: true },
      },
      winner,
      lastEvent: `${loser === "host" ? "房主" : "访客"}破产了！${winner === "host" ? "房主" : "访客"}获胜。`,
    };
  }
  return state;
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

  const dice = Math.floor(Math.random() * 6) + 1;
  const player = state.economy[role];
  const rawNewPosition = player.position + dice;
  const newPosition = rawNewPosition % BOARD_SIZE;
  const passedGo = rawNewPosition >= BOARD_SIZE;

  let cash = player.cash + (passedGo ? PASS_GO_BONUS : 0);
  let event = `${role === "host" ? "房主" : "访客"}掷出了 ${dice} 点。`;
  if (passedGo) event += ` 经过起点，获得 ${PASS_GO_BONUS} 元。`;

  let nextState: MonopolyState = {
    ...state,
    lastDiceRoll: dice,
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
    nextState = checkBankruptcy(nextState, role);
    return nextState.winner ? nextState : advanceTurn(nextState);
  }

  if (tile.type === "chance") {
    const card = drawChanceCard();
    nextState = applyChanceCard(nextState, role, card);
    nextState = checkBankruptcy(nextState, role);
    return nextState.winner ? nextState : advanceTurn(nextState);
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
      return advanceTurn(nextState);
    }
    // Owned by opponent — pay rent.
    const rent = tile.rent || 0;
    const payerCash = nextState.economy[role].cash - rent;
    const ownerCash = nextState.economy[owner].cash + rent;
    nextState = {
      ...nextState,
      economy: {
        ...nextState.economy,
        [role]: { ...nextState.economy[role], cash: payerCash },
        [owner]: { ...nextState.economy[owner], cash: ownerCash },
      },
      lastEvent: `${event} 停在对方地产「${tile.name}」，支付租金 ${rent} 元。`,
    };
    nextState = checkBankruptcy(nextState, role);
    return nextState.winner ? nextState : advanceTurn(nextState);
  }

  // go / jail(visit) / free_parking — no-op tiles
  return advanceTurn(nextState);
}

/**
 * Resolve a pending buy_or_skip decision, then advance the turn.
 */
export function resolveBuyDecision(
  state: MonopolyState,
  role: PlayerRole,
  choice: "buy" | "skip"
): MonopolyState {
  if (!state.pendingDecision || state.pendingDecision.forPlayer !== role) return state;
  const { tileIndex } = state.pendingDecision;
  const tile = BOARD[tileIndex];

  if (choice === "skip" || !tile.price) {
    return advanceTurn({ ...state, lastEvent: `选择不购买「${tile.name}」。` });
  }

  const player = state.economy[role];
  if (player.cash < tile.price) {
    return advanceTurn({ ...state, lastEvent: `现金不足，无法购买「${tile.name}」。` });
  }

  const nextState: MonopolyState = {
    ...state,
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
  return advanceTurn(nextState);
}
