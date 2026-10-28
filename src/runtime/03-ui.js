
  shadow.appendChild(style);

  const root = document.createElement("div");
  root.className = "ad-shell";
  root.innerHTML = [
    '<section class="panel" id="ad-panel" role="region" aria-label="Discord AutoDelete controls">',
      '<div class="head" id="ad-head">',
        '<div class="top">',
          '<div class="brand"><div class="brand-icon">◷</div><div><h1>AutoDelete <span class="version">v3.19</span></h1><div class="brand-by">by Archivarius</div></div></div>',
          '<div class="head-buttons"><button class="mini" id="ad-min" type="button" title="Minimize" aria-label="Minimize">−</button><button class="mini" id="ad-close" type="button" title="Stop and close" aria-label="Close">×</button></div>',
        '</div>',
      '</div>',
      '<div class="body">',
        '<div class="error-alert" id="ad-error" role="alert" style="display:none"></div>',
        '<div class="limited-alert" id="ad-limited" style="display:none">Limited coverage: current channel only</div>',
        '<button class="primary" id="ad-toggle" disabled>Checking connection…</button>',
        '<button class="reconnect" id="ad-retry" style="display:none">Retry connection</button>',
        '<div class="field"><div class="fieldrow"><label id="ad-scope-label">Where to delete</label></div>',
          '<div class="scope-switch" role="group" aria-labelledby="ad-scope-label">',
            '<button type="button" class="scope-btn" data-scope="servers" aria-pressed="true">Servers</button>',
            '<button type="button" class="scope-btn" data-scope="dm" aria-pressed="true">DMs</button>',
          '</div></div>',
        '<div class="field" id="ad-dm-block"><div class="fieldrow"><label for="ad-dm-delay">DMs · deletion delay</label></div>',
          '<div class="delay"><input class="value" id="ad-dm-delay" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" spellcheck="false" title="Type seconds, then press Enter or click outside to save" aria-label="DM deletion delay in seconds">',
          '<button type="button" class="preset exclude-btn" id="ad-exclude-dm" aria-expanded="false">Excluded (0) ›</button>',
        '</div></div>',
        '<div class="field" id="ad-server-block"><div class="fieldrow"><label for="ad-server-delay">Servers · deletion delay</label></div>',
          '<div class="delay"><input class="value" id="ad-server-delay" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" spellcheck="false" title="Type seconds, then press Enter or click outside to save" aria-label="Server deletion delay in seconds">',
          '<button type="button" class="preset exclude-btn" id="ad-exclude-servers" aria-expanded="false">Excluded (0) ›</button>',
        '</div></div>',
        '<section class="picker" id="ad-picker" hidden aria-label="Exclusion picker">',
          '<div class="picker-title" id="ad-picker-title"></div>',
          '<div class="picker-note" id="ad-picker-note">Select chats or servers to keep out of automatic deletion. Existing queued timers in excluded locations will be cancelled.</div>',
          '<button type="button" class="preset picker-action" id="ad-exclude-current">Exclude current conversation / server</button>',
          '<input class="value picker-search" id="ad-exclude-search" type="search" autocomplete="off" spellcheck="false" placeholder="Search username, name or ID" aria-label="Search chats and servers">',
          '<div class="picker-list" id="ad-picker-list"></div>',
          '<div class="picker-input-row"><input class="value" id="ad-exclude-id" inputmode="numeric" type="text" autocomplete="off" placeholder="Channel / server ID" aria-label="ID to exclude"><button type="button" class="preset" id="ad-add-exclude">Add ID</button></div>',
          '<div class="picker-note">Search by name above, or add an existing channel/user ID. Only exclusion IDs are saved.</div>',
        '</section>',
        '<div class="statrow"><div class="stat"><strong id="ad-pending">0</strong><span>Queued</span></div>',
        '<div class="stat" title="Deletion events observed after an AutoDelete attempt; may miss deletion confirmations"><strong id="ad-deleted">0</strong><span>Deleted</span></div></div>',

      '</div>',
      '<div class="footer"><details class="diagnostics" id="ad-diagnostics">',
        '<summary>Diagnostics</summary>',
        '<div class="diag-body">',
          '<div class="loglist" id="ad-logs" aria-live="polite"></div>',
          '<button class="diag-action" type="button" id="ad-retry-foot">Reconnect modules</button>',
        '</div>',
        '<div class="diag-bottom-resizer" id="ad-diag-resize" role="separator" aria-label="Resize Diagnostics from bottom edge" aria-orientation="horizontal" tabindex="0" title="Drag the bottom edge to resize logs, or use arrow keys"><span></span></div>',
      '</details></div>',
    '</section>',
    '<aside class="mini-panel" id="ad-mini-panel" hidden role="region" aria-label="Minimized AutoDelete status">',
      '<button type="button" class="mini-restore" id="ad-restore" title="Expand AutoDelete" aria-label="Expand AutoDelete">↗</button>',
      '<div class="mini-stats">',
        '<div class="mini-stat"><strong id="ad-mini-queued">0</strong><span>Queued</span></div>',
        '<div class="mini-stat" title="Observed deletion events, not guaranteed server confirmations"><strong id="ad-mini-deleted">0</strong><span>Deleted</span></div>',
      '</div>',
    '</aside>'
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
      state.recent.slice(0, 18).forEach(item => {
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

  function formatRemaining(milliseconds) {
    const s = Math.max(0, Math.ceil(milliseconds / 1000));
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60), seconds = s % 60;
    return m + "m " + String(seconds).padStart(2, "0") + "s";
  }
  // Render the countdown beside confirmed own messages, not inside Diagnostics.
  // Discord virtualizes message DOM nodes; the existing 500ms tick reattaches badges.
  // Only message IDs are consulted. No message content is read.
  const inlineBadges = new Map();
  function clearInlineBadge(id) {
    const entry = inlineBadges.get(id);
    if (!entry) return;
    entry.badge.remove();
    inlineBadges.delete(id);
  }
  function renderInlineTimers() {
    for (const [id, entry] of inlineBadges) {
      if (!state.pending.has(id) || entry.target.isConnected === false ||
          entry.badge.parentElement !== entry.target) clearInlineBadge(id);
    }
    if (!state.pending.size) return;
    const visible = document.querySelectorAll?.('[id^="message-content-"]') ?? [];
    for (const target of visible) {
      const id = String(target.id ?? "").slice("message-content-".length);
      if (!validId(id)) continue;
      const job = state.pending.get(id);
      if (!job || target.isConnected === false) continue;
      let entry = inlineBadges.get(id);
      if (!entry || entry.target !== target) {
        clearInlineBadge(id);
        const badge = document.createElement("span");
        badge.className = "discord-autodelete-inline-timer";
        badge.style.cssText = "display:inline-flex;align-items:center;margin-inline-start:8px;" +
          "padding:1px 6px;border:1px solid #82dbb37a;border-radius:6px;" +
          "background:#123d32a8;color:#b7ffe0;font:600 11px/1.5 Inter,ui-sans-serif,Arial,sans-serif;" +
          "white-space:nowrap;vertical-align:middle;pointer-events:none;user-select:none";
        badge.setAttribute("aria-live", "off");
        target.appendChild(badge);
        entry = { target, badge };
        inlineBadges.set(id, entry);
      }
      const remaining = formatRemaining(job.deadline - Date.now());
      const label = "⏱ " + remaining;
      if (entry.badge.textContent !== label) entry.badge.textContent = label;
      entry.badge.title = "AutoDelete deletion attempt in " + remaining + " (not guaranteed)";
    }
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
    const mini = el("ad-mini-panel");
    mini.classList.toggle("is-active", isActive);
    mini.classList.toggle("is-error", Boolean(state.error));
    // Compact by default. Connection failures remain visible in the main panel.
    el("ad-error").style.display = state.error ? "block" : "none";
    el("ad-error").textContent = state.error ? "Connection failed: " + state.error : "";
    const limited = state.ready && state.monitor === "Open-channel cache only";
    el("ad-limited").style.display = limited ? "block" : "none";
    el("ad-toggle").disabled = !state.ready;
    el("ad-toggle").textContent = state.enabled ? "Disable" : "Enable";
    el("ad-toggle").setAttribute("title", state.enabled ?
      "Disable and cancel pending timers" : "Enable auto-delete");
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
      const selected = config.scope === "all" || btn.dataset.scope === config.scope;
      btn.classList.toggle("selected", selected);
      btn.setAttribute("aria-pressed", String(selected));
    });
    // Scope controls which timing fields are relevant. The hidden category's
    // value remains saved and is restored unchanged if the user selects it.
    // Existing queued jobs keep their original deadlines.
    el("ad-dm-block").style.display = "";
    el("ad-server-block").style.display = "";
    el("ad-pending").textContent = state.pending.size;
    el("ad-deleted").textContent = state.deleted;
    el("ad-exclude-dm").textContent = "Excluded (" + config.excludedDms.length + ") ›";
    el("ad-exclude-servers").textContent = "Excluded (" + config.excludedGuilds.length + ") ›";
    el("ad-exclude-dm").setAttribute("aria-expanded", String(pickerKind === "dm"));
    el("ad-exclude-servers").setAttribute("aria-expanded", String(pickerKind === "servers"));
    renderInlineTimers();
    el("ad-mini-queued").textContent = state.pending.size;
    el("ad-mini-deleted").textContent = state.deleted;

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
    state.nextDeletionAt = 0;
    provisional.clear();
    state.enabledSince = 0;
    state.cacheObservedSince.clear();
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
