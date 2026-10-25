/*
 * Queue Event Audit v1.0 — Discord Web, READ ONLY.
 *
 * Purpose: determine whether one visually sent message produces two separate
 * MESSAGE_CREATE / selected-channel cache entries.
 *
 * Does NOT send, edit, delete or search messages. Never accesses token,
 * cookies, Authorization, message content or attachments. No network requests.
 * Keeps raw IDs and nonce values solely in ephemeral maps for pseudonymizing
 * correlations. Output contains aliases M1/M2, N1/N2, C1/C2, never originals.
 * Original Discord scripts and activities should not run at the same time.
 */
(() => {
  "use strict";
  const NAME = "DiscordQueueAudit";
  if (window[NAME]?.running) {
    console.warn("[Queue Audit] Already active. Use DiscordQueueAudit.report() or .stop().");
    return;
  }
  if (location.hostname !== "discord.com" && !location.hostname.endsWith(".discord.com")) {
    console.warn("[Queue Audit] Open Discord Web.");
    return;
  }

  const startedAt = Date.now();
  const events = [];
  const aliases = { message: new Map(), nonce: new Map(), channel: new Map() };
  const idAlias = (type, id) => {
    if (id == null || id === "") return null;
    const key = String(id);
    const map = aliases[type];
    if (!map.has(key)) map.set(key, type[0].toUpperCase() + (map.size + 1));
    return map.get(key);
  };
  const savedMessageIds = new Set();
  const counts = { flux: 0, cache: 0, ignored: 0 };
  let stopped = false, interval = null, dispatcher = null, userStore = null;
  let channelStore = null, messageStore = null, selectedChannelStore = null;
  const cacheSeen = new Map();
  const watchLimit = 80;

  const ignore = value => {
    if (value == null || (typeof value !== "object" && typeof value !== "function")) return true;
    try {
      const tag = value[Symbol.toStringTag];
      if (tag === "IntlMessagesProxy" || tag === "DOMTokenList") return true;
      const key = "queue-audit impossible property that should not exist";
      if (Object.prototype.hasOwnProperty.call(value, key)) return false;
      const maybe = value[key];
      if (maybe !== undefined) {
        // A lazy i18n proxy might cache an invented property on first read;
        // remove only that probe so we do not pollute application exports.
        try { Reflect.deleteProperty(value, key); } catch {}
        return true;
      }
    } catch { return true; }
    return false;
  };

  const chunks = window.webpackChunkdiscord_app;
  if (!chunks || typeof chunks.push !== "function") {
    console.warn("[Queue Audit] Discord module loader unavailable.");
    return;
  }
  const runtimes = [];
  const marker = Symbol("QueueAudit");
  try {
    chunks.push([[marker], {}, req => {
      if (req?.c && !runtimes.includes(req)) runtimes.push(req);
    }]);
    if (chunks.at(-1)?.[0]?.[0] === marker) chunks.pop();
  } catch {
    console.warn("[Queue Audit] Module inspection failed.");
    return;
  }

  const candidates = [];
  const observed = new WeakSet();
  function add(value) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) return;
    if (observed.has(value)) return;
    observed.add(value);
    if (!ignore(value)) candidates.push(value);
    else counts.ignored++;
  }
  for (const req of runtimes) {
    for (const item of Object.values(req.c)) {
      try {
        const exported = item?.exports;
        add(exported);
        if (!exported || ignore(exported)) continue;
        for (const key of Object.keys(exported)) {
          try { add(exported[key]); } catch {}
        }
      } catch {}
    }
  }
  const find = (predicate, prefer) => {
    const matches = candidates.filter(candidate => {
      try { return predicate(candidate); } catch { return false; }
    });
    const preferred = matches.filter(candidate => {
      try { return Boolean(prefer?.(candidate)); } catch { return false; }
    });
    return preferred.length === 1 ? preferred[0] : matches.length === 1 ? matches[0] : null;
  };
  const named = name => obj => {
    try {
      return obj?.constructor?.displayName === name ||
        Object.getPrototypeOf(obj)?.constructor?.displayName === name;
    } catch { return false; }
  };

  userStore = find(x => typeof x?.getCurrentUser === "function" && typeof x?.getUser === "function",
    named("UserStore"));
  messageStore = find(x => typeof x?.getMessages === "function" && typeof x?.getMessage === "function",
    named("MessageStore"));
  selectedChannelStore = find(x => typeof x?.getChannelId === "function",
    named("SelectedChannelStore"));
  channelStore = find(x => typeof x?.getChannel === "function" &&
    (typeof x?.getChannels === "function" || typeof x?.getDMFromUserId === "function"),
    named("ChannelStore"));

  const busMatches = candidates.filter(x => {
    try {
      return typeof x?.subscribe === "function" &&
        typeof x?.unsubscribe === "function" &&
        typeof x?.dispatch === "function";
    } catch { return false; }
  });
  const preferredBus = busMatches.filter(x => {
    try { return x._subscriptions != null && typeof x.flushWaitQueue === "function"; }
    catch { return false; }
  });
  dispatcher = preferredBus.length === 1 ?
    preferredBus[0] : busMatches.length === 1 ? busMatches[0] : null;

  const accountId = String(userStore?.getCurrentUser()?.id ?? "");
  if (!/^\d{15,22}$/.test(accountId) || (!dispatcher && !(messageStore && selectedChannelStore))) {
    console.warn("[Queue Audit] Could not discover read-only event sources. No listener added.");
    return;
  }

  function record(source, msg, ev) {
    if (stopped || events.length >= watchLimit) return;
    if (String(msg?.author?.id ?? "") !== accountId) return;
    const rawId = String(msg?.id ?? "");
    const rawChannel = String(ev?.channelId ?? ev?.channel_id ?? msg?.channel_id ?? msg?.channelId ?? "");
    if (!/^\d{15,22}$/.test(rawId) || !/^\d{15,22}$/.test(rawChannel)) return;
    counts[source]++;
    savedMessageIds.add(rawId);
    // May be missing. Never print or persist raw nonce.
    const nonce = msg?.nonce;
    const isOptimistic = ev?.optimistic === true || msg?.optimistic === true;
    const state = msg?.state;
    events.push({
      elapsedMs: Date.now() - startedAt,
      source,
      message: idAlias("message", rawId),
      nonce: idAlias("nonce", nonce),
      channel: idAlias("channel", rawChannel),
      optimistic: isOptimistic,
      state: typeof state === "string" ? state.slice(0, 25) : typeof state === "number" ? state : null,
      type: typeof msg?.type === "number" ? msg.type : null,
      idEqualsNonce: nonce != null && rawId === String(nonce),
      seenBefore: events.some(record => record.message === idAlias("message", rawId))
    });
    console.info("[Queue Audit] Recorded own-message metadata (" + source + "), total: " + events.length);
  }
  function onCreate(event) { record("flux", event?.message, event); }

  function scan() {
    if (stopped || !messageStore || !selectedChannelStore) return;
    let channelId, items;
    try {
      channelId = String(selectedChannelStore.getChannelId?.() ?? "");
      if (!/^\d{15,22}$/.test(channelId)) return;
      const value = messageStore.getMessages(channelId);
      items = value?._array ?? value?.toArray?.() ?? [];
      if (!Array.isArray(items)) return;
    } catch { return; }
    if (!cacheSeen.has(channelId)) {
      cacheSeen.set(channelId, new Set(items.map(m => String(m?.id ?? ""))));
      return;
    }
    const seen = cacheSeen.get(channelId);
    for (const msg of items) {
      const key = String(msg?.id ?? "");
      if (!/^\d{15,22}$/.test(key) || seen.has(key)) continue;
      seen.add(key);
      record("cache", msg, { channelId });
    }
    if (seen.size > 1000) cacheSeen.set(channelId,
      new Set(items.map(m => String(m?.id ?? ""))));
  }

  if (dispatcher) {
    try { dispatcher.subscribe("MESSAGE_CREATE", onCreate); }
    catch { dispatcher = null; }
  }
  function report() {
    // Convert any aliases into aggregated counts and pseudonymous event sequence.
    const snapshot = {
      auditVersion: "1.0",
      readOnly: true,
      sources: { flux: Boolean(dispatcher), selectedChannelCache: Boolean(messageStore && selectedChannelStore) },
      matchingEvents: { ...counts },
      distinctMessageAliases: savedMessageIds.size,
      eventSequence: events.map(e => ({ ...e })),
      interpretation: "M* = temporary message alias, N* = nonce alias, C* = channel alias; no raw IDs or text."
    };
    console.log("[Queue Audit] Sanitized report:", JSON.stringify(snapshot, null, 2));
    return snapshot;
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    if (interval) clearInterval(interval);
    if (dispatcher) try { dispatcher.unsubscribe("MESSAGE_CREATE", onCreate); } catch {}
    events.length = 0;
    savedMessageIds.clear();
    for (const map of Object.values(aliases)) map.clear();
    cacheSeen.clear();
    console.info("[Queue Audit] Stopped; all temporary IDs and event metadata cleared.");
  }

  // Establish baseline on selected channel before listening to new events.
  scan();
  interval = setInterval(scan, 250);
  window[NAME] = { get running() { return !stopped; }, report, stop };
  console.info("[Queue Audit] Read-only watcher ready. Send ONE harmless message in a test channel. Then run DiscordQueueAudit.report(), copy the returned JSON, and stop(). No messages will be changed.");
})();