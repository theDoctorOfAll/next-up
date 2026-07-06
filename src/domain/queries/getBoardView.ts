import { getBoard } from "../../database/repositories/boardRepository";
import { getGameById } from "../../database/repositories/gameRepository";

export interface BoardView {

    dailyTitle: string;

    weeklyTitle: string;

    reserveTitle: string;

    dailyPlayed: boolean;

    weeklyPlayed: boolean;

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

    return {

        dailyTitle: daily?.title ?? "—",

        weeklyTitle: weekly?.title ?? "—",

        reserveTitle: reserve?.title ?? "—",

        dailyPlayed: board.dailyPlayed ?? false,

        weeklyPlayed: board.weeklyPlayed ?? false

    };

}
