import type { GamePool } from "../../database/db";

export function assertValidPool(pool: string): asserts pool is GamePool {
  if (pool !== "daily" && pool !== "weekly" && pool !== "none") {
    throw new Error(`Invalid game pool: ${pool}`);
  }
}
