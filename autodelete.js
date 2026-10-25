/*
 * Discord AutoDelete v2 — interactive console experiment
 * This is NOT a supported Discord API integration. Self-bots can result in bans.
 * No token extraction, credential access, external code or network requests.
 * Does not read, log or store the contents of messages.
 */
(() => {
  "use strict";

  const NAME = "DiscordAutoDelete";
  const HOST_ID = "discord-autodelete-v2";
  const SETTINGS_KEY = "discord-autodelete-ui-v2";
  const VERSION = "3.0.0";
  const validId = value => /^\d{15,22}$/.test(String(value ?? ""));
  const validDelay = value => Number.isInteger(Number(value)) && Number(value) >= 2 && Number(value) <= 86400;
  const scopes = new Set(["all", "servers", "dm"]);

  if (window[NAME]?.open) {
    window[NAME].open();
    console.info("[AutoDelete] Already installed in this tab. Reopened the panel.");
    return;
  }
  if (location.hostname !== "discord.com" && !location.hostname.endsWith(".discord.com")) {
    console.error("[AutoDelete] Open https://discord.com/app first.");
    return;
  }

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch {}
  const config = {
    delay: validDelay(saved.delay) ? Number(saved.delay) : 10,
    scope: scopes.has(saved.scope) ? saved.scope : "all"
  };
  const state = {
    ready: false, enabled: false, error: "", pending: new Map(),
    requests: 0, failed: 0, skipped: 0, detected: 0, processed: new Set(), cacheSeen: new Map(), monitor: "",
    accountId: null, connected: null, recent: [], destroyed: false
  };
  let ticker = null;
  let hooks = null;

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
  style.textContent = [
    ":host{all:initial;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;color:#edf0fa;font-size:13px}",
    "*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}button:disabled{opacity:.38;cursor:not-allowed}",
    ".panel{width:370px;max-width:calc(100vw - 30px);background:#11141e;border:1px solid #333b54;border-radius:18px;box-shadow:0 18px 58px #000b,0 2px 8px #0008;overflow:hidden}",
    ".head{padding:18px 18px 13px;background:linear-gradient(130deg,#202644,#171a29 70%);cursor:grab;touch-action:none;user-select:none}",
    ".top{display:flex;align-items:center;justify-content:space-between;gap:10px}",
    ".brand{display:flex;align-items:center;gap:10px}.brand-icon{display:grid;place-items:center;width:35px;height:35px;border-radius:11px;background:#7778ef22;border:1px solid #888aff55;color:#b6b3ff;font-size:20px}",
    "h1{font-size:15px;line-height:1.2;margin:0;font-weight:720;letter-spacing:-.2px}.muted{color:#9ba4c0;font-size:11px}.version{color:#9298b8;font-size:10px;font-weight:600}",
    ".head-buttons{display:flex;gap:6px}.mini{min-width:26px;height:27px;padding:0 7px;border:1px solid #4b5370;border-radius:8px;color:#abb2d3;background:#ffffff08}",
    ".mini:hover{background:#ffffff14}.state{display:flex;align-items:center;justify-content:space-between;margin-top:15px}",
    ".status{display:inline-flex;align-items:center;gap:7px;font-size:11px;color:#aeb8d5;font-weight:700;letter-spacing:.45px}",
    ".dot{height:8px;width:8px;border-radius:50%;background:#777e96}.dot.active{background:#49d6a4;box-shadow:0 0 0 4px #49d6a422}.dot.error{background:#ff9a88}.dot.paused{background:#efbf68}",
    ".body{padding:16px 18px}.desc{color:#a1abc6;font-size:12px;line-height:1.55;margin:0 0 15px}",
    ".warning{border:1px solid #705b35;border-radius:9px;background:#f8bf4811;padding:9px 11px;color:#dec28b;font-size:11px;line-height:1.45;margin-bottom:15px}",
    ".warning.error{border-color:#894e60;background:#ff627e13;color:#ffb7c2}",
    ".field{margin-bottom:15px}.fieldrow{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}",
    "label{font-weight:650;font-size:12px;color:#d5d9ef}.hint{font-size:10px;color:#8c97b3}",
    ".delay{display:flex;gap:8px;align-items:center}.value{width:85px;padding:9px 10px;border:1px solid #3b4562;background:#202638;color:#f1f2ff;border-radius:9px;outline:none}",
    ".value:focus,select:focus{border-color:#8f91ff;box-shadow:0 0 0 2px #8f91ff22}",
    ".presets{display:flex;flex:1;gap:5px}.preset{flex:1;border:1px solid #3a445e;background:#222838;color:#aeb6d1;border-radius:8px;padding:9px 0;font-size:11px}",
    ".preset.selected{color:#dddfff;border-color:#8686fa;background:#8c8aff22}",
    "select{display:block;width:100%;appearance:auto;padding:10px;background:#202638;color:#ebedfc;border:1px solid #3b4562;border-radius:9px}",
    ".primary{width:100%;border:0;padding:11px 12px;border-radius:10px;background:#8c8bfa;color:#111325;font-weight:750;font-size:12px}",
    ".primary:hover:not(:disabled){background:#a4a4ff}.primary.stop{background:#2b344c;color:#e6e9fa;border:1px solid #515d7b}",
    ".reconnect{margin-top:8px;width:100%;border:1px solid #4c5778;background:transparent;padding:9px;border-radius:9px;color:#c6cdf7}",
    ".statrow{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:15px}",
    ".stat{border:1px solid #333b52;background:#1b2030;padding:10px 7px;border-radius:10px;text-align:center}",
    ".stat strong{display:block;font-size:18px;line-height:1.3;letter-spacing:-.5px;color:#f4f4ff}",
    ".stat span{font-size:10px;color:#929cb8}.next{font-size:11px;color:#9ca5bc;margin:10px 0 0;text-align:center}",
    ".logs{margin-top:14px;padding-top:13px;border-top:1px solid #2f3549}.logshead{display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:700;color:#b9c3dd;margin-bottom:8px}",
    ".loglist{max-height:125px;overflow:auto;scrollbar-width:thin;color:#a5aec8;font-family:ui-monospace,SFMono-Regular,monospace;font-size:10px}",
    ".logitem{padding:3px 0;overflow-wrap:anywhere;line-height:1.45}.logitem .time{color:#65708e;margin-right:5px}.logitem.bad{color:#ffa2b5}.logitem.good{color:#82e0bd}",
    ".footer{display:flex;justify-content:space-between;align-items:center;padding:11px 18px;border-top:1px solid #293047;background:#151a27}",
    ".footer span{color:#8893b0;font-size:10px}.footer button{border:0;background:none;color:#abb5dc;font-size:11px}",
    ".pill{display:none;align-items:center;gap:10px;background:#171c2a;border:1px solid #5b6485;color:#ecefff;border-radius:99px;padding:10px 14px;box-shadow:0 8px 30px #0008;font-weight:650}",
    ".collapsed .panel{display:none}.collapsed .pill{display:flex}",
    "@media(max-width:500px){.panel{max-width:calc(100vw - 16px)}.body{padding:12px}.head{padding:14px}}"
  ].join("\n");
  shadow.appendChild(style);

  const root = document.createElement("div");
  root.innerHTML = [
    '<section class="panel" role="region" aria-label="Discord AutoDelete controls">',
      '<div class="head" id="ad-head">',
        '<div class="top">',
          '<div class="brand"><div class="brand-icon">◷</div><div><h1>AutoDelete <span class="version">v3</span></h1><div class="muted">Timed Discord messages</div></div></div>',
          '<div class="head-buttons"><button class="mini" id="ad-min" title="Minimize" aria-label="Minimize">−</button><button class="mini" id="ad-close" title="Stop and close" aria-label="Close">×</button></div>',
        '</div>',
        '<div class="state"><span class="status"><i class="dot" id="ad-dot"></i><span id="ad-state">CONNECTING</span></span><span class="version">LOCAL · v', VERSION, '</span></div>',
      '</div>',
      '<div class="body">',
        '<p class="desc">Automatically delete your own new messages. Choose settings, then enable monitoring.</p>',
        '<div class="warning" id="ad-warning">Unofficial account automation can lead to a Discord suspension or ban.</div>',
        '<div class="field"><div class="fieldrow"><label for="ad-delay">Deletion delay</label><span class="hint">2–86400 sec</span></div>',
          '<div class="delay"><input class="value" id="ad-delay" type="number" min="2" max="86400" step="1" aria-label="Delay in seconds"><div class="presets">',
          '<button class="preset" data-delay="5">5s</button><button class="preset" data-delay="10">10s</button><button class="preset" data-delay="30">30s</button><button class="preset" data-delay="60">60s</button>',
        '</div></div></div>',
        '<div class="field"><div class="fieldrow"><label for="ad-scope">Where to delete</label><span class="hint">Your messages only</span></div>',
          '<select id="ad-scope"><option value="all">Everywhere: servers and DMs</option><option value="servers">Servers only</option><option value="dm">DMs and group DMs only</option></select></div>',
        '<button class="primary" id="ad-toggle" disabled>Checking connection…</button>',
        '<button class="reconnect" id="ad-retry" style="display:none">Retry connection</button>',
        '<div class="statrow"><div class="stat"><strong id="ad-pending">0</strong><span>Queued</span></div>',
        '<div class="stat"><strong id="ad-requests">0</strong><span>Requests</span></div>',
        '<div class="stat"><strong id="ad-failed">0</strong><span>Errors</span></div></div>',
        '<div class="next" id="ad-next">No scheduled deletions</div>',
        '<div class="logs"><div class="logshead">ACTIVITY LOG <span class="hint">No message content recorded</span></div><div class="loglist" id="ad-logs" aria-live="polite"></div></div>',
      '</div>',
      '<div class="footer"><span>Settings saved locally</span><button id="ad-retry-foot">Reconnect ↻</button></div>',
    '</section>',
    '<button id="ad-pill" class="pill" type="button" aria-label="Open AutoDelete"><span>◷</span><span id="ad-pill-text">AutoDelete · Off</span></button>'
  ].join("");
  shadow.appendChild(root);
  const el = id => shadow.getElementById(id);

  function notify(message, tone = "") {
    const entry = { time: new Date().toLocaleTimeString(), message, tone };
    state.recent.unshift(entry);
    if (state.recent.length > 18) state.recent.length = 18;
    const list = el("ad-logs");
    if (list) {
      list.replaceChildren();
      state.recent.slice(0, 6).forEach(item => {
        const line = document.createElement("div");
        line.className = "logitem " + item.tone;
        const date = document.createElement("span");
        date.className = "time";
        date.textContent = item.time;
        const msg = document.createElement("span");
        msg.textContent = item.message;
        line.append(date, msg);
        list.appendChild(line);
      });
    }
    if (tone === "bad") console.warn("[AutoDelete] " + message);
    else console.info("[AutoDelete] " + message);
  }

  function render() {
    if (state.destroyed) return;
    const mode = state.error ? "ERROR" : !state.ready ? "CONNECTING" : state.enabled ? "ACTIVE" : "PAUSED";
    el("ad-state").textContent = mode;
    el("ad-dot").className = "dot " + (state.error ? "error" : state.enabled ? "active" : "paused");
    el("ad-warning").className = "warning" + (state.error ? " error" : "");
    el("ad-warning").textContent = state.error ?
      "Connection failed: " + state.error : "Self-bots violate Discord's rules. Deletion is not guaranteed and other users may retain copies.";
    el("ad-toggle").disabled = !state.ready;
    el("ad-toggle").textContent = state.enabled ? "Pause · clear queue" : "Enable auto-delete";
    el("ad-toggle").className = "primary" + (state.enabled ? " stop" : "");
    el("ad-retry").style.display = state.ready ? "none" : "block";
    el("ad-delay").value = config.delay;
    el("ad-scope").value = config.scope;
    shadow.querySelectorAll("[data-delay]").forEach(btn =>
      btn.classList.toggle("selected", Number(btn.dataset.delay) === config.delay)
    );
    el("ad-pending").textContent = state.pending.size;
    el("ad-requests").textContent = state.requests;
    el("ad-failed").textContent = state.failed;
    const jobs = [...state.pending.values()];
    const next = jobs.length ? Math.min(...jobs.map(job => job.deadline)) : 0;
    el("ad-next").textContent = next ?
      "Next deletion in " + Math.max(0, Math.ceil((next - Date.now()) / 1000)) + " sec." :
      "No scheduled deletions";
    el("ad-pill-text").textContent = "AutoDelete · " + (state.enabled ? "Active" : state.error ? "Error" : "Paused");
  }

  function cancel(id) {
    const key = String(id ?? "");
    const job = state.pending.get(key);
    if (!job) return;
    clearTimeout(job.timer);
    state.pending.delete(key);
    render();
  }
  function clearPending() {
    for (const job of state.pending.values()) clearTimeout(job.timer);
    state.pending.clear();
    render();
  }

  function addCandidates(cache) {
    const found = [], seen = new Set();
    const put = value => {
      if (!value || (typeof value !== "object" && typeof value !== "function") || seen.has(value)) return;
      seen.add(value);
      found.push(value);
    };
    for (const entry of Object.values(cache)) {
      try {
        const exported = entry?.exports;
        put(exported);
        if (!exported) continue;
        for (const key of Object.keys(exported)) {
          try { put(exported[key]); } catch {}
        }
      } catch {}
    }
    return found;
  }
  function choose(candidates, predicate, displayName, preference) {
    const matches = candidates.filter(item => {
      try { return predicate(item); } catch { return false; }
    });
    const preferred = matches.filter(item => {
      try { return preference?.(item); } catch { return false; }
    });
    const options = preferred.length === 1 ? preferred : matches.length === 1 ? matches : [];
    if (options.length !== 1) throw new Error(displayName + ": " + matches.length + " candidates; cannot select safely");
    return options[0];
  }
  const storeNamed = name => obj => {
    try { return Object.getPrototypeOf(obj)?.constructor?.displayName === name || obj?.constructor?.displayName === name; }
    catch { return false; }
  };

  function discover() {
    const chunk = window.webpackChunkdiscord_app;
    if (!chunk || typeof chunk.push !== "function") throw new Error("Discord's Webpack runtime is not available.");
    const runtimes = [], marker = Symbol("AutoDelete");
    try {
      chunk.push([[marker], {}, req => {
        if (req?.c && !runtimes.includes(req)) runtimes.push(req);
      }]);
      if (chunk.at(-1)?.[0]?.[0] === marker) chunk.pop();
    } catch (err) {
      throw new Error("Unable to inspect module registry: " + String(err?.message ?? err));
    }
    runtimes.sort((a, b) => Object.keys(b.c).length - Object.keys(a.c).length);
    if (!runtimes.length) throw new Error("No Webpack module cache was found.");

    const diagnostics = [];
    for (const req of runtimes) {
      const items = addCandidates(req.c);
      // Some builds export the active Dispatcher via a minified property of this module.
      const known = req.c?.[73153]?.exports;
      if (known) {
        for (const value of Object.values(known)) if (!items.includes(value)) items.push(value);
      }
      function pick(predicate, preference) {
        const matches = items.filter(x => { try { return predicate(x); } catch { return false; } });
        if (!matches.length) return null;
        const preferred = matches.filter(x => { try { return preference?.(x); } catch { return false; } });
        return preferred.length === 1 ? preferred[0] : matches.length === 1 ? matches[0] : null;
      }
      const users = pick(x => typeof x?.getCurrentUser === "function" &&
        typeof x?.getUser === "function", storeNamed("UserStore"));
      const actions = pick(x => typeof x?.deleteMessage === "function",
        x => typeof x.startEditMessage === "function" || typeof x.editMessage === "function");
      const rest = pick(x => typeof x?.del === "function" &&
        typeof x?.get === "function" && typeof x?.post === "function",
        x => typeof x.patch === "function" && typeof x.put === "function");
      const store = pick(x => typeof x?.getMessages === "function" &&
        typeof x?.getMessage === "function", storeNamed("MessageStore"));
      const selected = pick(x => typeof x?.getChannelId === "function",
        storeNamed("SelectedChannelStore"));
      const channel = pick(x => typeof x?.getChannel === "function" &&
        (typeof x?.getDMFromUserId === "function" || typeof x?.getChannels === "function"),
        storeNamed("ChannelStore"));

      // No undocumented/private property is required on a Dispatcher candidate:
      // other projects confirm that some current builds expose only subscribe+dispatch.
      const dispatchers = items.filter(x => {
        try { return typeof x?.subscribe === "function" && typeof x?.dispatch === "function"; }
        catch { return false; }
      }).filter((item, idx, arr) => arr.indexOf(item) === idx).slice(0, 24);
      const accountId = String(users?.getCurrentUser()?.id ?? "");
      const canObserve = dispatchers.length > 0 || (store && selected);
      if (users && validId(accountId) && (actions || rest) && canObserve) {
        return {
          users, actions, rest, messageStore: store, selectedChannel: selected,
          channelStore: channel, dispatchers, accountId, moduleCount: items.length
        };
      }
      diagnostics.push("cache=" + items.length + " user=" + !!users +
        " actions=" + !!actions + " REST=" + !!rest +
        " eventSources=" + dispatchers.length + " messageStore=" + !!store +
        " selected=" + !!selected);
    }
    throw new Error("Required internal modules not found. " + diagnostics.join("; "));
  }

  function scopeMatches(msg, channelId) {
    if (config.scope === "all") return true;
    const channel = hooks.channelStore?.getChannel(channelId);
    const type = channel?.type;
    const direct = type === 1 || type === 3;
    const guild = Boolean(msg.guild_id ?? msg.guildId ?? channel?.guild_id ?? channel?.guildId);
    if (config.scope === "dm") return direct || (!guild && !channel);
    return guild && !direct;
  }
  function onCreate(event) {
    if (!state.enabled || !hooks || state.destroyed) return;
    const msg = event?.message;
    if (!msg || String(msg.author?.id ?? "") !== state.accountId) return;
    if (event?.optimistic === true || msg.optimistic === true) return;
    const id = String(msg.id ?? "");
    const channelId = String(event?.channelId ?? event?.channel_id ?? msg.channel_id ?? msg.channelId ?? "");
    if (!validId(id) || !validId(channelId) || state.pending.has(id) || state.processed.has(id)) return;
    if (!scopeMatches(msg, channelId)) { state.skipped++; return; }
    state.processed.add(id);
    if (state.processed.size > 5000) state.processed.delete(state.processed.values().next().value);
    state.detected++;
    const deadline = Date.now() + config.delay * 1000;
    const timer = setTimeout(async () => {
      state.pending.delete(id);
      render();
      if (state.destroyed || !state.enabled) return;
      if (String(hooks.users.getCurrentUser()?.id ?? "") !== state.accountId) {
        state.skipped++;
        notify("Account changed — skipping deletion.", "bad");
        render();
        return;
      }
      try {
        if (hooks.rest) {
          await Promise.resolve(hooks.rest.del({ url: "/channels/" + channelId + "/messages/" + id }));
        } else {
          await Promise.resolve(hooks.actions.deleteMessage(channelId, id));
        }
        state.requests++;
        notify("Delete request completed.", "good");
      } catch (err) {
        state.failed++;
        notify("Delete failed: " + String(err?.message ?? err).slice(0, 140), "bad");
      }
      render();
    }, config.delay * 1000);
    state.pending.set(id, { timer, deadline });
    notify("Message queued for " + config.delay + "s.");
    render();
  }
  function onDelete(event) { cancel(event?.id ?? event?.messageId ?? event?.message?.id); }

  // Cache polling is an independent fallback when Discord does not expose a
  // usable FluxDispatcher. It only sees messages in the currently open channel.
  function cachedMessages() {
    if (!hooks?.messageStore || !hooks?.selectedChannel) return null;
    const channelId = String(hooks.selectedChannel.getChannelId?.() ?? "");
    if (!validId(channelId)) return null;
    const messages = hooks.messageStore.getMessages(channelId);
    const items = messages?._array ?? messages?.toArray?.() ?? [];
    return { channelId, items: Array.isArray(items) ? items : [] };
  }
  function scanCache() {
    if (!state.ready || !state.enabled || state.destroyed || !hooks) return;
    let cache;
    try { cache = cachedMessages(); } catch { return; }
    if (!cache) return;
    const { channelId, items } = cache;
    if (!state.cacheSeen.has(channelId)) {
      // Establish a baseline instead of accidentally deleting old history.
      state.cacheSeen.set(channelId, new Set(items.map(m => String(m?.id ?? ""))));
      return;
    }
    const seen = state.cacheSeen.get(channelId);
    for (const msg of items) {
      const id = String(msg?.id ?? "");
      if (!validId(id) || seen.has(id)) continue;
      seen.add(id);
      if (String(msg.author?.id ?? "") === state.accountId)
        onCreate({ message: msg, channelId });
    }
    if (seen.size > 2500) {
      state.cacheSeen.set(channelId, new Set(items.map(m => String(m?.id ?? ""))));
    }
  }
  function primeCache() {
    state.cacheSeen.clear();
    try {
      const cache = cachedMessages();
      if (cache) state.cacheSeen.set(cache.channelId, new Set(cache.items.map(m => String(m?.id ?? ""))));
    } catch {}
  }

  function disconnect() {
    if (hooks) {
      for (const dispatcher of hooks.activeDispatchers ?? []) {
        try { dispatcher.unsubscribe?.("MESSAGE_CREATE", onCreate); } catch {}
        try { dispatcher.unsubscribe?.("MESSAGE_DELETE", onDelete); } catch {}
      }
    }
    hooks = null;
    state.ready = false;
    state.enabled = false;
    state.cacheSeen.clear();
    clearPending();
  }
  function connect() {
    disconnect();
    state.error = "";
    try {
      const discovered = discover();
      hooks = discovered;
      state.accountId = discovered.accountId;
      discovered.activeDispatchers = [];
      for (const dispatcher of discovered.dispatchers) {
        try {
          dispatcher.subscribe("MESSAGE_CREATE", onCreate);
          dispatcher.subscribe("MESSAGE_DELETE", onDelete);
          discovered.activeDispatchers.push(dispatcher);
        } catch {
          try { dispatcher.unsubscribe?.("MESSAGE_CREATE", onCreate); } catch {}
        }
      }
      const usingCache = !!(discovered.messageStore && discovered.selectedChannel);
      if (!discovered.activeDispatchers.length && !usingCache)
        throw new Error("No active message-event source was found.");
      state.monitor = discovered.activeDispatchers.length ?
        "Flux (" + discovered.activeDispatchers.length + ")" + (usingCache ? " + open-channel cache" : "") :
        "Open-channel cache only";
      state.ready = true;
      state.enabled = false;
      notify("Connected: " + state.monitor + ". Click Enable to start.", "good");
      if (!discovered.activeDispatchers.length)
        notify("Limited coverage: only the open channel is monitored.", "bad");
    } catch (err) {
      disconnect();
      state.error = String(err?.message ?? err);
      notify("Connection error: " + state.error, "bad");
    }
    render();
    return state.ready;
  }
  function pause() { state.enabled = false; clearPending(); notify("Paused — scheduled deletions cancelled."); render(); }
  function resume() {
    if (!state.ready || !hooks) return false;
    if (String(hooks.users.getCurrentUser()?.id ?? "") !== state.accountId) {
      state.error = "Account changed. Reconnect first.";
      pause();
      render();
      return false;
    }
    primeCache();
    state.enabled = true;
    notify("Auto-delete enabled.", "good");
    render();
    return true;
  }
  function setDelay(value) {
    if (!validDelay(value)) throw new RangeError("Delay must be between 2 and 86400 seconds.");
    config.delay = Number(value);
    save();
    render();
    notify("New delay: " + config.delay + " seconds (new messages only).");
    return config.delay;
  }
  function setScope(value) {
    if (!scopes.has(value)) throw new RangeError("Scope: all | servers | dm");
    config.scope = value;
    save();
    render();
    notify("Scope changed: " + value + " (new messages only).");
    return value;
  }

  el("ad-toggle").addEventListener("click", () => state.enabled ? pause() : resume());
  el("ad-retry").addEventListener("click", connect);
  el("ad-retry-foot").addEventListener("click", connect);
  el("ad-delay").addEventListener("change", event => {
    try { setDelay(Number(event.target.value)); }
    catch (err) { notify(err.message, "bad"); render(); }
  });
  shadow.querySelectorAll("[data-delay]").forEach(btn => btn.addEventListener("click", () => setDelay(Number(btn.dataset.delay))));
  el("ad-scope").addEventListener("change", event => setScope(event.target.value));
  el("ad-min").addEventListener("click", () => root.classList.add("collapsed"));
  el("ad-pill").addEventListener("click", () => root.classList.remove("collapsed"));

  // Optional drag handle: only the header moves the overlay.
  let moving = null;
  const onMove = event => {
    if (!moving) return;
    host.style.left = Math.max(6, Math.min(window.innerWidth - 44, event.clientX - moving.dx)) + "px";
    host.style.top = Math.max(6, Math.min(window.innerHeight - 44, event.clientY - moving.dy)) + "px";
  };
  const onUp = () => { moving = null; };
  el("ad-head").addEventListener("pointerdown", event => {
    if (event.target.closest("button")) return;
    const rect = host.getBoundingClientRect();
    moving = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    host.style.right = "auto";
  });
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);

  function stop() {
    if (state.destroyed) return;
    disconnect();
    state.destroyed = true;
    if (ticker) clearInterval(ticker);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    host.remove();
    try { delete window[NAME]; } catch { window[NAME] = undefined; }
    console.info("[AutoDelete] Stopped. Dashboard removed.");
  }
  el("ad-close").addEventListener("click", stop);
  const controller = {
    get running() { return state.ready && state.enabled && !state.destroyed; },
    get connected() { return state.ready; },
    open() { root.classList.remove("collapsed"); },
    hide() { root.classList.add("collapsed"); },
    status() {
      const snapshot = {
        ready: state.ready, enabled: state.enabled, error: state.error, monitor: state.monitor,
        delaySeconds: config.delay, scope: config.scope, pending: state.pending.size,
        requests: state.requests, failed: state.failed, skipped: state.skipped
      };
      console.table(snapshot);
      return snapshot;
    },
    setDelay, setScope, pause, resume, retry: connect, stop
  };
  Object.defineProperty(window, NAME, { value: controller, configurable: true });
  ticker = setInterval(() => { scanCache(); render(); }, 500);
  render();
  connect();
})();