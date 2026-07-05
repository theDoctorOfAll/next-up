import { getBoard } from "../../database/repositories/boardRepository";
import { getGameById } from "../../database/repositories/gameRepository";
import { db } from "../../database/db"

export interface BoardView {

    dailyTitle: string;

    weeklyTitle: string;

    reserveTitle: string;

}

export async function getBoardView(): Promise<BoardView> {

    const board = await getBoard();

    const daily =
        board.dailyGameId
            ? await getGameById(board.dailyGameId)
            : undefined;

    const weekly =
        board.weeklyGameId
            ? await getGameById(board.weeklyGameId)
            : undefined;

    const reserve =
        board.reserveGameId
            ? await getGameById(board.reserveGameId)
            : undefined;

    console.log("games:", await db.games.toArray());
    console.log("game:", board.dailyGameId);
    return {

        dailyTitle: daily?.title ?? "—",

        weeklyTitle: weekly?.title ?? "—",

        reserveTitle: reserve?.title ?? "—"

    };

    
}