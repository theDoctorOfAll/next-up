import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { initializeRuntimePreferences, registerConsoleToggles } from "./core/runtimePreferences";
import "./styles/globals.css";

if (import.meta.env.PROD) {
  registerSW({
    immediate: true
  });
} else if ("serviceWorker" in navigator) {
  // Prevent stale cached assets from a previous preview/prod service worker during local HMR.
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      void registration.unregister();
    });
  });
}

initializeRuntimePreferences();
registerConsoleToggles();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);