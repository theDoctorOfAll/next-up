import type { BoardState } from "../../database/db";
import {
  getBoard,
  saveBoard
} from "../../database/repositories/boardRepository";
import {
  getGameById as getGameByIdFromRepository,
  updateGame
} from "../../database/repositories/gameRepository";
import { now } from "../../core/clock";
import { addEvent, addPoints, getPointTotal } from "../../database/services";

const RESERVE_MOVE_COST = 25;

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
  const previousReserveGameId = board.reserveGameId;
  const nextReserveGame = await getGameByIdFromRepository(gameId);

  if (!nextReserveGame) {
    throw new Error("No game found for the reserve slot.");
  }

  if (board.dailyGameId === gameId && board.dailyPlayed) {
    throw new Error("The current daily game is already played and cannot be moved into reserve.");
  }

  if (board.weeklyGameId === gameId && board.weeklyPlayed) {
    throw new Error("The current weekly game is already played and cannot be moved into reserve.");
  }

  if (previousReserveGameId && previousReserveGameId !== gameId) {
    const previousReserveGame = await getGameByIdFromRepository(previousReserveGameId);

    if (previousReserveGame) {
      await updateGame({
        ...previousReserveGame,
        reserved: false,
        updatedAt: now()
      });
    }
  }

  if (!nextReserveGame.reserved) {
    const balance = await getPointTotal();

    if (balance < RESERVE_MOVE_COST) {
      throw new Error(`Not enough points. ${RESERVE_MOVE_COST} points required.`);
    }
  }

  if (board.dailyGameId === gameId) {
    board.dailyGameId = undefined;
    board.dailyRolledAt = undefined;
    board.dailyPlayed = false;
  }

  if (board.weeklyGameId === gameId) {
    board.weeklyGameId = undefined;
    board.weeklyRolledAt = undefined;
    board.weeklyPlayed = false;
  }

  if (!nextReserveGame.reserved) {
    const eventId = await addEvent("POINTS_SPENT", {
      gameId,
      amount: RESERVE_MOVE_COST,
      reason: "reserve move"
    });

    await addPoints(-RESERVE_MOVE_COST, "reserve move", eventId);
  }

  await updateGame({
    ...nextReserveGame,
    reserved: true,
    updatedAt: now()
  });

  board.reserveGameId = gameId;

  await saveBoard(board);
  await addEvent("RESERVE_SET", {
    gameId,
    reserved: true,
    title: nextReserveGame.title,
    clearedSlot: board.dailyGameId === undefined && board.weeklyGameId === undefined ? null : "slot-cleared"
  });

  return board;
}

export async function clearReserveGame(): Promise<BoardState> {
  const board = await getBoard();
  const previousReserveGameId = board.reserveGameId;

  if (previousReserveGameId) {
    const previousReserveGame = await getGameByIdFromRepository(previousReserveGameId);

    if (previousReserveGame) {
      await updateGame({
        ...previousReserveGame,
        reserved: false,
        updatedAt: now()
      });
    }
  }

  board.reserveGameId = undefined;

  await saveBoard(board);
  await addEvent("RESERVE_SET", {
    gameId: previousReserveGameId,
    reserved: false
  });

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
