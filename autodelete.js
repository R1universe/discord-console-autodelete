/*
 * Discord AutoDelete v3.8 — black/green state-driven utility UI; experimental console prototype
 * This is NOT a supported Discord API integration. Self-bots can result in bans.
 * No token extraction, credential access, external code or network requests.
 * Does not read, log or store the contents of messages.
 */
(() => {
  "use strict";

  const NAME = "DiscordAutoDelete";
  const HOST_ID = "discord-autodelete-v2";
  const SETTINGS_KEY = "discord-autodelete-ui-v2";
  const VERSION = "3.8.0";
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
  // Migrate the previous shared delay into both independent settings.
  const legacyDelay = validDelay(saved.delay) ? Number(saved.delay) : 10;
  const config = {
    serverDelay: validDelay(saved.serverDelay) ? Number(saved.serverDelay) : legacyDelay,
    dmDelay: validDelay(saved.dmDelay) ? Number(saved.dmDelay) : legacyDelay,
    scope: scopes.has(saved.scope) ? saved.scope : "all"
  };
  const state = {
    ready: false, enabled: false, error: "", pending: new Map(),
    requests: 0, failed: 0, skipped: 0, detected: 0, processed: new Set(), processedNonces: new Set(), cacheSeen: new Map(), monitor: "",
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
    /* v3.8: near-black neutral base, low-saturation green on ACTIVE */
    ":host{all:initial;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;color:#f2f4f3;font-size:13px}",
    "*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}",
    ".panel{--ad-bg:#101113;--ad-surface:#1d2023;--ad-hover:#262a2e;--ad-border:#303439;--ad-text:#f1f3f5;--ad-muted:#a2a9af;--ad-dim:#858e95;--ad-accent:#6773ec;--ad-accent-hover:#7a84f6;width:370px;max-width:calc(100vw - 24px);max-height:calc(100vh - 110px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:#42474a transparent;background:var(--ad-bg);color:var(--ad-text);border:1px solid var(--ad-border);border-radius:14px;box-shadow:0 18px 46px #000b;transition:background .2s,border-color .2s,box-shadow .2s}",
    ".panel.is-active{--ad-accent:#299b68;--ad-accent-hover:#32ad77;--ad-border:#32684e;--ad-hover:#1c3028;background:#101714;border-color:#2e7d57;box-shadow:0 18px 48px #000b,0 0 0 1px #28a36a20,0 0 25px #2ba66c20}",
    ".panel.is-error{border-color:#9a4848}",
    ".head{padding:15px 16px 13px;background:#151719;border-bottom:1px solid #292e31;cursor:grab;touch-action:none;user-select:none}",
    ".panel.is-active .head{background:#132119;border-bottom-color:#284d39}",
    ".top,.brand,.head-buttons,.fieldrow,.delay{display:flex;align-items:center;gap:8px}.top,.fieldrow{justify-content:space-between}",
    ".brand-icon{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:10px;background:#6570e519;border:1px solid #6570e540;color:#aeb6ff;font-size:20px}",
    ".panel.is-active .brand-icon{color:#75dab0;background:#1f9d6126;border-color:#328b615e;box-shadow:0 0 16px #21b77119}",
    "h1{font-size:15px;line-height:1.2;margin:0;font-weight:720;letter-spacing:-.2px}.muted{color:var(--ad-muted);font-size:11px;margin-top:2px}.version{color:var(--ad-dim);font-size:10px;font-weight:600}",
    ".head-buttons{gap:5px}.mini{min-width:27px;height:27px;padding:0 6px;border:1px solid #43484c;border-radius:7px;color:#abb2b7;background:#1a1c1f}",
    ".mini:hover{background:#282c2e;color:#fff}.mini:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid #a5d6b9;outline-offset:2px}",
    ".body{padding:15px 16px 13px}.error-alert{border:1px solid #9a5054;background:#4b232733;color:#f6b9bf;border-radius:9px;padding:9px 11px;font-size:11px;line-height:1.5;margin:0 0 12px;overflow-wrap:anywhere}",
    ".limited-alert{color:#e0c48c;font-size:11px;line-height:1.5;margin-bottom:10px}",
    ".primary{display:block;width:100%;border:1px solid #6d78f3;padding:13px 12px;border-radius:10px;background:var(--ad-accent);color:#fff;font-weight:750;font-size:12px;transition:background .2s,box-shadow .2s,border-color .2s;margin:0 0 17px}",
    ".primary:hover:not(:disabled){background:var(--ad-accent-hover)}",
    ".panel.is-active .primary{background:#1d8256;color:#f1fff8;border-color:#39a673;box-shadow:0 0 0 1px #2dab6a15,0 0 17px #2fb77823}",
    ".panel.is-active .primary:hover:not(:disabled){background:#239862}",
    ".reconnect{width:100%;border:1px solid #555c60;background:#1c2022;padding:9px;border-radius:8px;color:#d2d9d7;margin:0 0 12px}",
    ".field{margin-bottom:14px}.fieldrow{margin-bottom:7px}label{font-weight:650;font-size:12px;color:#e0e5e2}.hint{font-size:10px;color:var(--ad-dim)}",
    ".delay{gap:7px}.value{width:79px;min-width:0;padding:10px;border:1px solid #42494a;background:var(--ad-surface);color:var(--ad-text);border-radius:8px;outline:none;line-height:1.2;font-variant-numeric:tabular-nums}",
    ".value:focus{border-color:var(--ad-accent);box-shadow:0 0 0 2px #528e7433}",
    ".presets{display:flex;flex:1;gap:5px;min-width:0}.preset{flex:1;min-width:0;border:1px solid #414649;background:var(--ad-surface);color:#acb5b8;border-radius:8px;padding:10px 0;font-size:11px;line-height:1.2}",
    ".preset:hover{background:var(--ad-hover);color:white}.preset.selected{color:#dfe2ff;border-color:#7581ee;background:#6673ed1e}",
    ".panel.is-active .preset.selected{color:#c8f7de;background:#1d70432c;border-color:#43a776}",
    ".scope-switch{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}",
    ".scope-btn{border:1px solid #41484a;background:#1c2022;color:#c5cbcf;border-radius:9px;padding:11px 4px;font-size:11px;font-weight:650;line-height:1.2;white-space:nowrap}",
    ".scope-btn:hover{background:var(--ad-hover);color:#fff}.scope-btn.selected{background:#272c44;color:#e0e4ff;border-color:#727dea;box-shadow:inset 0 0 0 1px #6574ef39}",
    ".panel.is-active .scope-btn.selected{background:#19372a;color:#c9f4dc;border-color:#369a69;box-shadow:inset 0 0 0 1px #2297612f}",
    ".statrow{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:14px}",
    ".stat{background:#191c1f;border:1px solid #30363a;padding:9px 5px;border-radius:9px;text-align:center}",
    ".panel.is-active .stat{border-color:#294636;background:#15221b}",
    ".stat strong{display:block;font-size:18px;line-height:1.2;letter-spacing:-.4px;color:#f4f7f5;font-variant-numeric:tabular-nums}.stat span{display:block;margin-top:4px;font-size:10px;color:var(--ad-muted)}",
    ".footer{border-top:1px solid #303438;background:#141719;padding:0 16px}.panel.is-active .footer{border-top-color:#284233;background:#132019}",
    ".diagnostics{font-size:11px}.diagnostics>summary{display:flex;align-items:center;justify-content:space-between;padding:12px 0;color:#bac2c2;cursor:pointer;list-style:none;font-weight:600;user-select:none}",
    ".diagnostics>summary::-webkit-details-marker{display:none}.diagnostics>summary:after{content:'⌄';font-size:17px;line-height:12px;color:#a5b2ac;transform:translateY(-1px)}.diagnostics[open]>summary:after{transform:rotate(180deg)}",
    ".diag-body{padding:0 0 14px;border-top:1px solid #383e40}.diag-warning{font-size:11px;line-height:1.55;color:#b3bcbc;padding-top:12px}.diag-warning strong{color:#dae1df}",
    ".diag-metrics{font-size:10px;line-height:1.5;color:#919c9a;margin:11px 0 12px}.diag-title{margin:11px 0 6px;font-size:10px;letter-spacing:.4px;font-weight:700;color:#afb8b5}",
    ".loglist{max-height:126px;overflow:auto;scrollbar-width:thin;color:#aeb5b6;font-family:ui-monospace,SFMono-Regular,monospace;font-size:10px}",
    ".logitem{padding:3px 0;overflow-wrap:anywhere;line-height:1.45}.logitem .time{color:#8b9693;margin-right:5px}.logitem.bad{color:#f0a5aa}.logitem.good{color:#90d6b4}",
    ".footer button.diag-action{border:1px solid #414b48;background:#1d2421;color:#dce3df;border-radius:8px;padding:9px 10px;width:100%;margin-top:12px}.footer button.diag-action:hover{background:#27332d}",
    ".pill{display:none;align-items:center;gap:10px;background:#141719;border:1px solid #49504d;color:#f3f6f4;border-radius:99px;padding:10px 14px;box-shadow:0 8px 30px #0008;font-weight:650}",
    ".collapsed .panel{display:none}.collapsed .pill{display:flex}",
    "@media(max-width:500px){.panel{max-width:calc(100vw - 16px)}.body{padding:14px}.head{padding:13px 14px}.footer{padding:0 14px}}",
    "@media(prefers-reduced-motion:reduce){.panel,.primary{transition:none}}"
  ].join("\n");
  shadow.appendChild(style);

  const root = document.createElement("div");
  root.innerHTML = [
    '<section class="panel" id="ad-panel" role="region" aria-label="Discord AutoDelete controls">',
      '<div class="head" id="ad-head">',
        '<div class="top">',
          '<div class="brand"><div class="brand-icon">◷</div><div><h1>AutoDelete <span class="version">v3.8</span></h1><div class="muted">Timed Discord messages</div></div></div>',
          '<div class="head-buttons"><button class="mini" id="ad-help" type="button" title="Safety and diagnostics" aria-label="Open safety and diagnostics">?</button><button class="mini" id="ad-min" type="button" title="Minimize" aria-label="Minimize">−</button><button class="mini" id="ad-close" type="button" title="Stop and close" aria-label="Close">×</button></div>',
        '</div>',
      '</div>',
      '<div class="body">',
        '<div class="error-alert" id="ad-error" role="alert" style="display:none"></div>',
        '<div class="limited-alert" id="ad-limited" style="display:none">Limited coverage: current channel only</div>',
        '<button class="primary" id="ad-toggle" disabled>Checking connection…</button>',
        '<button class="reconnect" id="ad-retry" style="display:none">Retry connection</button>',
        '<div class="field"><div class="fieldrow"><label for="ad-dm-delay">DMs · deletion delay</label><span class="hint">2s–24h</span></div>',
          '<div class="delay"><input class="value" id="ad-dm-delay" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" spellcheck="false" title="Type seconds, then press Enter or click outside to save" aria-label="DM deletion delay in seconds"><div class="presets">',
          '<button class="preset" data-delay-for="dm" data-delay="5">5s</button><button class="preset" data-delay-for="dm" data-delay="10">10s</button><button class="preset" data-delay-for="dm" data-delay="30">30s</button><button class="preset" data-delay-for="dm" data-delay="60">60s</button>',
        '</div></div></div>',
        '<div class="field"><div class="fieldrow"><label for="ad-server-delay">Servers · deletion delay</label><span class="hint">2s–24h</span></div>',
          '<div class="delay"><input class="value" id="ad-server-delay" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" spellcheck="false" title="Type seconds, then press Enter or click outside to save" aria-label="Server deletion delay in seconds"><div class="presets">',
          '<button class="preset" data-delay-for="servers" data-delay="5">5s</button><button class="preset" data-delay-for="servers" data-delay="10">10s</button><button class="preset" data-delay-for="servers" data-delay="30">30s</button><button class="preset" data-delay-for="servers" data-delay="60">60s</button>',
        '</div></div></div>',
        '<div class="field"><div class="fieldrow"><label id="ad-scope-label">Where to delete</label><span class="hint">Your messages only</span></div>',
          '<div class="scope-switch" role="group" aria-labelledby="ad-scope-label">',
            '<button type="button" class="scope-btn" data-scope="all" aria-pressed="true">Everywhere</button>',
            '<button type="button" class="scope-btn" data-scope="servers" aria-pressed="false">Servers</button>',
            '<button type="button" class="scope-btn" data-scope="dm" aria-pressed="false">DMs</button>',
          '</div></div>',
        '<div class="statrow"><div class="stat"><strong id="ad-pending">0</strong><span>Queued</span></div>',
        '<div class="stat"><strong id="ad-requests">0</strong><span>Attempts</span></div>',
        '<div class="stat"><strong id="ad-failed">0</strong><span>Caught</span></div></div>',
      '</div>',
      '<div class="footer"><details class="diagnostics" id="ad-diagnostics">',
        '<summary>Diagnostics &amp; safety</summary>',
        '<div class="diag-body">',
          '<div class="diag-warning" id="ad-warning"><strong>Unofficial account automation.</strong> Using a self-bot can lead to account suspension. Deletion is not guaranteed; others can keep copies.</div>',
          '<div class="diag-metrics">Attempts count calls, not verified server deletions. Caught only tracks errors surfaced by the call; background HTTP errors may be missed.</div>',
          '<div class="diag-title">ACTIVITY LOG <span class="hint">· No message text stored</span></div>',
          '<div class="loglist" id="ad-logs" aria-live="polite"></div>',
          '<button class="diag-action" type="button" id="ad-retry-foot">Reconnect modules</button>',
        '</div>',
      '</details></div>',
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

  // Track edits independently of ShadowRoot.activeElement to avoid focus
  // races caused by the hosting Discord client.
  const editingDelay = new Set();

  function render() {
    if (state.destroyed) return;
    const isActive = state.ready && state.enabled && !state.error;
    const panel = el("ad-panel");
    panel.classList.toggle("is-active", isActive);
    panel.classList.toggle("is-error", Boolean(state.error));
    // Compact by default. Connection failures remain visible in the main panel.
    el("ad-error").style.display = state.error ? "block" : "none";
    el("ad-error").textContent = state.error ? "Connection failed: " + state.error : "";
    const limited = state.ready && state.monitor === "Open-channel cache only";
    el("ad-limited").style.display = limited ? "block" : "none";
    el("ad-warning").textContent = limited ?
      "Unofficial automation with limited coverage: only messages in your open channel may be observed. Discord can suspend the account, and deletion is not guaranteed." :
      "Unofficial account automation. Discord can suspend or terminate your account. Deletion is not guaranteed, and others may retain copies.";
    el("ad-toggle").disabled = !state.ready;
    el("ad-toggle").textContent = state.enabled ? "Pause · clear queue" : "Enable auto-delete";
    el("ad-toggle").className = "primary" + (state.enabled ? " stop" : "");
    el("ad-retry").style.display = state.ready ? "none" : "block";
    // Discord can steal focus or route typing through document handlers.
    // Explicit edit locks prevent the 500ms UI refresh from overwriting
    // partially typed values (including temporary empty strings).
    if (!editingDelay.has("servers") && shadow.activeElement !== el("ad-server-delay"))
      el("ad-server-delay").value = String(config.serverDelay);
    if (!editingDelay.has("dm") && shadow.activeElement !== el("ad-dm-delay"))
      el("ad-dm-delay").value = String(config.dmDelay);
    shadow.querySelectorAll("[data-scope]").forEach(btn => {
      const selected = btn.dataset.scope === config.scope;
      btn.classList.toggle("selected", selected);
      btn.setAttribute("aria-pressed", String(selected));
    });
    shadow.querySelectorAll("[data-delay-for]").forEach(btn => {
      const seconds = btn.dataset.delayFor === "servers" ? config.serverDelay : config.dmDelay;
      btn.classList.toggle("selected", Number(btn.dataset.delay) === seconds);
    });
    el("ad-pending").textContent = state.pending.size;
    el("ad-requests").textContent = state.requests;
    el("ad-failed").textContent = state.failed;

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

  // Adapted from Vencord's shouldIgnoreValue(): Discord exports i18n
  // Proxy values that return a function for ANY property name. These can
  // cache the synthesized function onto themselves, producing hundreds of
  // false candidates (see the 83 cross-family matches in audit v1.1).
  // This guard MUST run before probing methods like deleteMessage or del.
  const INVALID_PROXY_KEY = "is this a proxy that returns values for any key?";
  const lookupStats = { ignored: 0, recognizedI18n: 0, arbitraryKey: 0 };
  const ignoredExports = new WeakSet();
  function ignoreExport(value) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) return true;
    if (value === window || value === document || value === document.documentElement) return true;
    if (ignoredExports.has(value)) return true;
    try {
      const tag = value[Symbol.toStringTag];
      if (tag === "IntlMessagesProxy" || tag === "DOMTokenList") {
        ignoredExports.add(value);
        lookupStats.ignored++;
        lookupStats.recognizedI18n++;
        return true;
      }
    } catch { return true; }

    // A unique probe catches other proxies with the same behaviour. Restore
    // an *initially absent* property when the proxy caches the probe result.
    // Avoid invoking this on known translation proxies (above).
    try {
      const existed = Object.prototype.hasOwnProperty.call(value, INVALID_PROXY_KEY);
      const arbitrary = value[INVALID_PROXY_KEY];
      if (arbitrary !== undefined && !existed) {
        try { Reflect.deleteProperty(value, INVALID_PROXY_KEY); } catch {}
        ignoredExports.add(value);
        lookupStats.ignored++;
        lookupStats.arbitraryKey++;
        return true;
      }
    } catch { return true; }
    return false;
  }
  function addCandidates(cache) {
    const found = [], seen = new Set();
    const put = value => {
      if (!value || (typeof value !== "object" && typeof value !== "function") ||
          seen.has(value) || ignoreExport(value)) return;
      seen.add(value);
      found.push(value);
    };
    for (const entry of Object.values(cache)) {
      try {
        const exported = entry?.exports;
        put(exported);
        if (!exported || ignoreExport(exported)) continue;
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
      throw new Error("Unable to inspect modules: " + String(err?.message ?? err));
    }
    if (!runtimes.length) throw new Error("No Webpack runtime found.");

    // Pool all caches: requiring UserStore and REST to live in the same runtime
    // is another brittle assumption. Deduplicate candidates by object identity.
    const all = [], seen = new Set();
    for (const req of runtimes) {
      for (const item of addCandidates(req.c)) {
        if (seen.has(item)) continue;
        seen.add(item);
        all.push(item);
      }
      // Optional hint from older versions. Never assume a fixed module ID.
      const special = req.c?.[73153]?.exports;
      if (special) {
        for (const item of [special, ...Object.values(special)]) {
          if (item && (typeof item === "object" || typeof item === "function") &&
              !seen.has(item) && !ignoreExport(item)) {
            seen.add(item);
            all.push(item);
          }
        }
      }
    }

    function matches(predicate) {
      return all.filter(x => { try { return Boolean(predicate(x)); } catch { return false; } });
    }
    function unique(xs) { return [...new Set(xs)]; }
    function pick(pool, prefer, label, notes) {
      const preferred = unique(pool.filter(x => { try { return Boolean(prefer?.(x)); } catch { return false; } }));
      const chosen = preferred.length === 1 ? preferred[0] : pool.length === 1 ? pool[0] : null;
      notes[label] = pool.length + " candidates" + (preferred.length ? " (" + preferred.length + " preferred)" : "");
      return chosen;
    }
    // Discord's Webpack caches can contain many *different wrapper objects*
    // that re-export the very same operation. Count distinct METHOD references,
    // not wrapper objects. If method identity is not unique, fail closed.
    function pickByMethod(pool, method, label, notes, preference) {
      const methods = new Map();
      for (const obj of pool) {
        let fn;
        try { fn = obj?.[method]; } catch { continue; }
        if (typeof fn !== "function") continue;
        if (!methods.has(fn)) methods.set(fn, []);
        methods.get(fn).push(obj);
      }
      notes[label] = pool.length + " wrappers / " + methods.size + " distinct " + method + " functions";
      if (methods.size !== 1) return null;
      const wrappers = [...methods.values()][0];
      const preferred = wrappers.filter(x => {
        try { return Boolean(preference?.(x)); } catch { return false; }
      });
      // When all wrappers have the same method reference, picking one of them
      // does not pick a different operation. Prioritize a direct HTTP owner.
      return preferred[0] ?? wrappers[0] ?? null;
    }

    const notes = { IgnoredProxies: lookupStats.ignored +
      " (" + lookupStats.recognizedI18n + " IntlMessagesProxy, " +
      lookupStats.arbitraryKey + " catch-all)" };
    const userCandidates = matches(x => typeof x?.getCurrentUser === "function" && typeof x?.getUser === "function");
    const users = pick(userCandidates, storeNamed("UserStore"), "UserStore", notes);
    const actionCandidates = matches(x => typeof x?.deleteMessage === "function");
    const actions = pickByMethod(actionCandidates, "deleteMessage",
      "MessageActions", notes, x =>
        Object.prototype.hasOwnProperty.call(x, "deleteMessage") &&
        (typeof x.startEditMessage === "function" || typeof x.editMessage === "function"));

    // Equicord and other Vencord-derived code discovers getAPIBaseURL and
    // returns mod.HTTP ?? mod. The HTTP transport can live one level DEEPER
    // than the object exporting getAPIBaseURL (the v3 search missed it).
    const httpSignatures = x => x && typeof x.del === "function" && typeof x.get === "function";
    const restDirect = matches(x => httpSignatures(x));
    const restFromWrappers = [];
    const wrappers = matches(x => typeof x?.getAPIBaseURL === "function");
    for (const wrapper of wrappers) {
      try {
        if (httpSignatures(wrapper?.HTTP)) restFromWrappers.push(wrapper.HTTP);
      } catch {}
    }
    // A REST transport exposed with getAPIBaseURL itself is preferred.
    const taggedDirect = restDirect.filter(x => typeof x.getAPIBaseURL === "function");
    const restCandidates = unique([...restFromWrappers, ...taggedDirect, ...restDirect]);
    const explicitlyTagged = unique([...restFromWrappers, ...taggedDirect]);
    const preferredTransportPool = explicitlyTagged.length ? explicitlyTagged : restCandidates;
    const rest = pickByMethod(preferredTransportPool, "del",
      "RestAPI", notes, x =>
        Object.prototype.hasOwnProperty.call(x, "del") && typeof x.getAPIBaseURL === "function");
    notes.RestAPI += "; " + wrappers.length + " getAPIBaseURL wrappers";

    const store = pick(matches(x => typeof x?.getMessages === "function" &&
      typeof x?.getMessage === "function"), storeNamed("MessageStore"), "MessageStore", notes);
    const selected = pick(matches(x => typeof x?.getChannelId === "function"),
      storeNamed("SelectedChannelStore"), "SelectedChannelStore", notes);
    const channel = pick(matches(x => typeof x?.getChannel === "function" &&
      (typeof x?.getDMFromUserId === "function" || typeof x?.getChannels === "function")),
      storeNamed("ChannelStore"), "ChannelStore", notes);

    // Keep legacy event discovery, but do not mistake a list of candidates
    // for proof that the real Discord gateway is connected.
    const dispatcherMatches = unique(matches(x =>
      typeof x?.subscribe === "function" &&
      typeof x?.unsubscribe === "function" &&
      typeof x?.dispatch === "function"));
    // Avoid subscribing to every event bus in the app. If the core Dispatcher
    // is ambiguous, rely on open-channel cache until discovery is verified.
    const preferredDispatchers = dispatcherMatches.filter(x =>
      x._subscriptions != null && typeof x.flushWaitQueue === "function");
    const dispatchers = preferredDispatchers.length === 1 ?
      preferredDispatchers : dispatcherMatches.length === 1 ? dispatcherMatches : [];
    notes.EventSources = dispatcherMatches.length + " candidates; " +
      dispatchers.length + " uniquely selected";
    const accountId = String(users?.getCurrentUser()?.id ?? "");
    if (users && validId(accountId) && (rest || actions) &&
        (dispatchers.length || (store && selected))) {
      return {
        users, actions, rest, messageStore: store, selectedChannel: selected,
        channelStore: channel, dispatchers, accountId, moduleCount: all.length, ignoredProxies: lookupStats.ignored,
        discovery: notes
      };
    }
    throw new Error("Required modules unresolved. " +
      Object.entries(notes).map(([k,v]) => k + "=" + v).join("; ") +
      "; caches=" + runtimes.length);
  }

  function classifyChannel(msg, channelId) {
    const channel = hooks?.channelStore?.getChannel(channelId);
    const type = channel?.type;
    if (type === 1 || type === 3) return "dm"; // DM / group DM
    const guildId = msg?.guild_id ?? msg?.guildId ?? channel?.guild_id ?? channel?.guildId;
    if (guildId != null && guildId !== "") return "servers";
    // Unknown channels are never guessed to be server or DM, even in all scope.
    return null;
  }
  function scopeMatches(kind) {
    return kind != null && (config.scope === "all" || config.scope === kind);
  }
  // Discord uses a temporary local message whose id may be the client
  // nonce. The cache often lists it as SENDING without optimistic=true.
  // Never schedule deletion until a server-assigned message ID is present.
  // Confirmed by the user-provided live event trace: M2.id === nonce, SENDING;
  // M3.id !== nonce, SENT, with the same nonce.
  function isProvisional(msg, event) {
    if (!msg) return true;
    if (event?.optimistic === true || msg.optimistic === true) return true;
    const stateName = typeof msg.state === "string" ? msg.state.toUpperCase() : "";
    if (["SENDING", "QUEUED", "PENDING", "FAILED", "SEND_FAILED"].includes(stateName))
      return true;
    const id = String(msg.id ?? "");
    return msg.nonce != null && id === String(msg.nonce);
  }

  function onCreate(event) {
    if (!state.enabled || !hooks || state.destroyed) return;
    const msg = event?.message;
    if (!msg || String(msg.author?.id ?? "") !== state.accountId) return;
    if (isProvisional(msg, event)) return;
    const id = String(msg.id ?? "");
    const channelId = String(event?.channelId ?? event?.channel_id ?? msg.channel_id ?? msg.channelId ?? "");
    if (!validId(id) || !validId(channelId) || state.pending.has(id) || state.processed.has(id)) return;
    const kind = classifyChannel(msg, channelId);
    if (!scopeMatches(kind)) { state.skipped++; return; }
    const delaySeconds = kind === "servers" ? config.serverDelay : config.dmDelay;
    // Some clients emit more than one confirmed object for the same send.
    // The client nonce correlates them without reading/storing message text.
    const nonceKey = msg.nonce == null ? null : channelId + ":" + String(msg.nonce);
    if (nonceKey && state.processedNonces.has(nonceKey)) return;
    state.processed.add(id);
    if (state.processed.size > 5000) state.processed.delete(state.processed.values().next().value);
    if (nonceKey) {
      state.processedNonces.add(nonceKey);
      if (state.processedNonces.size > 5000)
        state.processedNonces.delete(state.processedNonces.values().next().value);
    }
    state.detected++;
    const deadline = Date.now() + delaySeconds * 1000;
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
      // Count an attempt before invoking the client's delete action.
      // MessageActions may return void and perform async HTTP in the background,
      // so resolving this call is NOT a server-confirmed successful deletion.
      state.requests++;
      try {
        if (hooks.rest) {
          await Promise.resolve(hooks.rest.del({ url: "/channels/" + channelId + "/messages/" + id }));
        } else {
          await Promise.resolve(hooks.actions.deleteMessage(channelId, id));
        }
        notify("Delete action invoked (server result not independently verified).", "good");
      } catch (err) {
        state.failed++;
        notify("Caught delete error: " + String(err?.message ?? err).slice(0, 140), "bad");
      }
      render();
    }, delaySeconds * 1000);
    state.pending.set(id, { timer, deadline, kind });
    notify((kind === "dm" ? "DM" : "Server") + " message queued for " + delaySeconds + "s.");
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
      // Don't mark a provisional cache ID as already seen. The same cached
      // message might transition to SENT without changing its ID.
      if (isProvisional(msg)) continue;
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
      notify("Module candidates resolved: " + state.monitor + ". Not live-verified. Enable to test.", "good");
      notify("Filtered " + discovered.ignoredProxies + " synthetic/i18n export candidates.");
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
  function updateDelay(kind, value) {
    if (!validDelay(value)) throw new RangeError("Delay must be an integer from 2 to 86400 seconds.");
    const seconds = Number(value);
    if (kind === "servers") config.serverDelay = seconds;
    else if (kind === "dm") config.dmDelay = seconds;
    else throw new RangeError("Delay category must be 'servers' or 'dm'.");
    save();
    render();
    notify((kind === "dm" ? "DM" : "Server") + " delay set to " + seconds + "s (new messages only).");
    return seconds;
  }
  function setServerDelay(seconds) { return updateDelay("servers", seconds); }
  function setDmDelay(seconds) { return updateDelay("dm", seconds); }
  // Legacy command: sets both delays, keeping older console workflows working.
  function setDelay(seconds) {
    if (!validDelay(seconds)) throw new RangeError("Delay must be an integer from 2 to 86400 seconds.");
    config.serverDelay = config.dmDelay = Number(seconds);
    save();
    render();
    notify("Both delays set to " + seconds + "s (new messages only).");
    return Number(seconds);
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
  // Preserve manual edits until Enter or blur, with explicit input locks
  // so the half-second render never resets keystrokes while editing.
  function bindDelayInput(kind, id) {
    const input = el(id);
    const selectedDelay = () => kind === "dm" ? config.dmDelay : config.serverDelay;
    const commit = () => {
      const raw = String(input.value ?? "").trim();
      editingDelay.delete(kind);
      if (/^\d+$/.test(raw) && validDelay(Number(raw))) {
        const seconds = Number(raw);
        if (seconds !== selectedDelay()) updateDelay(kind, seconds);
        else render();
      } else {
        notify("Enter a whole number between 2 and 86400 seconds.", "bad");
        input.value = String(selectedDelay());
        render();
      }
    };
    input.addEventListener("focus", () => editingDelay.add(kind));
    input.addEventListener("input", () => editingDelay.add(kind));
    // Discord listens for shortcuts and may treat 0-9 as client hotkeys.
    // Keep typing inside the Shadow DOM control.
    for (const type of ["keydown", "keyup", "keypress"]) {
      input.addEventListener(type, event => {
        event.stopPropagation?.();
        if (type !== "keydown") return;
        if (event.key === "Enter") {
          event.preventDefault?.();
          input.blur?.();
          if (editingDelay.has(kind)) commit();
        } else if (event.key === "Escape") {
          event.preventDefault?.();
          editingDelay.delete(kind);
          input.value = String(selectedDelay());
          input.blur?.();
          render();
        }
      });
    }
    input.addEventListener("change", () => commit());
    input.addEventListener("blur", () => {
      if (editingDelay.has(kind)) commit();
    });
  }
  bindDelayInput("dm", "ad-dm-delay");
  bindDelayInput("servers", "ad-server-delay");
  shadow.querySelectorAll("[data-delay-for]").forEach(btn =>
    btn.addEventListener("click", () => updateDelay(btn.dataset.delayFor, Number(btn.dataset.delay))));
  shadow.querySelectorAll("[data-scope]").forEach(btn =>
    btn.addEventListener("click", () => setScope(btn.dataset.scope)));
  el("ad-help").addEventListener("click", () => {
    el("ad-diagnostics").open = true;
    el("ad-diagnostics").scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  });
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
    openDiagnostics() {
      root.classList.remove("collapsed");
      el("ad-diagnostics").open = true;
    },
    status() {
      const snapshot = {
        ready: state.ready, enabled: state.enabled, error: state.error, monitor: state.monitor,
        serverDelaySeconds: config.serverDelay, dmDelaySeconds: config.dmDelay,
        scope: config.scope,
        filteredProxyExports: hooks?.ignoredProxies ?? 0, pending: state.pending.size,
        requests: state.requests, failed: state.failed, skipped: state.skipped,
        metricsNote: "requests = attempted delete actions; failed = synchronously/awaitably caught errors only; no server confirmation"
      };
      console.table(snapshot);
      return snapshot;
    },
    setDelay, setServerDelay, setDmDelay, setScope, pause, resume, retry: connect, stop
  };
  Object.defineProperty(window, NAME, { value: controller, configurable: true });
  ticker = setInterval(() => { scanCache(); render(); }, 500);
  render();
  connect();
})();