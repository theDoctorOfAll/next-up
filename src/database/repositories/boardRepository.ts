import { db, type BoardState } from "../db";

const BOARD_ID = 1;

export async function getBoard(): Promise<BoardState> {
  let board = await db.board.get(BOARD_ID);

  if (!board) {
    board = {
      id: BOARD_ID,
      
      dailyGameId: undefined,
      weeklyGameId: undefined,
      reserveGameId: undefined,
      
      dailyRolledAt: undefined,
      weeklyRolledAt: undefined,
      
      dailyPlayed: false,
      weeklyPlayed: false,
    };

    await db.board.add(board);
  }

  return board;
}

export async function saveBoard(board: BoardState): Promise<void> {
  await db.board.put(board);
}