import { db, type Game } from "../db";

export async function getAllGames(): Promise<Game[]> {
    return db.games.toArray();
}

export async function getGamesByPool(pool: "daily" | "weekly"): Promise<Game[]> {
    return db.games
        .where("pool")
        .equals(pool)
        .toArray();
}

export async function addGame(game: Game): Promise<number> {
    return db.games.add(game);
}

export async function updateGame(game: Game): Promise<void> {
    if (!game.id)
        throw new Error("Game has no id.");

    game.updatedAt = Date.now();

    await db.games.put(game);
}

export async function getGame(id: number): Promise<Game | undefined> {
    return db.games.get(id);
}

export async function getGameById(id: number) {
    return db.games.get(id);
}