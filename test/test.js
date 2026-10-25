// Local-only, dependency-free smoke/integration tests for autodelete.js v3.5.
// No Discord login or network. Modules and DOM are intentionally mocked.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "autodelete.js"), "utf8");

function fakeElement() {
  const events = new Map();
  const classes = new Set();
  return {
    style: {}, className: "", dataset: {}, value: "", textContent: "",
    innerHTML: "", disabled: false, removed: false,
    classList: { add(x) { classes.add(x); }, remove(x) { classes.delete(x); },
      toggle(x, force) { if (force) classes.add(x); else classes.delete(x); },
      contains(x) { return classes.has(x); } },
    addEventListener(name, fn) { events.set(name, fn); },
    removeEventListener(name) { events.delete(name); },
    dispatch(name, payload = {}) { events.get(name)?.(payload); },
    append() {}, appendChild() {}, replaceChildren() {},
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    remove() { this.removed = true; },
    attachShadow() { return shadow; }
  };
}

let shadow;
function createEnvironment(options = {}) {
  const ids = new Map();
  const presets = ["servers", "dm"].flatMap(kind =>
    ["5", "10", "30", "60"].map(delay => {
      const e = fakeElement();
      e.dataset.delay = delay;
      e.dataset.delayFor = kind;
      return e;
    })
  );
  shadow = {
    getElementById(id) {
      if (!ids.has(id)) ids.set(id, fakeElement());
      return ids.get(id);
    },
    querySelectorAll() { return presets; },
    appendChild() {},
  };
  const document = {
    body: { appendChild() {} },
    createElement: fakeElement,
    addEventListener() {},
    removeEventListener() {}
  };
  const stored = new Map(options.initialStorage ?? []);
  const localStorage = {
    setItem(k,v) { stored.set(k,v); },
    getItem(k) { return stored.get(k) ?? null; }
  };

  const subscribers = new Map();
  const dispatcher = {
    _subscriptions: {},
    flushWaitQueue() {},
    subscribe(name, fn) {
      if (!subscribers.has(name)) subscribers.set(name, new Set());
      subscribers.get(name).add(fn);
    },
    unsubscribe(name, fn) { subscribers.get(name)?.delete(fn); },
    dispatch({ type, ...event }) {
      for (const fn of subscribers.get(type) ?? []) fn(event);
    }
  };
  const account = { id: "123456789012345678" };
  const cached = [];
  const messageStore = {
    getMessages() { return { _array: cached }; },
    getMessage(_channelId, msgId) { return cached.find(m => m.id === msgId); }
  };
  Object.setPrototypeOf(messageStore, { constructor: { displayName: "MessageStore" } });
  const selectedChannel = {
    getChannelId() { return "444444444444444444"; }
  };
  Object.setPrototypeOf(selectedChannel, { constructor: { displayName: "SelectedChannelStore" } });
  const restURLs = [];
  const rest = {
    get() {}, post() {}, put() {}, patch() {},
    del({ url }) { restURLs.push(url); return Promise.resolve(); }
  };
  const users = {
    getCurrentUser() { return account; },
    getUser(id) { return id === account.id ? account : null; }
  };
  Object.setPrototypeOf(users, { constructor: { displayName: "UserStore" } });
  const deletions = [];
  const actions = {
    deleteMessage(channel, message) { deletions.push([channel, message]); return Promise.resolve(); },
    editMessage() {}
  };
  const channels = {
    getChannel(id) {
      if (id === "333333333333333333") return { id, type: 1 };
      return { id, type: 0, guild_id: "222222222222222222" };
    },
    getChannels() { return {}; }
  };
  Object.setPrototypeOf(channels, { constructor: { displayName: "ChannelStore" } });

  const duplicateRestWrappers = {};
  if (options.withRepeatedRest) {
    const getAPIBaseURL = () => "https://discord.com/api/v9";
    for (let i = 0; i < 83; i++) {
      duplicateRestWrappers["rest-copy-" + i] = {
        exports: { ["rest" + i]: { ...rest, getAPIBaseURL } }
      };
    }
  }
  if (options.withConflictingRest) {
    duplicateRestWrappers.conflict = {
      exports: { otherRest: { ...rest, del() { return Promise.resolve(); },
        getAPIBaseURL() { return "https://discord.com/api/v9"; } } }
    };
  }
  const duplicateActions = {};
  if (options.withRepeatedActions) {
    for (let i = 0; i < 84; i++) duplicateActions["action-copy-" + i] = {
      exports: { ["actions" + i]: { ...actions } }
    };
  }
  // Discord i18n proxies may create and cache *any requested property*
  // as a stable function, producing exactly the strange cross-family pattern.
  const proxyReads = { unrelatedMethodCalls: 0 };
  const fakeLocaleModules = {};
  if (options.withFakeLocaleProxies) {
    for (let i = 0; i < 83; i++) {
      const target = {};
      const simulated = new Proxy(target, {
        get(obj, key) {
          if (key === Symbol.toStringTag) return "IntlMessagesProxy";
          if (typeof key === "string" && [
            "deleteMessage", "getCurrentUser", "getMessages",
            "getUser", "del", "getAPIBaseURL", "HTTP"
          ].includes(key)) proxyReads.unrelatedMethodCalls++;
          if (typeof key !== "string") return Reflect.get(obj, key);
          if (!(key in obj)) Object.defineProperty(obj, key, {
            value: function syntheticTranslation() {}, configurable: true,
            enumerable: true, writable: true
          });
          return obj[key];
        }
      });
      fakeLocaleModules["locale-" + i] = { exports: simulated };
    }
  }
  if (options.withUntaggedCatchall) {
    const target = {};
    fakeLocaleModules.untagged = { exports: new Proxy(target, {
      get(obj, key) {
        if (key === Symbol.toStringTag) return undefined;
        if (typeof key === "string" && [
          "deleteMessage", "getCurrentUser", "getMessages", "del"
        ].includes(key)) proxyReads.unrelatedMethodCalls++;
        if (typeof key !== "string") return Reflect.get(obj, key);
        if (!(key in obj)) Object.defineProperty(obj, key, {
          value: function synthetic() {}, configurable: true, enumerable: true
        });
        return obj[key];
      }
    }) };
  }
  const native = { c: {
    ...fakeLocaleModules,
    ...duplicateRestWrappers,
    ...duplicateActions,
    ...(options.withoutDispatcher ? {} : { one: { exports: { A: dispatcher } } }),
    two: { exports: { B: users } },
    ...(options.withNestedRest ? {} : {
      three: { exports: { C: options.withRestOnly ? rest : actions } }
    }),
    ...(options.withNestedRest && !options.splitRest ? {
      seven: { exports: { restOuter: {
        getAPIBaseURL() { return "https://discord.com/api/v9"; },
        HTTP: rest
      } } }
    } : {}),
    ...(options.withMessageStore ? {
      five: { exports: { E: messageStore } },
      six: { exports: { F: selectedChannel } }
    } : {}),
    ...(options.withoutChannelStore ? {} : {
      four: { exports: { D: channels } }
    })
  } };
  const sentry = { c: {
    one: { exports: { irrelevant: {} } },
    ...(options.withNestedRest && options.splitRest ? {
      two: { exports: { httpWrapper: {
        getAPIBaseURL() { return "https://discord.com/api/v9"; },
        HTTP: rest
      } } }
    } : {})
  } };
  const chunks = [];
  chunks.push = function(entry) {
    Array.prototype.push.call(chunks, entry);
    // The Sentry runtime appears first, exactly the v1 failure scenario.
    entry[2](sentry);
    entry[2](native);
    return chunks.length;
  };
  const timers = new Map();
  let timerId = 0;
  const calls = [];
  const mockConsole = {
    info(x) { calls.push(["info", String(x)]); },
    warn(x) { calls.push(["warn", String(x)]); },
    error(x) { calls.push(["error", String(x)]); },
    table() {}
  };
  const window = { webpackChunkdiscord_app: chunks, innerWidth: 1280, innerHeight: 900 };
  let interval = () => {};
  const context = vm.createContext({
    window, document, localStorage,
    location: { hostname: "discord.com" },
    console: mockConsole,
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn) { interval = fn; return 777; },
    clearInterval() {},
    Symbol, Date, Number, Object, String, Set, Map, Math
  });
  function post(messageId, authorId = account.id, channelId = "444444444444444444") {
    dispatcher.dispatch({ type: "MESSAGE_CREATE", message: {
      id: messageId, author: { id: authorId }, channel_id: channelId,
      ...(channelId === "333333333333333333" ? {} : { guild_id: "222222222222222222" })
    }});
  }
  async function flushTimers() {
    const active = [...timers.entries()];
    for (const [id, timer] of active) {
      timers.delete(id);
      await timer.fn();
    }
  }
  return {
    context, window, document, ids, presets, localStorage, account,
    post, emit: (message, extra = {}) => dispatcher.dispatch({ type: "MESSAGE_CREATE", message, ...extra }),
    flushTimers, timers, deletions, calls, cached, restURLs, stored, presets,
    proxyReads, tick: () => interval()
  };
}

(async () => {
  const e = createEnvironment();
  vm.runInContext(source, e.context, { timeout: 3000 });
  const api = e.window.DiscordAutoDelete;
  assert.ok(api, "Controller exported");
  assert.equal(api.connected, true, "Find real runtime and named exports");
  assert.equal(api.running, false, "Never start deletion automatically");
  assert.ok(e.ids.get("ad-warning"), "Dashboard renders");

  assert.equal(api.resume(), true);
  e.post("555555555555555555", "999999999999999999");
  assert.equal(api.status().pending, 0, "Ignore other people");
  e.post("555555555555555555");
  e.post("555555555555555555");
  assert.equal(api.status().pending, 1, "Deduplicate events");
  await e.flushTimers();
  assert.deepEqual(e.deletions, [["444444444444444444", "555555555555555555"]], "Own message deleted once");

  api.setDelay(30);
  api.setScope("dm");
  assert.equal(api.status().serverDelaySeconds, 30);
  assert.equal(api.status().dmDelaySeconds, 30);
  e.post("666666666666666666", e.account.id, "444444444444444444");
  assert.equal(api.status().pending, 0, "Skip server message under DM scope");
  e.post("777777777777777777", e.account.id, "333333333333333333");
  assert.equal(api.status().pending, 1, "DM message queued");
  assert.equal([...e.timers.values()][0].ms, 30000);
  api.pause();
  assert.equal(api.status().pending, 0);
  assert.equal(e.timers.size, 0, "Pause cancels timers");

  api.setScope("all");
  api.resume();
  e.post("888888888888888888");
  e.account.id = "999999999999999999"; // account switch
  await e.flushTimers();
  assert.equal(e.deletions.length, 1, "Account switch must skip deletion");
  assert.equal(api.status().skipped, 2, "Counts scope skip and account switch");

  api.stop();
  assert.equal(e.window.DiscordAutoDelete, undefined, "Stop clears controller");
  // Independent timing: separate server and DM values, no timer rewrites.
  const splitDelays = createEnvironment();
  vm.runInContext(source, splitDelays.context, { timeout: 3000 });
  const dual = splitDelays.window.DiscordAutoDelete;
  assert.equal(dual.connected, true);
  assert.equal(dual.status().serverDelaySeconds, 10);
  assert.equal(dual.status().dmDelaySeconds, 10);
  assert.equal(dual.setServerDelay(5), 5);
  assert.equal(dual.setDmDelay(60), 60);
  assert.equal(dual.status().serverDelaySeconds, 5);
  assert.equal(dual.status().dmDelaySeconds, 60);
  assert.throws(() => dual.setDmDelay(1), /Delay must be an integer/, "Reject too-short DM delay");
  assert.throws(() => dual.setServerDelay(86401), /Delay must be an integer/, "Reject too-long server delay");
  assert.equal(dual.resume(), true);
  splitDelays.post("555555555555555555"); // Server
  splitDelays.post("666666666666666666", splitDelays.account.id, "333333333333333333"); // DM
  assert.equal(dual.status().pending, 2);
  assert.deepEqual([...splitDelays.timers.values()].map(t => t.ms), [5000, 60000],
    "Different timer durations for server and DM messages");
  // Changing a delay must not alter the scheduled timers.
  dual.setServerDelay(30);
  assert.deepEqual([...splitDelays.timers.values()].map(t => t.ms), [5000, 60000],
    "Old pending deadlines remain intact after changing a setting");
  const settingsStored = JSON.parse(splitDelays.stored.get("discord-autodelete-ui-v2"));
  assert.equal(settingsStored.serverDelay, 30);
  assert.equal(settingsStored.dmDelay, 60);
  const uiServers = splitDelays.presets.find(p => p.dataset.delayFor === "servers" && p.dataset.delay === "10");
  const uiDm = splitDelays.presets.find(p => p.dataset.delayFor === "dm" && p.dataset.delay === "30");
  uiServers.dispatch("click");
  uiDm.dispatch("click");
  assert.equal(dual.status().serverDelaySeconds, 10, "Server preset only changes server delay");
  assert.equal(dual.status().dmDelaySeconds, 30, "DM preset only changes DM delay");
  dual.pause();
  assert.equal(dual.status().pending, 0);
  dual.stop();

  // Simulate reloading with already persisted settings.
  const persisted = createEnvironment({ initialStorage: [
    ["discord-autodelete-ui-v2", splitDelays.stored.get("discord-autodelete-ui-v2")]
  ] });
  vm.runInContext(source, persisted.context, { timeout: 3000 });
  const afterReload = persisted.window.DiscordAutoDelete;
  assert.equal(afterReload.status().serverDelaySeconds, 10);
  assert.equal(afterReload.status().dmDelaySeconds, 30);
  assert.equal(afterReload.running, false, "Never enable by default after reload");
  afterReload.stop();

  // Legacy single-delay settings migrate to both categories, preserving value.
  const previous = createEnvironment({ initialStorage: [
    ["discord-autodelete-ui-v2", JSON.stringify({ delay: 42, scope: "all" })]
  ] });
  vm.runInContext(source, previous.context, { timeout: 3000 });
  const legacyApi = previous.window.DiscordAutoDelete;
  assert.equal(legacyApi.status().serverDelaySeconds, 42);
  assert.equal(legacyApi.status().dmDelaySeconds, 42);
  assert.equal(legacyApi.setDelay(20), 20, "Legacy setDelay still works");
  assert.equal(legacyApi.status().serverDelaySeconds, 20);
  assert.equal(legacyApi.status().dmDelaySeconds, 20);
  legacyApi.stop();

  // The channel must be classifiable even if scope='all'; don't assign a
  // potentially destructive timer by guessing unknown channel origin.
  const ambiguous = createEnvironment({ withoutChannelStore: true });
  vm.runInContext(source, ambiguous.context, { timeout: 3000 });
  const ambiguousApi = ambiguous.window.DiscordAutoDelete;
  ambiguousApi.setScope("all");
  ambiguousApi.resume();
  ambiguous.emit({
    id: "555555555555555555",
    author: { id: ambiguous.account.id },
    channel_id: "999999999999999999",
    state: "SENT"
  });
  assert.equal(ambiguousApi.status().pending, 0,
    "Unknown channel type must not pick a default server or DM timeout");
  ambiguousApi.stop();

  // Field regression: one visible outgoing send produces a temporary M2 and
  // confirmed M3 with the same nonce but different IDs (2026-10-25 audit).
  // The temporary message enters the cache with optimistic:false, SENDING
  // and id===nonce, which v3.3 mistakenly scheduled for deletion.
  const lifecycle = createEnvironment({ withMessageStore: true });
  vm.runInContext(source, lifecycle.context, { timeout: 3000 });
  const live = lifecycle.window.DiscordAutoDelete;
  assert.equal(live.connected, true);
  live.resume();
  const channel = "444444444444444444";
  const nonce = "555555555555555555";
  const serverId = "666666666666666666";
  const otherServerId = "777777777777777777";
  const base = { author: { id: lifecycle.account.id },
    channel_id: channel, guild_id: "222222222222222222", type: 0 };
  const M2 = { ...base, id: nonce, nonce, optimistic: true, state: "SENDING" };
  const M3 = { ...base, id: serverId, nonce, optimistic: true, state: null };
  lifecycle.emit(M2, { optimistic: true });
  lifecycle.cached.push({ ...M2, optimistic: false });
  lifecycle.tick();
  assert.equal(live.status().pending, 0,
    "Temporary cache entry in SENDING state with id=nonce must not be queued");
  lifecycle.emit(M3, { optimistic: true });
  assert.equal(live.status().pending, 0,
    "Optimistic event for server ID must not be queued");
  lifecycle.emit({ ...M3, optimistic: false }, { optimistic: false });
  lifecycle.cached.push({ ...M3, optimistic: false, state: "SENT" });
  lifecycle.tick();
  assert.equal(live.status().pending, 1,
    "Only confirmed server message M3 queued; cache duplicate ignored");
  lifecycle.emit({ ...M3, id: otherServerId, optimistic: false });
  assert.equal(live.status().pending, 1,
    "Second confirmed representation with same nonce cannot queue a second job");
  await lifecycle.flushTimers();
  assert.deepEqual(lifecycle.deletions, [[channel, serverId]],
    "Only the real confirmed server ID is passed to deleteMessage");
  assert.equal(live.status().requests, 1, "Attempts count one delete action");
  assert.equal(live.status().failed, 0);
  live.stop();

  // Cache-only mode: messages with a nonces not equal to ID may still
  // transition SENDING -> SENT without changing server ID.
  const transition = createEnvironment({ withoutDispatcher: true, withMessageStore: true, withRestOnly: true });
  vm.runInContext(source, transition.context, { timeout: 3000 });
  const cachedOnly = transition.window.DiscordAutoDelete;
  cachedOnly.resume();
  const pendingCache = { ...base, id: serverId, nonce, state: "SENDING" };
  transition.cached.push(pendingCache);
  transition.tick();
  assert.equal(cachedOnly.status().pending, 0,
    "A SENDING cache message never creates deletion job");
  pendingCache.state = "SENT";
  transition.tick();
  assert.equal(cachedOnly.status().pending, 1,
    "Same server ID transitioning to SENT is queued on next scan");
  await transition.flushTimers();
  assert.deepEqual(transition.restURLs,
    ["/channels/" + channel + "/messages/" + serverId]);
  cachedOnly.stop();

  const e2 = createEnvironment({ withoutDispatcher: true, withMessageStore: true, withRestOnly: true });
  vm.runInContext(source, e2.context, { timeout: 3000 });
  const fallback = e2.window.DiscordAutoDelete;
  assert.equal(fallback.connected, true, "Works without FluxDispatcher via cache-only fallback");
  assert.match(fallback.status().monitor, /cache only/i, "Clearly labels reduced coverage");
  assert.equal(fallback.running, false, "No implicit deletion");
  fallback.resume();
  e2.cached.push({ id: "555555555555555555", author: { id: e2.account.id }, channel_id: "444444444444444444", guild_id: "222222222222222222" });
  e2.tick();
  assert.equal(fallback.status().pending, 1, "Finds new own message in open-channel cache");
  await e2.flushTimers();
  assert.deepEqual(e2.restURLs, ["/channels/444444444444444444/messages/555555555555555555"], "Uses authenticated Discord REST module");
  e2.tick();
  assert.equal(fallback.status().pending, 0, "Does not reschedule same message");
  fallback.stop();

  // Unknown channel origin must never be treated as proof of a DM.
  const unknown = createEnvironment({ withoutChannelStore: true });
  vm.runInContext(source, unknown.context, { timeout: 3000 });
  const unknownApi = unknown.window.DiscordAutoDelete;
  assert.equal(unknownApi.connected, true);
  unknownApi.setScope("dm");
  unknownApi.resume();
  unknown.post("555555555555555555", unknown.account.id, "333333333333333333");
  assert.equal(unknownApi.status().pending, 0, "Unknown channel must not be assumed DM");
  unknownApi.stop();

  const locales = createEnvironment({ withFakeLocaleProxies: true, withUntaggedCatchall: true });
  vm.runInContext(source, locales.context, { timeout: 6000 });
  const clean = locales.window.DiscordAutoDelete;
  assert.equal(clean.connected, true,
    "83 Discord-style translation proxies must not block actual module discovery");
  assert.equal(locales.proxyReads.unrelatedMethodCalls, 0,
    "Skip i18n and catch-all proxies before reading unrelated module methods");
  assert.equal(clean.running, false,
    "Even successful discovery must not auto-enable deletion");
  clean.resume();
  locales.post("555555555555555555");
  await locales.flushTimers();
  assert.deepEqual(locales.deletions, [
    ["444444444444444444", "555555555555555555"]
  ], "Only trusted mock MessageActions is selected");
  clean.stop();

  const duplicates = createEnvironment({
    withoutDispatcher: true, withMessageStore: true, withRestOnly: true,
    withRepeatedRest: true
  });
  vm.runInContext(source, duplicates.context, { timeout: 3000 });
  const deduplicated = duplicates.window.DiscordAutoDelete;
  assert.equal(deduplicated.connected, true,
    "83 distinct wrappers exporting one REST delete function must not count as 83 different operations");
  deduplicated.resume();
  duplicates.cached.push({
    id: "555555555555555555",
    author: { id: duplicates.account.id },
    channel_id: "444444444444444444",
    guild_id: "222222222222222222"
  });
  duplicates.tick();
  await duplicates.flushTimers();
  assert.deepEqual(duplicates.restURLs,
    ["/channels/444444444444444444/messages/555555555555555555"]);
  deduplicated.stop();

  const repeatedActions = createEnvironment({ withRepeatedActions: true });
  vm.runInContext(source, repeatedActions.context, { timeout: 3000 });
  assert.equal(repeatedActions.window.DiscordAutoDelete.connected, true,
    "Repeated MessageAction re-exports must resolve by function identity");
  repeatedActions.window.DiscordAutoDelete.stop();

  const conflict = createEnvironment({
    withoutDispatcher: true, withMessageStore: true, withRestOnly: true,
    withRepeatedRest: true, withConflictingRest: true
  });
  vm.runInContext(source, conflict.context, { timeout: 3000 });
  assert.equal(conflict.window.DiscordAutoDelete.connected, false,
    "Distinct REST delete functions must fail closed");
  assert.match(conflict.window.DiscordAutoDelete.status().error,
    /distinct del functions/, "Show distinct operation counts");
  conflict.window.DiscordAutoDelete.stop();

  const e3 = createEnvironment({
    withoutDispatcher: true, withMessageStore: true,
    withRestOnly: true, withNestedRest: true, splitRest: true
  });
  vm.runInContext(source, e3.context, { timeout: 3000 });
  const split = e3.window.DiscordAutoDelete;
  assert.equal(split.connected, true, "Cross-runtime nested HTTP API resolved");
  assert.equal(split.running, false, "No implicit delete in fallback");
  split.resume();
  e3.cached.push({
    id: "555555555555555555",
    author: { id: e3.account.id },
    channel_id: "444444444444444444",
    guild_id: "222222222222222222"
  });
  e3.tick();
  await e3.flushTimers();
  assert.deepEqual(
    e3.restURLs,
    ["/channels/444444444444444444/messages/555555555555555555"],
    "Nested HTTP transport performs the request"
  );
  split.stop();

  assert.equal(/[^\\x00-\\x7F]*Временные сообщения/.test(source), false, "English-first interface");
  console.log("PASS: independent server/DM delays, persistence, migration, confirmed nonce lifecycle, REST, scopes and UI");
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
