const DEVELOPER_MODE_KEY = "nextup:developer-mode";
const HIGH_CONTRAST_MODE_KEY = "nextup:high-contrast-mode";

function getStoredBoolean(key: string, fallback: boolean) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = window.localStorage.getItem(key);

  if (value === null) {
    return fallback;
  }

  return value === "true";
}

function setStoredBoolean(key: string, enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, String(enabled));
}

export function isDeveloperModeEnabled() {
  // Developer mode is intentionally off by default.
  return getStoredBoolean(DEVELOPER_MODE_KEY, false);
}

export function setDeveloperModeEnabled(enabled: boolean) {
  setStoredBoolean(DEVELOPER_MODE_KEY, enabled);
}

export function isHighContrastModeEnabled() {
  return getStoredBoolean(HIGH_CONTRAST_MODE_KEY, false);
}

export function applyHighContrastMode(enabled: boolean) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.contrast = enabled ? "high" : "default";
}

export function setHighContrastModeEnabled(enabled: boolean) {
  setStoredBoolean(HIGH_CONTRAST_MODE_KEY, enabled);
  applyHighContrastMode(enabled);
}

export function initializeRuntimePreferences() {
  applyHighContrastMode(isHighContrastModeEnabled());
}

declare global {
  interface Window {
    nextUp?: {
      setDeveloperMode: (enabled: boolean) => void;
      getDeveloperMode: () => boolean;
      setHighContrastMode: (enabled: boolean) => void;
      getHighContrastMode: () => boolean;
    };
  }
}

export function registerConsoleToggles() {
  if (typeof window === "undefined") {
    return;
  }

  window.nextUp = {
    setDeveloperMode(enabled: boolean) {
      setDeveloperModeEnabled(enabled);
      console.info(`Developer mode ${enabled ? "enabled" : "disabled"}. Reload to apply initialization-only behavior.`);
    },
    getDeveloperMode() {
      return isDeveloperModeEnabled();
    },
    setHighContrastMode(enabled: boolean) {
      setHighContrastModeEnabled(enabled);
      console.info(`High contrast mode ${enabled ? "enabled" : "disabled"}.`);
    },
    getHighContrastMode() {
      return isHighContrastModeEnabled();
    }
  };
}
