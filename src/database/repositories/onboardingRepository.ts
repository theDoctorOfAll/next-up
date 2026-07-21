import { db } from "../db";

const ONBOARDING_COMPLETED_KEY = "onboardingCompleted";
const ONBOARDING_OBJECTIVE_KEY = "onboardingObjective";
const ONBOARDING_LOCKED_OUT_KEY = "onboardingLockedOut";
const INITIAL_LIBRARY_SEEDED_KEY = "initialGameLibrarySeeded";

export type OnboardingObjective = "explore-everything" | "burn-the-backlog";

export async function isOnboardingCompleted() {
  const entry = await db.metadata.get(ONBOARDING_COMPLETED_KEY);
  return entry?.value === true;
}

export async function isOnboardingLockedOut() {
  const lockEntry = await db.metadata.get(ONBOARDING_LOCKED_OUT_KEY);

  if (lockEntry?.value === true) {
    return true;
  }

  const [completedEntry, seedEntry, gameCount] = await Promise.all([
    db.metadata.get(ONBOARDING_COMPLETED_KEY),
    db.metadata.get(INITIAL_LIBRARY_SEEDED_KEY),
    db.games.count()
  ]);

  const locked = completedEntry?.value === true || seedEntry?.value === true || gameCount > 0;

  if (locked) {
    await db.metadata.put({
      key: ONBOARDING_LOCKED_OUT_KEY,
      value: true,
      updatedAt: Date.now()
    });
  }

  return locked;
}

export async function getOnboardingObjective(): Promise<OnboardingObjective | null> {
  const entry = await db.metadata.get(ONBOARDING_OBJECTIVE_KEY);

  if (entry?.value === "explore-everything" || entry?.value === "burn-the-backlog") {
    return entry.value;
  }

  return null;
}

export async function markOnboardingCompleted() {
  const updatedAt = Date.now();

  await db.metadata.bulkPut([
    {
      key: ONBOARDING_COMPLETED_KEY,
      value: true,
      updatedAt
    },
    {
      key: ONBOARDING_LOCKED_OUT_KEY,
      value: true,
      updatedAt
    }
  ]);
}

export async function completeOnboarding(objective: OnboardingObjective) {
  const updatedAt = Date.now();

  await db.metadata.bulkPut([
    {
      key: ONBOARDING_COMPLETED_KEY,
      value: true,
      updatedAt
    },
    {
      key: ONBOARDING_OBJECTIVE_KEY,
      value: objective,
      updatedAt
    },
    {
      key: ONBOARDING_LOCKED_OUT_KEY,
      value: true,
      updatedAt
    }
  ]);
}