import { db, type BoardState, type Event, type Game, type MetadataEntry, type PointTransaction } from "../db";

interface FullDataBackupPayload {
  schemaVersion: number;
  exportedAt?: string;
  data: {
    library: Game[];
    eventLog: Event[];
    board?: BoardState | null;
    points: PointTransaction[];
    metadata: MetadataEntry[];
  };
}

export interface FullDataBackupRestoreResult {
  gameCount: number;
  eventCount: number;
  pointEntryCount: number;
  restoredBoard: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseFullDataBackupPayload(text: string): FullDataBackupPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Backup file is not valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("Backup file has an invalid structure.");
  }

  if (parsed.schemaVersion !== 1) {
    throw new Error("Unsupported backup schema version.");
  }

  const data = parsed.data;

  if (!isRecord(data)) {
    throw new Error("Backup file is missing its data payload.");
  }

  const library = data.library;
  const eventLog = data.eventLog;
  const board = data.board;
  const points = data.points;
  const metadata = data.metadata;

  if (!Array.isArray(library) || !Array.isArray(eventLog) || !Array.isArray(points) || !Array.isArray(metadata)) {
    throw new Error("Backup file is missing one or more required collections.");
  }

  if (board !== undefined && board !== null && !isRecord(board)) {
    throw new Error("Backup file contains an invalid board snapshot.");
  }

  return {
    schemaVersion: 1,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : undefined,
    data: {
      library: library as Game[],
      eventLog: eventLog as Event[],
      board: (board ?? null) as BoardState | null,
      points: points as PointTransaction[],
      metadata: metadata as MetadataEntry[]
    }
  };
}

export function formatFullDataRestoreSummary(result: FullDataBackupRestoreResult) {
  return `Restored backup: ${result.gameCount} game${result.gameCount === 1 ? "" : "s"}, ${result.eventCount} event${result.eventCount === 1 ? "" : "s"}, and ${result.pointEntryCount} point entr${result.pointEntryCount === 1 ? "y" : "ies"}${result.restoredBoard ? ", including the current board." : "."}`;
}

export async function restoreFullDataBackup(text: string): Promise<FullDataBackupRestoreResult> {
  const payload = parseFullDataBackupPayload(text);
  const { library, eventLog, board, points, metadata } = payload.data;

  await db.transaction("rw", db.games, db.events, db.points, db.board, db.metadata, async () => {
    await Promise.all([
      db.games.clear(),
      db.events.clear(),
      db.points.clear(),
      db.board.clear(),
      db.metadata.clear()
    ]);

    if (library.length > 0) {
      await db.games.bulkPut(library);
    }

    if (eventLog.length > 0) {
      await db.events.bulkPut(eventLog);
    }

    if (points.length > 0) {
      await db.points.bulkPut(points);
    }

    if (metadata.length > 0) {
      await db.metadata.bulkPut(metadata);
    }

    if (board) {
      await db.board.put(board);
    }
  });

  return {
    gameCount: library.length,
    eventCount: eventLog.length,
    pointEntryCount: points.length,
    restoredBoard: Boolean(board)
  };
}