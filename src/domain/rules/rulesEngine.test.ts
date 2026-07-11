import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePlayRules } from "./rulesEngine.ts";
import { db } from "../../database/db.ts";

test.beforeEach(async () => {
  await db.events.clear();
});

test.afterEach(async () => {
  await db.events.clear();
});

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

test("awards the daily pool bonus only once per day", async () => {
  const timestamp = new Date(2026, 6, 11, 12, 0, 0, 0).getTime();

  await db.events.add({
    type: "PLAY_RECORDED",
    timestamp: timestamp - 60_000,
    payload: {
      pool: "daily"
    }
  });

  const board = {
    id: 1,
    dailyGameId: 42,
    weeklyGameId: undefined,
    dailyPlayed: false,
    weeklyPlayed: false
  } as any;

  const result = await evaluatePlayRules(board, "daily", timestamp, 30);

  assert.equal(result.allowed, true);
  assert.equal(result.reward, 10);
});

test("awards the weekly pool bonus only once per day", async () => {
  const timestamp = new Date(2026, 6, 11, 12, 0, 0, 0).getTime();

  await db.events.add({
    type: "PLAY_RECORDED",
    timestamp: timestamp - 60_000,
    payload: {
      pool: "weekly"
    }
  });

  const board = {
    id: 1,
    dailyGameId: undefined,
    weeklyGameId: 42,
    dailyPlayed: false,
    weeklyPlayed: false
  } as any;

  const result = await evaluatePlayRules(board, "weekly", timestamp, 30);

  assert.equal(result.allowed, true);
  assert.equal(result.reward, 10);
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
