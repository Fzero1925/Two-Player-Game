/**
 * ============================================================
 * GAME DEFINITIONS — the single source of truth for game logic
 * that must be shared across server.ts (local fallback / Node)
 * and roomManager.ts (Supabase / browser) and App.tsx.
 * ============================================================
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * Previously, "what does a fresh game_state look like for game X"
 * was hand-copied into 4 separate places (server.ts x2, roomManager.ts x2).
 * They drifted: the Supabase code path always initialized a Gomoku
 * board, even when creating a Pictionary room. This file exists so
 * that never happens again — there is exactly ONE place that knows
 * how to initialize each game's state.
 *
 * HOW TO ADD A NEW GAME (data/logic side)
 * -----------------------------------------
 * 1. Add a new entry to GAME_DEFINITIONS below with a unique id and
 *    a getInitialState() function.
 * 2. That's it for this file. server.ts and roomManager.ts already
 *    call getInitialGameState(gameType) generically — no other
 *    changes needed there.
 * 3. Separately, register the game's React component + lobby card
 *    copy in src/games/registry.tsx (see that file's header comment).
 */

import { getRandomPictionaryWord } from "./pictionaryWords.js";
import { getInitialMonopolyState } from "./monopoly/logic.js";
import { getInitialFlightChessState } from "./flightchess/logic.js";
import { getInitialMemoryMatchState } from "./memorymatch/logic.js";

export interface GameDefinition {
  id: string;
  /** Returns a brand new game_state object for a fresh room. */
  getInitialState: () => any;
}

function createGomokuState() {
  return {
    board: Array(15)
      .fill(null)
      .map(() => Array(15).fill(0)),
    current_turn: "host",
    winner: null,
  };
}

function createPictionaryState() {
  const pWord = getRandomPictionaryWord();
  return {
    drawer: "host",
    secret_word: pWord.word,
    hint: pWord.category,
    lines: [],
    chat: [],
    winner: null,
  };
}

/**
 * Registry of every game's *data* definition.
 * Add new games here. Keep this file free of React/JSX imports.
 */
export const GAME_DEFINITIONS: Record<string, GameDefinition> = {
  gomoku: {
    id: "gomoku",
    getInitialState: createGomokuState,
  },
  pictionary: {
    id: "pictionary",
    getInitialState: createPictionaryState,
  },
  monopoly: {
    id: "monopoly",
    getInitialState: getInitialMonopolyState,
  },
  flightchess: {
    id: "flightchess",
    getInitialState: getInitialFlightChessState,
  },
  memorymatch: {
    id: "memorymatch",
    getInitialState: getInitialMemoryMatchState,
  },
};

export function isValidGameType(gameType: string): boolean {
  return Object.prototype.hasOwnProperty.call(GAME_DEFINITIONS, gameType);
}

export function listGameTypes(): string[] {
  return Object.keys(GAME_DEFINITIONS);
}

/**
 * The ONE function every code path should call to get a fresh
 * game_state for a room. Throws on unknown game types so mistakes
 * fail loudly instead of silently defaulting to Gomoku.
 */
export function getInitialGameState(gameType: string): any {
  const def = GAME_DEFINITIONS[gameType];
  if (!def) {
    throw new Error(`Unknown game_type: "${gameType}". Did you register it in src/games/definitions.ts?`);
  }
  return def.getInitialState();
}
