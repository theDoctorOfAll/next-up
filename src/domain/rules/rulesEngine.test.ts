import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePlayRules } from "./rulesEngine.ts";

test("allows play when a game is selected and not yet played", async () => {
  const board = {
    id: 1,
    dailyGameId: 42,
    weeklyGameId: undefined,
    dailyPlayed: false,
    weeklyPlayed: false
  } as any;

  const result = await evaluatePlayRules(board, "daily", Date.now());

  assert.equal(result.allowed, true);
  assert.equal(result.reward, 15);
});

test("blocks play when the selected pool is already locked", async () => {
  const board = {
    id: 1,
    dailyGameId: 42,
    dailyPlayed: true,
    weeklyPlayed: false
  } as any;

  const result = await evaluatePlayRules(board, "daily", Date.now());

  assert.equal(result.allowed, false);
  assert.match(result.reason ?? "", /already been marked as played/i);
});

test("blocks play when no game is selected", async () => {
  const board = {
    id: 1,
    dailyGameId: undefined,
    weeklyGameId: undefined,
    dailyPlayed: false,
    weeklyPlayed: false
  } as any;

  const result = await evaluatePlayRules(board, "daily", Date.now());

  assert.equal(result.allowed, false);
  assert.match(result.reason ?? "", /no game is currently selected/i);
});
