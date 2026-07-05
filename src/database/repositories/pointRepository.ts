import { db } from "../db";
import { now } from "../../core/clock.ts";

export async function awardPoints(
    amount: number,
    reason: string
) {

    await db.points.add({

        amount,

        reason,

        timestamp: Date.now()

    });

}

export async function spendPoints(
    amount: number,
    reason: string
) {

    await db.points.add({

        amount: -Math.abs(amount),

        reason,

        timestamp: now()

    });

}

export async function getPointBalance() {

    const transactions = await db.points.toArray();

    return transactions.reduce(
        (sum, tx) => sum + tx.amount,
        0
    );

}