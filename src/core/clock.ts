const CLOCK_OFFSET_STORAGE_KEY = "nextup.clockOffsetMs";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function readStoredClockOffset() {
    if (typeof localStorage === "undefined") {
        return 0;
    }

    const rawValue = localStorage.getItem(CLOCK_OFFSET_STORAGE_KEY);

    if (!rawValue) {
        return 0;
    }

    const parsedValue = Number(rawValue);

    return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function persistClockOffset(offsetMs: number) {
    if (typeof localStorage === "undefined") {
        return;
    }

    localStorage.setItem(CLOCK_OFFSET_STORAGE_KEY, String(offsetMs));
}

let clockOffsetMs = readStoredClockOffset();

export function now(): number {
    return Date.now() + clockOffsetMs;
}

export function getClockOffsetMs() {
    return clockOffsetMs;
}

export function advanceClockByDays(days: number) {
    if (!Number.isFinite(days)) {
        return clockOffsetMs;
    }

    const dayDelta = Math.trunc(days);

    if (dayDelta === 0) {
        return clockOffsetMs;
    }

    clockOffsetMs += dayDelta * MS_PER_DAY;
    persistClockOffset(clockOffsetMs);

    return clockOffsetMs;
}

export function resetClockOffset() {
    clockOffsetMs = 0;
    persistClockOffset(clockOffsetMs);

    return clockOffsetMs;
}