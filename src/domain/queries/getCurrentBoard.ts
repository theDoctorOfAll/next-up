import { getBoard } from "../../database/repositories/boardRepository";

export async function getCurrentBoard() {
  return getBoard();
}