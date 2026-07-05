import { addGame } from "../../database/repositories/gameRepository";
import { now } from "../../core/clock";
import { getBoard } from "../../database/repositories/boardRepository";
import { db } from "../../database/db";

export async function addGameToLibrary(title: string, pool: "daily" | "weekly") {
  const existing = await db.games.where("title").equals(title).first();

  if (existing) return existing.id;

  await getBoard()

  return addGame({
    title,
    pool,
    weight: 1,
    reserved: false,
    createdAt: now(),
    updatedAt: now()
  });
}