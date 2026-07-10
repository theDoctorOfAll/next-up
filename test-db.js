import Dexie from "dexie";

async function test() {
  try {
    const db = new Dexie("nextup");
    
    db.version(2).stores({
      games: "++id, title, pool, reserved",
      events: "++id, type, timestamp",
      points: "++id, timestamp",
      board: "id"
    });

    db.version(3).stores({
      games: "++id, title, pool, reserved",
      events: "++id, type, timestamp",
      points: "++id, timestamp",
      board: "id",
      metadata: "key"
    });

    db.version(4).stores({
      games: "++id, title, pool, reserved, *platforms",
      events: "++id, type, timestamp",
      points: "++id, timestamp",
      board: "id",
      metadata: "key"
    });

    await db.open();
    console.log("DB opened successfully");
    
    const allGames = await db.games.toArray();
    console.log("Games:", allGames);
  } catch (error) {
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
  }
}

test();
