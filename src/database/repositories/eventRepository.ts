import { db, type Event, type EventType } from "../db";

export async function recordEvent(
    type: EventType,
    payload: unknown
) {

    return db.events.add({

        type,

        payload,

        timestamp: Date.now()

    });

}

export async function getEvents() {

    return db.events
        .orderBy("timestamp")
        .reverse()
        .toArray();

}