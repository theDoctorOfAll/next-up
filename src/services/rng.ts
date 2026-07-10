import { type Game } from "../database/db";

/**
 * Weighted random selection:
 * higher weight = higher chance
 */
function getEffectiveWeightFromSteps(steps: number): number {
  if (!Number.isFinite(steps)) {
    return 1;
  }

  if (steps === 0) {
    return 1;
  }

  let value = 1;

  for (let index = 0; index < Math.abs(steps); index += 1) {
    value = steps > 0 ? value * 1.5 : value * (2 / 3);
  }

  // Keep all entries selectable even after many negative adjustments.
  return Math.max(0.01, value);
}

export function weightedPick(items: Game[]): Game | null {
  if (items.length === 0) return null;

  const totalWeight = items.reduce((sum, game) => sum + getEffectiveWeightFromSteps(game.weight), 0);

  let r = Math.random() * totalWeight;

  for (const item of items) {
    r -= getEffectiveWeightFromSteps(item.weight);
    if (r <= 0) return item;
  }

  return items[items.length - 1];
}