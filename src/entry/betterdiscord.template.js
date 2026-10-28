/**
 * @name AutoDelete
 * @author Archivarius
 * @description Discord AutoDelete v3.21 panel for BetterDiscord. Manual Enable required. Unofficial user-account automation; account risk.
 * @version 3.21.0
 * @source https://github.com/R1universe/discord-console-autodelete/blob/main/AutoDelete.plugin.js
 */

// Standalone BetterDiscord wrapper for autodelete.js. No BDFDB dependency.
// Keep the original console script unchanged; this is a separate distribution.
"use strict";

/*
 * Discord AutoDelete v3.21 — compact UI and bottom-edge log resizing
 * This is NOT a supported Discord API integration. Self-bots can result in bans.
 * No token extraction, credential access, external code or network requests.
 * Does not read, log or store the contents of messages.
 */
function launchAutoDelete() {
  "use strict";

/*__AUTODELETE_CORE__*/
}

module.exports = class AutoDelete {
  constructor() {
    this._active = false;
    this._controller = null;
    this._startupTimer = null;
    this._retryTimer = null;
    this._bodyAttempts = 0;
  }

  start() {
    if (this._active) return;
    this._active = true;
    this._bodyAttempts = 0;
    this._bootWhenReady();
  }

  _bootWhenReady() {
    if (!this._active) return;
    if (!document.body) {
      if (++this._bodyAttempts > 60) {
        console.error("[AutoDeletePlugin] Discord document did not become ready.");
        return;
      }
      this._startupTimer = setTimeout(() => this._bootWhenReady(), 250);
      return;
    }

    // Do not take ownership of a manually injected console instance.
    if (window.DiscordAutoDelete) {
      console.warn("[AutoDeletePlugin] AutoDelete is already running in this window. Stop that instance before enabling the plugin.");
      return;
    }

    try {
      launchAutoDelete();
      const controller = window.DiscordAutoDelete;
      if (!controller || typeof controller.stop !== "function") {
        console.error("[AutoDeletePlugin] AutoDelete did not initialize. Check the Discord hostname and console errors.");
        return;
      }
      this._controller = controller;
    } catch (error) {
      console.error("[AutoDeletePlugin] Startup failed:", error);
      return;
    }

    // Canary may launch plugins before its internal Discord modules are ready.
    // Retry only while disconnected; never reset monitoring after Enable.
    let retries = 0;
    this._retryTimer = setInterval(() => {
      if (!this._active || window.DiscordAutoDelete !== this._controller || this._controller.connected) {
        this._clearRetry();
        return;
      }
      if (++retries > 20) {
        this._clearRetry();
        console.warn("[AutoDeletePlugin] Connection was not established after startup retries; use Retry connection in the panel.");
        return;
      }
      try {
        this._controller.retry();
      } catch (error) {
        console.warn("[AutoDeletePlugin] Connection retry failed:", error);
      }
    }, 1500);
  }

  _clearRetry() {
    if (this._retryTimer !== null) {
      clearInterval(this._retryTimer);
      this._retryTimer = null;
    }
  }

  stop() {
    this._active = false;
    if (this._startupTimer !== null) {
      clearTimeout(this._startupTimer);
      this._startupTimer = null;
    }
    this._clearRetry();
    const controller = this._controller;
    this._controller = null;
    if (controller && window.DiscordAutoDelete === controller) {
      try {
        controller.stop(); // Unsubscribes events, cancels deletion jobs, removes UI.
      } catch (error) {
        console.error("[AutoDeletePlugin] Cleanup failed:", error);
      }
    }
  }
};
