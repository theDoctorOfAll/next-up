import { db, type Event } from "../../database/db";

export interface EventLogEntry extends Event {}

export async function getEventLog(limit = 50): Promise<EventLogEntry[]> {
  return db.events
    .orderBy("timestamp")
    .reverse()
    .limit(limit)
    .toArray();
}
