import {
  TRACK_LENGTH,
  HOME_STRETCH_LENGTH,
  TOTAL_PATH_LENGTH,
  PIECES_PER_PLAYER,
  START_INDEX,
  SAFE_CELLS,
  PlayerRole,
} from "./board.js";

export interface Piece {
  step: number; // -1 = in base, 0..TOTAL_PATH_LENGTH-1 = on path, TOTAL_PATH_LENGTH-1 = home
}

export interface PendingDecision {
  type: "choose_piece";
  forPlayer: PlayerRole;
  options: number[]; // piece indices that can legally move
}

export interface FlightChessState {
  pieces: Record<PlayerRole, Piece[]>;
  currentTurn: PlayerRole;
  lastDiceRoll: number | null;
  lastEvent: string | null;
  pendingDecision: PendingDecision | null;
  winner: PlayerRole | null;
}

function otherRole(role: PlayerRole): PlayerRole {
  return role === "host" ? "guest" : "host";
}

function roleLabel(role: PlayerRole): string {
  return role === "host" ? "房主" : "访客";
}

export function getInitialFlightChessState(): FlightChessState {
  const freshPieces = (): Piece[] =>
    Array.from({ length: PIECES_PER_PLAYER }, () => ({ step: -1 }));
  return {
    pieces: { host: freshPieces(), guest: freshPieces() },
    currentTurn: "host",
    lastDiceRoll: null,
    lastEvent: "游戏开始！轮到 host 掷骰子（掷到 1 或 6 才能起飞）。",
    pendingDecision: null,
    winner: null,
  };
}

/** Which shared-track cell (0..TRACK_LENGTH-1) is this piece's step on, if any? */
function trackCellOf(role: PlayerRole, step: number): number | null {
  if (step < 0 || step >= TRACK_LENGTH) return null;
  return (START_INDEX[role] + step) % TRACK_LENGTH;
}

/** Legal piece indices for `role` given this dice roll. */
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
  return { ...state, currentTurn: otherRole(state.currentTurn), pendingDecision: null };
}

function checkWin(state: FlightChessState, role: PlayerRole): FlightChessState {
  const allHome = state.pieces[role].every((p) => p.step === TOTAL_PATH_LENGTH - 1);
  if (allHome) {
    return { ...state, winner: role, lastEvent: `${roleLabel(role)} 四颗棋子全部到家，获胜！` };
  }
  return state;
}

/**
 * Move piece `pieceIndex` of `role` by `dice` steps, resolving capture/safe-cell/
 * finish logic, then advance the turn (no bonus turn on 6 — simplified on purpose).
 */
function executeMove(state: FlightChessState, role: PlayerRole, pieceIndex: number, dice: number): FlightChessState {
  const piece = state.pieces[role][pieceIndex];
  const fromBase = piece.step === -1;
  const newStep = fromBase ? 0 : piece.step + dice;

  const updatedOwnPieces = state.pieces[role].map((p, idx) => (idx === pieceIndex ? { step: newStep } : p));
  let nextState: FlightChessState = {
    ...state,
    pieces: { ...state.pieces, [role]: updatedOwnPieces },
  };

  let event = fromBase
    ? `${roleLabel(role)} 掷出 ${dice}，${pieceIndex + 1} 号棋子起飞！`
    : `${roleLabel(role)} 掷出 ${dice}，移动了 ${pieceIndex + 1} 号棋子。`;

  // Capture check — only on the shared track, and only if not a safe cell.
  const cell = trackCellOf(role, newStep);
  if (cell !== null && !SAFE_CELLS.includes(cell)) {
    const opponent = otherRole(role);
    const opponentPieces = nextState.pieces[opponent];
    let captured = false;
    const updatedOpponentPieces = opponentPieces.map((p) => {
      if (trackCellOf(opponent, p.step) === cell) {
        captured = true;
        return { step: -1 };
      }
      return p;
    });
    if (captured) {
      nextState = { ...nextState, pieces: { ...nextState.pieces, [opponent]: updatedOpponentPieces } };
      event += ` 撞到了${roleLabel(opponent)}的棋子，被送回营地！`;
    }
  }

  nextState = { ...nextState, lastEvent: event };
  nextState = checkWin(nextState, role);
  return nextState.winner ? nextState : advanceTurn(nextState);
}

/**
 * Roll the dice for `role` (must be current turn), then either:
 *  - auto-execute the move if exactly one piece can legally move,
 *  - set pendingDecision if multiple pieces can legally move,
 *  - pass the turn if no piece can legally move.
 */
export function rollDiceForFlightChess(state: FlightChessState, role: PlayerRole): FlightChessState {
  if (state.winner || state.pendingDecision || state.currentTurn !== role) return state;

  const dice = Math.floor(Math.random() * 6) + 1;
  const legal = getLegalMoves(state, role, dice);
  const stateWithRoll: FlightChessState = { ...state, lastDiceRoll: dice };

  if (legal.length === 0) {
    return advanceTurn({
      ...stateWithRoll,
      lastEvent: `${roleLabel(role)} 掷出 ${dice}，没有可移动的棋子，轮到对方。`,
    });
  }

  if (legal.length === 1) {
    return executeMove(stateWithRoll, role, legal[0], dice);
  }

  return {
    ...stateWithRoll,
    pendingDecision: { type: "choose_piece", forPlayer: role, options: legal },
    lastEvent: `${roleLabel(role)} 掷出 ${dice}，有多颗棋子可以走，请选择要移动的棋子。`,
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
  return executeMove(state, role, pieceIndex, state.lastDiceRoll);
}

export { TRACK_LENGTH, HOME_STRETCH_LENGTH, TOTAL_PATH_LENGTH, PIECES_PER_PLAYER, START_INDEX, SAFE_CELLS };
export type { PlayerRole };
