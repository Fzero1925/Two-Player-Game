/**
 * Shared types for the Online Game Hub.
 */

export interface Player {
  id: string;
  name: string;
  online: boolean;
  last_seen: number; // UTC timestamp
  ready: boolean;
}

export interface RoomPlayers {
  host: Player | null;
  guest: Player | null;
}

export interface Room {
  room_code: string;
  game_type: string;
  status: 'waiting' | 'playing' | 'finished';
  players: RoomPlayers;
  game_state: any;
  created_at?: string;
}

// Gomoku (五子棋) specific types
export interface GomokuState {
  board: number[][]; // 15x15 board. 0: empty, 1: host (Black, first), 2: guest (White)
  current_turn: 'host' | 'guest';
  winner: 'host' | 'guest' | 'draw' | null;
}

export type GameType = 'gomoku' | 'pictionary' | 'monopoly' | 'flightchess';

export interface RoomConfig {
  gameType: GameType;
  roomCode: string;
  playerId: string;
  role: 'host' | 'guest' | 'spectator';
}
