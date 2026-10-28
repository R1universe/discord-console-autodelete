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

  // Fail closed: loaded history and cache hydration are NOT new outgoing messages.
  // A message's creation timestamp, not its cache-discovery time, determines eligibility.
  const CREATION_SKEW_MS = 2000;
  function messageCreatedAt(msg) {
    const value = msg?.timestamp ?? msg?.created_at ?? msg?.createdAt;
    if (value != null) {
      const parsed = typeof value === "number" ? value : Date.parse(String(value));
      if (Number.isFinite(parsed)) return parsed;
    }
    // Discord snowflakes encode a server-side creation timestamp.
    const id = String(msg?.id ?? "");
    if (!validId(id)) return NaN;
    try { return Number((BigInt(id) >> 22n) + 1420070400000n); }
    catch { return NaN; }
  }
  function newSinceEnabled(msg, channelId, fromCache) {
    const created = messageCreatedAt(msg);
    if (!Number.isFinite(created) || !state.enabledSince) return false;
    const boundary = fromCache ?
      Math.max(state.enabledSince, state.cacheObservedSince.get(channelId) ?? state.enabledSince) :
      state.enabledSince;
    // Prevent backfilled history, future/invalid timestamps, and old edits.
    return created >= boundary - CREATION_SKEW_MS && created <= Date.now() + CREATION_SKEW_MS;
  }
  // Space out expirations: Discord can rate-limit simultaneous deletions.
  const DELETE_SPACING_MS = 1400;
  const MAX_RATE_LIMIT_RETRIES = 2;
  function reserveDeletionSlot(job, minWaitMs) {
    const now = Date.now();
    const slot = Math.max(now + Math.max(0, minWaitMs), state.nextDeletionAt + DELETE_SPACING_MS);
    state.nextDeletionAt = slot;
    job.deadline = slot;
    job.timer = setTimeout(() => attemptDeletion(job), slot - now);
  }
  function rateLimitDelay(error) {
    const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
    if (status !== 429) return null;
    const seconds = Number(error?.retry_after ?? error?.body?.retry_after ??
      error?.response?.data?.retry_after);
    return Number.isFinite(seconds) && seconds > 0 ?
      Math.max(1500, Math.min(60000, Math.ceil(seconds * 1000))) : 5000;
  }
  async function attemptDeletion(job) {
    const { id, channelId } = job;
    if (state.pending.get(id) !== job || state.destroyed || !state.enabled) return;
    job.timer = null;
    if (String(hooks?.users?.getCurrentUser?.()?.id ?? "") !== state.accountId) {
      state.pending.delete(id);
      state.skipped++;
      notify("Account changed — skipping deletion.", "bad");
      render();
      return;
    }
    state.requests++;
    state.attemptedIds.add(id);
    if (state.attemptedIds.size > 1500)
      state.attemptedIds.delete(state.attemptedIds.values().next().value);
    try {
      if (hooks.rest) {
        await Promise.resolve(hooks.rest.del({ url: "/channels/" + channelId + "/messages/" + id }));
      } else {
        await Promise.resolve(hooks.actions.deleteMessage(channelId, id));
      }
      if (state.pending.get(id) === job) state.pending.delete(id);
      notify("Delete action invoked (server result not independently verified).", "good");
    } catch (error) {
      const retryMs = rateLimitDelay(error);
      if (retryMs !== null && job.retries < MAX_RATE_LIMIT_RETRIES &&
          state.enabled && !state.destroyed && state.pending.get(id) === job) {
        job.retries++;
        reserveDeletionSlot(job, retryMs);
        notify("Rate limited (429); retry " + job.retries + "/" + MAX_RATE_LIMIT_RETRIES +
          " scheduled in " + formatRemaining(job.deadline - Date.now()) + ".", "bad");
      } else {
        if (state.pending.get(id) === job) state.pending.delete(id);
        state.failed++;
        notify("Caught delete error: " + String(error?.message ?? error).slice(0, 140), "bad");
      }
    }
    render();
  }
  // Track provisional self-sends so MESSAGE_UPDATE does not delete old edited history.
  const provisional = new Map();
  function rememberProvisional(msg, channelId) {
    if (!validId(channelId) || !(msg.nonce != null || validId(msg.id))) return;
    provisional.set(channelId + ":" + String(msg.nonce ?? msg.id), Date.now());
    if (provisional.size > 2000) provisional.delete(provisional.keys().next().value);
  }
  function onUpdate(event) {
    if (!state.enabled || !hooks || state.destroyed) return;
    const fromEvent = event?.message;
    const channelId = String(event?.channelId ?? event?.channel_id ??
      fromEvent?.channel_id ?? fromEvent?.channelId ?? "");
    const id = String(fromEvent?.id ?? event?.messageId ?? event?.id ?? "");
    if (!validId(channelId) || !validId(id)) return;
    const cached = hooks.messageStore?.getMessage?.(channelId, id);
    const msg = cached && !isProvisional(cached) ? cached : fromEvent;
    if (!msg || isProvisional(msg, event)) return;
    const nonce = String(msg.nonce ?? "");
    const nonceKey = nonce ? channelId + ":" + nonce : "";
    const idKey = channelId + ":" + id;
    const matchedKey = nonceKey && provisional.has(nonceKey) ? nonceKey :
      provisional.has(idKey) ? idKey : null;
    if (!matchedKey || Date.now() - provisional.get(matchedKey) > 90000) return;
    onCreate({ message: msg, channelId });
    if (state.pending.has(id) || state.processed.has(id)) {
      if (nonceKey) provisional.delete(nonceKey);
      provisional.delete(idKey);
    }
  }
  function onCreate(event) {
    if (!state.enabled || !hooks || state.destroyed) return;
    const msg = event?.message;
    if (!msg || String(msg.author?.id ?? "") !== state.accountId) return;
    const channelId = String(event?.channelId ?? event?.channel_id ?? msg.channel_id ?? msg.channelId ?? "");
    if (!validId(channelId) || !newSinceEnabled(msg, channelId, event?.fromCache === true)) return;
    if (isProvisional(msg, event)) {
      rememberProvisional(msg, channelId);
      return;
    }
    const id = String(msg.id ?? "");
    if (!validId(id) || !validId(channelId) || state.pending.has(id) || state.processed.has(id)) return;
    const kind = classifyChannel(msg, channelId);
    if (!scopeMatches(kind)) { state.skipped++; return; }
    const guildId = String(msg.guild_id ?? msg.guildId ?? hooks?.channelStore?.getChannel(channelId)?.guild_id ?? "");
    if ((kind === "dm" && config.excludedDms.includes(channelId)) ||
        (kind === "servers" && config.excludedGuilds.includes(guildId))) {
      state.skipped++;
      return;
    }
    const delaySeconds = kind === "servers" ? config.serverDelay : config.dmDelay;
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
    const job = { id, channelId, guildId, kind, deadline: 0, timer: null, retries: 0 };
    state.pending.set(id, job);
    reserveDeletionSlot(job, delaySeconds * 1000);
    notify((kind === "dm" ? "DM" : "Server") + " message queued for deletion attempt.");
    render();
  }
  function onDelete(event) {
    const id = String(event?.id ?? event?.messageId ?? event?.message?.id ?? "");
    if (!validId(id)) return;
    if (state.attemptedIds.has(id) && !state.countedDeleted.has(id)) {
      state.countedDeleted.add(id);
      if (state.countedDeleted.size > 1500)
        state.countedDeleted.delete(state.countedDeleted.values().next().value);
      state.deleted++;
      notify("Observed message deletion after AutoDelete request.", "good");
    }
    cancel(id);
    render(); // A timer may have left pending before MESSAGE_DELETE arrives.
  }

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
      state.cacheObservedSince.set(channelId, Date.now());
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
        onCreate({ message: msg, channelId, fromCache: true });
    }
    if (seen.size > 2500) {
      state.cacheSeen.set(channelId, new Set(items.map(m => String(m?.id ?? ""))));
    }
  }
  function primeCache() {
    state.cacheSeen.clear();
    state.cacheObservedSince.clear();
    try {
      const cache = cachedMessages();
      if (cache) {
        state.cacheSeen.set(cache.channelId, new Set(cache.items.map(m => String(m?.id ?? ""))));
        state.cacheObservedSince.set(cache.channelId, Date.now());
      }
    } catch {}
  }

  function disconnect() {
    if (hooks) {
      for (const dispatcher of hooks.activeDispatchers ?? []) {
        try { dispatcher.unsubscribe?.("MESSAGE_CREATE", onCreate); } catch {}
        try { dispatcher.unsubscribe?.("MESSAGE_UPDATE", onUpdate); } catch {}
        try { dispatcher.unsubscribe?.("MESSAGE_DELETE", onDelete); } catch {}
      }
    }
    hooks = null;
    state.ready = false;
    state.enabled = false;
    state.cacheSeen.clear();
    pickerKind = null;
    renderPicker();
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
          try { dispatcher.subscribe("MESSAGE_UPDATE", onUpdate); } catch {}
          discovered.activeDispatchers.push(dispatcher);
        } catch {
          try { dispatcher.unsubscribe?.("MESSAGE_CREATE", onCreate); } catch {}
          try { dispatcher.unsubscribe?.("MESSAGE_UPDATE", onUpdate); } catch {}
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
    if (pickerKind) renderPicker();
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
    state.nextDeletionAt = 0;
    provisional.clear();
    state.enabledSince = Date.now();
    state.enabled = true;
    notify("Auto-delete enabled.", "good");
    render();
    return true;
  }
  function updateDelay(kind, value) {
    if (!validDelay(value)) throw new RangeError("Delay must be an integer from 1 to 86400 seconds.");
    const seconds = Number(value);
    if (kind === "servers") config.serverDelay = seconds;
    else if (kind === "dm") config.dmDelay = seconds;
    else throw new RangeError("Delay category must be 'servers' or 'dm'.");
    save();
    render();
    notify((kind === "dm" ? "DM" : "Server") + " delay set to " + seconds + "s (new messages only).");
    return seconds;
  }
  // Exclusions affect only the selected locations; existing queued jobs there
  // are cancelled immediately. No user token or message content is read.
  function exclude(kind, value, selected = true) {
    if (kind !== "dm" && kind !== "servers") throw new RangeError("Exclusion kind: dm | servers");
    const id = String(value ?? "");
    if (!validId(id)) throw new RangeError("Enter a valid Discord channel or server ID.");
    const key = kind === "dm" ? "excludedDms" : "excludedGuilds";
    const next = new Set(config[key]);
    if (selected) next.add(id); else next.delete(id);
    if (next.size > 300) throw new RangeError("Up to 300 excluded locations per category.");
    config[key] = [...next];
    if (selected) {
      for (const [messageId, job] of [...state.pending.entries()]) {
        if ((kind === "dm" && job.kind === "dm" && job.channelId === id) ||
            (kind === "servers" && job.kind === "servers" && job.guildId === id))
          cancel(messageId);
      }
    }
    save(); render(); if (pickerKind) renderPicker();
    notify((selected ? "Excluded " : "Restored ") + (kind === "dm" ? "DM channel" : "server") + " from auto-delete.");
    return config[key].length;
  }
  // Use the list of opened private channels, never the broad historical channel cache.
