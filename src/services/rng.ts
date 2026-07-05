import { type Game } from "../database/db";

/**
 * Weighted random selection:
 * higher weight = higher chance
 */
export function weightedPick(items: Game[]): Game | null {
  if (items.length === 0) return null;

  const totalWeight = items.reduce((sum, g) => sum + g.weight, 0);

  let r = Math.random() * totalWeight;

  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }

  return items[items.length - 1];
}