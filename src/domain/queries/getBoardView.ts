import { getBoard } from "../../database/repositories/boardRepository";
import { getGameById } from "../../database/repositories/gameRepository";
import { now } from "../../core/clock";

export interface BoardView {

    dailyTitle: string;

    weeklyTitle: string;

    reserveTitle: string;

    dailyPlayed: boolean;

    weeklyPlayed: boolean;

    dailyIsReroll: boolean;

    weeklyIsReroll: boolean;

}

function startOfLocalDay(timestamp: number) {
    const date = new Date(timestamp);

    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    ).getTime();
}

function startOfLocalWeek(timestamp: number) {
    const date = new Date(timestamp);
    const day = date.getDay();

    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() - day
    ).getTime();
}

function isSameLocalDay(left: number, right: number) {
    return startOfLocalDay(left) === startOfLocalDay(right);
}

function isSameLocalWeek(left: number, right: number) {
    return startOfLocalWeek(left) === startOfLocalWeek(right);
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

    const timestamp = now();
    const dailyPlayed = Boolean(
        board.dailyPlayed
        && board.dailyRolledAt !== undefined
        && isSameLocalDay(board.dailyRolledAt, timestamp)
    );
    const weeklyPlayed = Boolean(
        board.weeklyPlayed
        && board.weeklyRolledAt !== undefined
        && isSameLocalWeek(board.weeklyRolledAt, timestamp)
    );
    const dailyIsReroll = Boolean(
        board.dailyRolledAt !== undefined
        && isSameLocalDay(board.dailyRolledAt, timestamp)
    );
    const weeklyIsReroll = Boolean(
        board.weeklyRolledAt !== undefined
        && isSameLocalWeek(board.weeklyRolledAt, timestamp)
    );

    return {

        dailyTitle: daily?.title ?? "—",

        weeklyTitle: weekly?.title ?? "—",

        reserveTitle: reserve?.title ?? "—",

        dailyPlayed,

        weeklyPlayed,

        dailyIsReroll,

        weeklyIsReroll

    };

}
