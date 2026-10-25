// Local-only, dependency-free smoke/integration tests for autodelete.js v3.
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
  const presets = ["5", "10", "30", "60"].map(delay => {
    const e = fakeElement();
    e.dataset.delay = delay;
    return e;
  });
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
  const stored = new Map();
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

  const native = { c: {
    ...(options.withoutDispatcher ? {} : { one: { exports: { A: dispatcher } } }),
    two: { exports: { B: users } },
    three: { exports: { C: options.withRestOnly ? rest : actions } },
    ...(options.withMessageStore ? {
      five: { exports: { E: messageStore } },
      six: { exports: { F: selectedChannel } }
    } : {}),
    four: { exports: { D: channels } }
  } };
  const sentry = { c: { one: { exports: { irrelevant: {} } } } };
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
    post, flushTimers, timers, deletions, calls, cached, restURLs, tick: () => interval()
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
  assert.equal(api.status().delaySeconds, 30);
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

  assert.equal(/[^\x00-\x7F]*Временные сообщения/.test(source), false, "English-first interface");
  console.log("PASS: modules, safe default, cache fallback, REST, queue, scopes, account switch, English UI");
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
