import { db } from "../../database/db";

export interface StatsSummary {
  totalGames: number;
  totalEvents: number;
  totalPoints: number;
  dailyRolls: number;
  weeklyRolls: number;
  dailyPlays: number;
  weeklyPlays: number;
}

export async function getStatsSummary(): Promise<StatsSummary> {
  const [games, events, points] = await Promise.all([
    db.games.count(),
    db.events.toArray(),
    db.points.toArray()
  ]);

  const totalPoints = points.reduce((sum, entry) => sum + entry.amount, 0);

  const dailyRolls = events.filter((event) => event.type === "ROLL_DAILY").length;
  const weeklyRolls = events.filter((event) => event.type === "ROLL_WEEKLY").length;
  const dailyPlays = events.filter((event) => event.type === "PLAY_RECORDED" && event.payload?.pool === "daily").length;
  const weeklyPlays = events.filter((event) => event.type === "PLAY_RECORDED" && event.payload?.pool === "weekly").length;

  return {
    totalGames: games,
    totalEvents: events.length,
    totalPoints,
    dailyRolls,
    weeklyRolls,
    dailyPlays,
    weeklyPlays
  };
}
