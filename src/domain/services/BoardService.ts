import type { BoardState } from "../../database/db";
import {
  getBoard,
  saveBoard
} from "../../database/repositories/boardRepository";
import { now } from "../../core/clock";

export async function getCurrentBoard(): Promise<BoardState> {
  return getBoard();
}

export async function updateDailyGame(gameId: number): Promise<BoardState> {
  const board = await getBoard();

  board.dailyGameId = gameId;
  board.dailyRolledAt = now();
  board.dailyPlayed = false;

  await saveBoard(board);

  return board;
}

export async function updateWeeklyGame(gameId: number): Promise<BoardState> {
  const board = await getBoard();

  board.weeklyGameId = gameId;
  board.weeklyRolledAt = now();
  board.weeklyPlayed = false;

  await saveBoard(board);

  return board;
}

export async function setReserveGame(gameId: number): Promise<BoardState> {
  const board = await getBoard();

  board.reserveGameId = gameId;

  await saveBoard(board);

  return board;
}

export async function lockDaily(): Promise<BoardState> {
  const board = await getBoard();

  board.dailyPlayed = true;

  await saveBoard(board);

  return board;
}

export async function lockWeekly(): Promise<BoardState> {
  const board = await getBoard();

  board.weeklyPlayed = true;

  await saveBoard(board);

  return board;
}

export async function resetWeekly(): Promise<BoardState> {
  const board = await getBoard();

  board.weeklyGameId = undefined;
  board.weeklyRolledAt = undefined;
  board.weeklyPlayed = false;

  await saveBoard(board);

  return board;
}
