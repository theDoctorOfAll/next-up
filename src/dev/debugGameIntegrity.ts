import { db } from "../database/db";

export async function debugGameIntegrity() {
  const games = await db.games.toArray();

  const duplicates = games.filter((game, index) =>
    games.findIndex((candidate) =>
      candidate.title === game.title && candidate.pool === game.pool
    ) !== index
  );

  console.log("TOTAL GAMES:", games.length);
  console.log("DUPLICATES:", duplicates);
}
