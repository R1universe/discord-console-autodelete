  const NAME = "DiscordAutoDelete";
  const HOST_ID = "discord-autodelete-v2";
  const SETTINGS_KEY = "discord-autodelete-ui-v2";
  const VERSION = "3.19.0";
  const validId = value => /^\d{15,22}$/.test(String(value ?? ""));
  const validDelay = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 86400;
  const scopes = new Set(["all", "servers", "dm"]);

  if (window[NAME]?.open) {
    if (window[NAME].version === VERSION) {
      window[NAME].open();
      console.info("[AutoDelete] Version " + VERSION + " already running; panel reopened.");
      return;
    }
    // Pasting an updated script used to reopen older code instead of loading it.
    // Stopping an older build cancels its pending timers; new build starts disabled.
    try { window[NAME].stop?.(); }
    catch (error) {
      console.warn("[AutoDelete] Could not stop older version:", error);
      return;
    }
    if (window[NAME]?.open) {
      console.warn("[AutoDelete] Older instance is still active; stop it before upgrading.");
      return;
    }
    console.info("[AutoDelete] Previous version stopped; new build starts disabled.");
  }
  if (location.hostname !== "discord.com" && !location.hostname.endsWith(".discord.com")) {
    console.error("[AutoDelete] Open https://discord.com/app first.");
    return;
  }

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch {}
  // Migrate the previous shared delay into both independent settings.
  const legacyDelay = validDelay(saved.delay) ? Number(saved.delay) : 10;
  const config = {
    serverDelay: validDelay(saved.serverDelay) ? Number(saved.serverDelay) : legacyDelay,
    dmDelay: validDelay(saved.dmDelay) ? Number(saved.dmDelay) : legacyDelay,
    scope: scopes.has(saved.scope) ? saved.scope : "all",
    diagnosticsHeight: Number.isFinite(saved.diagnosticsHeight) ? Math.max(100, Math.min(520, Math.round(saved.diagnosticsHeight))) : 170,
    excludedDms: Array.isArray(saved.excludedDms) ? [...new Set(saved.excludedDms.filter(validId).map(String))].slice(0, 300) : [],
    excludedGuilds: Array.isArray(saved.excludedGuilds) ? [...new Set(saved.excludedGuilds.filter(validId).map(String))].slice(0, 300) : []
  };
  const state = {
    ready: false, enabled: false, error: "", pending: new Map(),
    requests: 0, deleted: 0, failed: 0, skipped: 0, detected: 0, processed: new Set(), processedNonces: new Set(),
    attemptedIds: new Set(), countedDeleted: new Set(), cacheSeen: new Map(), cacheObservedSince: new Map(), enabledSince: 0, nextDeletionAt: 0, monitor: "",
    accountId: null, connected: null, recent: [], destroyed: false
  };
  let ticker = null;
  let hooks = null;
  let pickerKind = null;

  function save() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(config)); } catch {}
  }

  // A Shadow DOM keeps the controls isolated from Discord's CSS.
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "position:fixed;z-index:2147483000;right:24px;top:86px;";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
