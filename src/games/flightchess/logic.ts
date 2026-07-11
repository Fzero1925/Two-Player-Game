import {
  TRACK_LENGTH,
  HOME_STRETCH_LENGTH,
  TOTAL_PATH_LENGTH,
  PIECES_PER_COLOR,
  COLOR_START_INDEX,
  ROLE_COLORS,
  COLOR_LABEL,
  SAFE_CELLS,
  PlayerRole,
  PieceColor,
} from "./board.js";

export interface Piece {
  color: PieceColor;
  step: number; // -1 = in base, 0..TOTAL_PATH_LENGTH-1 = on path, TOTAL_PATH_LENGTH-1 = home
}

export interface PendingDecision {
  type: "choose_piece";
  forPlayer: PlayerRole;
  options: number[]; // piece indices (into state.pieces[forPlayer], which mixes both of that player's colors) that can legally move
}

export interface FlightChessState {
  pieces: Record<PlayerRole, Piece[]>; // 8 pieces per role: 4 of each of their 2 colors, color-grouped in array order
  currentTurn: PlayerRole;
  lastDiceRoll: number | null;
  lastEvent: string | null;
  pendingDecision: PendingDecision | null;
  winner: PlayerRole | null;
  /** How many 6s currentTurn's player has rolled in a row so far this "extended turn". */
  consecutiveSixes: number;
}

function otherRole(role: PlayerRole): PlayerRole {
  return role === "host" ? "guest" : "host";
}

function roleLabel(role: PlayerRole): string {
  return role === "host" ? "房主" : "访客";
}

/** "红2号" 这样的可读标签——同色棋子按它们在数组里的固定顺序编号（1..PIECES_PER_COLOR）。 */
function pieceLabel(piece: Piece, pieceIndex: number): string {
  const ordinal = (pieceIndex % PIECES_PER_COLOR) + 1;
  return `${COLOR_LABEL[piece.color]}${ordinal}号`;
}

export function getInitialFlightChessState(): FlightChessState {
  const freshPieces = (colors: PieceColor[]): Piece[] =>
    colors.flatMap((color) => Array.from({ length: PIECES_PER_COLOR }, () => ({ color, step: -1 })));
  return {
    pieces: { host: freshPieces(ROLE_COLORS.host), guest: freshPieces(ROLE_COLORS.guest) },
    currentTurn: "host",
    lastDiceRoll: null,
    lastEvent: "游戏开始！轮到 host 掷骰子（掷到 1 或 6 才能起飞，掷到 6 可以再掷一次）。房主控制红/绿，访客控制蓝/黄。",
    pendingDecision: null,
    winner: null,
    consecutiveSixes: 0,
  };
}

/** Which shared-track cell (0..TRACK_LENGTH-1) is this piece on, if any? Keyed off the piece's OWN color start, not the owning role. */
function trackCellOf(piece: Piece): number | null {
  if (piece.step < 0 || piece.step >= TRACK_LENGTH) return null;
  return (COLOR_START_INDEX[piece.color] + piece.step) % TRACK_LENGTH;
}

/** Legal piece indices for `role` given this dice roll — spans both of the role's colors. */
export function getLegalMoves(state: FlightChessState, role: PlayerRole, dice: number): number[] {
  const pieces = state.pieces[role];
  const legal: number[] = [];
  pieces.forEach((piece, idx) => {
    if (piece.step === -1) {
      // In base — needs a 1 or 6 to launch.
      if (dice === 1 || dice === 6) legal.push(idx);
      return;
    }
    if (piece.step === TOTAL_PATH_LENGTH - 1) return; // already home
    if (piece.step + dice <= TOTAL_PATH_LENGTH - 1) legal.push(idx); // no overshoot
  });
  return legal;
}

function advanceTurn(state: FlightChessState): FlightChessState {
  // consecutiveSixes always resets when the turn actually changes hands —
  // it only ever tracks the CURRENT player's streak within their own extended turn.
  return { ...state, currentTurn: otherRole(state.currentTurn), pendingDecision: null, consecutiveSixes: 0 };
}

function checkWin(state: FlightChessState, role: PlayerRole): FlightChessState {
  // 四色版：这个玩家两个颜色一共 8 颗棋子，全部到家才算赢。
  const allHome = state.pieces[role].every((p) => p.step === TOTAL_PATH_LENGTH - 1);
  if (allHome) {
    return { ...state, winner: role, lastEvent: `${roleLabel(role)} 两个颜色的棋子全部到家，获胜！` };
  }
  return state;
}

/**
 * Move piece `pieceIndex` of `role` by `dice` steps, resolving capture/safe-cell/
 * finish logic. If `grantBonusRoll` is true (dice was 6 and this wasn't the 3rd
 * six in a row), the turn does NOT advance — same player rolls again.
 */
function executeMove(
  state: FlightChessState,
  role: PlayerRole,
  pieceIndex: number,
  dice: number,
  grantBonusRoll: boolean
): FlightChessState {
  const piece = state.pieces[role][pieceIndex];
  const fromBase = piece.step === -1;
  const newStep = fromBase ? 0 : piece.step + dice;
  const movedPiece: Piece = { ...piece, step: newStep };

  const updatedOwnPieces = state.pieces[role].map((p, idx) => (idx === pieceIndex ? movedPiece : p));
  let nextState: FlightChessState = {
    ...state,
    pieces: { ...state.pieces, [role]: updatedOwnPieces },
  };

  const label = pieceLabel(piece, pieceIndex);
  let event = fromBase
    ? `${roleLabel(role)} 掷出 ${dice}，${label}棋子起飞！`
    : `${roleLabel(role)} 掷出 ${dice}，移动了${label}棋子。`;

  // Capture check — only on the shared track, and only if not a safe cell.
  // 只撞对方（另一个 role）的棋子——自己两个颜色的棋子撞到一起不会互相吃掉，
  // 允许共存，规则上简化处理。
  const cell = trackCellOf(movedPiece);
  if (cell !== null && !SAFE_CELLS.includes(cell)) {
    const opponent = otherRole(role);
    const opponentPieces = nextState.pieces[opponent];
    let captured = false;
    const updatedOpponentPieces = opponentPieces.map((p) => {
      if (trackCellOf(p) === cell) {
        captured = true;
        return { ...p, step: -1 };
      }
      return p;
    });
    if (captured) {
      nextState = { ...nextState, pieces: { ...nextState.pieces, [opponent]: updatedOpponentPieces } };
      event += ` 撞到了${roleLabel(opponent)}的棋子，被送回营地！`;
    }
  }

  if (grantBonusRoll) event += " 掷出 6，可以再掷一次！";
  nextState = { ...nextState, lastEvent: event };
  nextState = checkWin(nextState, role);
  if (nextState.winner) return nextState;
  // 掷 6 奖励一次额外投掷：不切换 currentTurn，只清掉 pendingDecision。
  return grantBonusRoll ? { ...nextState, pendingDecision: null } : advanceTurn(nextState);
}

/**
 * Roll the dice for `role` (must be current turn), then either:
 *  - auto-execute the move if exactly one piece can legally move,
 *  - set pendingDecision if multiple pieces can legally move (now spans both colors),
 *  - pass the turn if no piece can legally move.
 *
 * "掷 6 再来一次" 规则：
 *  - 掷出 6 且不是本回合连续第 3 次 6 → 这次的移动结算完之后，轮次不切换，
 *    同一个人可以再掷一次（executeMove 内部通过 grantBonusRoll 控制）。
 *  - 连续 3 次掷出 6 → 视为"手滑"，直接作废这次移动机会，轮到对方
 *    （经典飞行棋/华容道规则里常见的防作弊设计，避免一方无限连庄）。
 */
export function rollDiceForFlightChess(state: FlightChessState, role: PlayerRole): FlightChessState {
  if (state.winner || state.pendingDecision || state.currentTurn !== role) return state;

  const dice = Math.floor(Math.random() * 6) + 1;
  const consecutiveSixes = dice === 6 ? state.consecutiveSixes + 1 : 0;

  if (dice === 6 && consecutiveSixes >= 3) {
    return advanceTurn({
      ...state,
      lastDiceRoll: dice,
      lastEvent: `${roleLabel(role)} 连续 3 次掷出 6，作废本次移动机会，轮到对方。`,
    });
  }

  const grantBonusRoll = dice === 6;
  const legal = getLegalMoves(state, role, dice);
  const stateWithRoll: FlightChessState = { ...state, lastDiceRoll: dice, consecutiveSixes };

  if (legal.length === 0) {
    const noMoveEvent = `${roleLabel(role)} 掷出 ${dice}，没有可移动的棋子${grantBonusRoll ? "，但掷出 6 可以再掷一次！" : "，轮到对方。"}`;
    return grantBonusRoll
      ? { ...stateWithRoll, lastEvent: noMoveEvent }
      : advanceTurn({ ...stateWithRoll, lastEvent: noMoveEvent });
  }

  if (legal.length === 1) {
    return executeMove(stateWithRoll, role, legal[0], dice, grantBonusRoll);
  }

  return {
    ...stateWithRoll,
    pendingDecision: { type: "choose_piece", forPlayer: role, options: legal },
    lastEvent: `${roleLabel(role)} 掷出 ${dice}，有多颗棋子可以走（两个颜色一起选），请选择要移动的棋子${grantBonusRoll ? "（本次是 6，选完还能再掷一次）" : ""}。`,
  };
}

/** Resolve a pending choose_piece decision. */
export function choosePieceForFlightChess(
  state: FlightChessState,
  role: PlayerRole,
  pieceIndex: number
): FlightChessState {
  if (!state.pendingDecision || state.pendingDecision.forPlayer !== role) return state;
  if (!state.pendingDecision.options.includes(pieceIndex)) return state;
  if (state.lastDiceRoll === null) return state;
  const grantBonusRoll = state.lastDiceRoll === 6;
  return executeMove(state, role, pieceIndex, state.lastDiceRoll, grantBonusRoll);
}

export { pieceLabel };
export { TRACK_LENGTH, HOME_STRETCH_LENGTH, TOTAL_PATH_LENGTH, PIECES_PER_COLOR, COLOR_START_INDEX, ROLE_COLORS, COLOR_LABEL, SAFE_CELLS };
export type { PlayerRole, PieceColor };
