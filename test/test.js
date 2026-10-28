// Local-only, dependency-free smoke/integration tests for autodelete.js v3.15.
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
    innerHTML: "", disabled: false, removed: false, attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name] ?? null; },
    classList: { add(x) { classes.add(x); }, remove(x) { classes.delete(x); },
      toggle(x, force) { if (force) classes.add(x); else classes.delete(x); },
      contains(x) { return classes.has(x); } },
    addEventListener(name, fn) { events.set(name, fn); },
    removeEventListener(name) { events.delete(name); },
    dispatch(name, payload = {}) { events.get(name)?.(payload); },
    focus() { this.dispatch("focus", { target: this }); },
    blur() {
      // Simplified Chrome behavior: change fires upon committing a text
      // input, then blur. The shadow root's activeElement remains unavailable
      // here to reproduce the previous half-second render overwrite bug.
      this.dispatch("change", { target: this });
      this.dispatch("blur", { target: this });
    },
    children: [],
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    click() { this.dispatch("click"); },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    remove() { this.removed = true; },
    attachShadow() { return shadow; }
  };
}

let shadow;
function createEnvironment(options = {}) {
  const ids = new Map();
  const messageContents = new Map();
  let overlayHost = null;
  const scopeButtons = ["servers", "dm"].map(scope => {
    const btn = fakeElement();
    btn.dataset.scope = scope;
    return btn;
  });
  shadow = {
    getElementById(id) {
      if (!ids.has(id)) ids.set(id, fakeElement());
      return ids.get(id);
    },
    querySelectorAll(selector) {
      if (selector === "[data-scope]") return scopeButtons;
      throw new Error("Unexpected selector: " + selector);
    },
    appendChild() {},
  };
  const documentEvents = new Map();
  const sidebarLinks = [];
  const document = {
    body: { appendChild(node) {
      overlayHost = node;
      node.getBoundingClientRect = () => ({
        left: Number.parseFloat(node.style.left) || 0,
        top: Number.parseFloat(node.style.top) || 0,
        width: 345, // Both 392px panels render at 88% scale (344.96px).
        height: ids.get("ad-mini-panel")?.hidden === false ? 70 : 458
      });
    } },
    createElement: fakeElement,
    querySelectorAll(selector) {
      if (selector === '[id^="message-content-"]') return [...messageContents.values()];
      if (selector === 'a[href^="/channels/@me/"]') return sidebarLinks;
      throw new Error("Unexpected document selector: " + selector);
    },
    addEventListener(type, fn) { if (!documentEvents.has(type)) documentEvents.set(type, new Set()); documentEvents.get(type).add(fn); },
    removeEventListener(type, fn) { documentEvents.get(type)?.delete(fn); }
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
      // Mock sends model a freshly created Discord message unless a test
      // explicitly supplies an old timestamp.
      if (event.message && event.message.timestamp == null)
        event.message.timestamp = new Date().toISOString();
      for (const fn of subscribers.get(type) ?? []) fn(event);
    }
  };
  const account = { id: "123456789012345678" };
  const cached = [];
  cached.push = function (...messages) {
    for (const message of messages)
      if (message.timestamp == null) message.timestamp = new Date().toISOString();
    return Array.prototype.push.apply(this, messages);
  };
  let selectedChannelId = "444444444444444444";
  const messageStore = {
    getMessages(channel) { return { _array: cached.filter(m =>
      String(m.channel_id ?? m.channelId ?? selectedChannelId) === String(channel)) }; },
    getMessage(_channelId, msgId) { return cached.find(m => m.id === msgId); }
  };
  Object.setPrototypeOf(messageStore, { constructor: { displayName: "MessageStore" } });
  const selectedChannel = {
    getChannelId() { return selectedChannelId; }
  };
  Object.setPrototypeOf(selectedChannel, { constructor: { displayName: "SelectedChannelStore" } });
  const restURLs = [];
  const rest = {
    get() {}, post() {}, put() {}, patch() {},
    del({ url }) {
      restURLs.push(url);
      if (options.rateLimitOnce && restURLs.length === 1) {
        const error = new Error("Rate limited");
        error.status = 429;
        error.retry_after = 0.3;
        return Promise.reject(error);
      }
      return Promise.resolve();
    }
  };
  const users = {
    getCurrentUser() { return account; },
    getUser(id) { return id === account.id ? account :
      (options.withPrivateList && id === "111111111111111111" ?
        { id, globalName: "Robert", username: "robertk" } : null); }
  };
  Object.setPrototypeOf(users, { constructor: { displayName: "UserStore" } });
  const deletions = [];
  const actions = {
    deleteMessage(channel, message) { deletions.push([channel, message]); return Promise.resolve(); },
    editMessage() {}
  };
  const channels = {
    getChannel(id) {
      if (id === "333333333333333333") return { id, type: 1, recipients: ["111111111111111111"] };
      if (id === "777777777777777777") return { id, type: 1 };
      if (id === "888888888888888888") return { id, type: 3 };
      return { id, type: 0, guild_id: "222222222222222222" };
    },
    getChannels() { return {}; },
    getPrivateChannels() { return options.withPrivateList ? { "777777777777777777": { id: "777777777777777777", type: 1 } } : {}; },
    getDMFromUserId(id) { return id === "111111111111111111" ? "333333333333333333" : null; }
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
    ...(options.withPrivateList ? { privateSort: { exports: { ps: {
      getPrivateChannelIds() { return ["333333333333333333", "888888888888888888"]; }
    } } } } : {}),
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
    context, window, document, ids, get overlayHost() { return overlayHost; }, localStorage, account,
    showMessage(id) {
      const target = fakeElement();
      target.id = "message-content-" + id;
      target.isConnected = true;
      target.children = [];
      target.appendChild = node => { target.children.push(node); node.parentElement = target; };
      messageContents.set(String(id), target);
      return target;
    },
    hideMessage(id) {
      const target = messageContents.get(String(id));
      if (target) target.isConnected = false;
      messageContents.delete(String(id));
    },
    post, selectChannel(id) { selectedChannelId = String(id); },
    emit: (message, extra = {}) => dispatcher.dispatch({ type: "MESSAGE_CREATE", message, ...extra }),
    emitDelete: id => dispatcher.dispatch({ type: "MESSAGE_DELETE", id }),
    emitUpdate: (message, extra = {}) => dispatcher.dispatch({ type: "MESSAGE_UPDATE", message, ...extra }),
    flushTimers, timers, deletions, calls, cached, restURLs, stored, scopeButtons,
    proxyReads, tick: () => interval(), documentDispatch: (type, event) => {
      for (const fn of documentEvents.get(type) ?? []) fn(event);
    }, sidebarLinks
  };
}

(async () => {
  const e = createEnvironment();
  vm.runInContext(source, e.context, { timeout: 3000 });
  const api = e.window.DiscordAutoDelete;
  assert.ok(api, "Controller exported");
  // v3.15 compact glass regression: both modes have identical scaled widths.
  for (const file of ["autodelete.js", "AutoDelete.plugin.js"]) {
    const script = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.ok(script.includes('".ad-shell{zoom:.88}"'), file + " uses a consistent 12% smaller UI");
    assert.ok(script.includes('root.className = "ad-shell";'), file + " scales the entire UI");
    assert.ok(script.includes('".panel{width:344px}.mini-panel{width:344px}'), file + " uses the narrower 344px full panel width");
    assert.ok(script.includes('".panel{width:344px}.mini-panel{width:344px}'), file + " matches narrower minimized width");
    assert.ok(script.includes("#2d3857a1") && script.includes("#193c3aa3"), file + " softens normal and active full-panel glass");
    assert.ok(script.includes("#273251bd") && script.includes("#1c4943be"), file + " softens normal and active mini glass");
    assert.ok(script.includes('.delay .value,.delay .exclude-btn{'), file + " harmonizes font metrics and control heights");
    assert.ok(script.includes('.diag-bottom-resizer{'), file + " supports footer-edge resize styling");
  }
  assert.doesNotMatch(source, /function choose\(candidates, predicate/, "Obsolete unused discovery helper removed");
  // A newer paste stops old code; a same-version paste only reopens the window.
  const sameVersion = createEnvironment();
  let sameOpened = 0;
  sameVersion.window.DiscordAutoDelete = { version: "3.20.0", open() { sameOpened++; } };
  vm.runInContext(source, sameVersion.context, { timeout: 3000 });
  assert.equal(sameOpened, 1, "Same version reopens without duplicate instance");
  const oldVersion = createEnvironment();
  let previousStopped = 0;
  oldVersion.window.DiscordAutoDelete = {
    version: "3.15.0",
    open() { throw new Error("Outdated code must not reopen"); },
    stop() { previousStopped++; delete oldVersion.window.DiscordAutoDelete; }
  };
  vm.runInContext(source, oldVersion.context, { timeout: 3000 });
  assert.equal(previousStopped, 1, "Old instance is stopped");
  assert.equal(oldVersion.window.DiscordAutoDelete.version, "3.20.0", "New controller version");
  assert.equal(oldVersion.window.DiscordAutoDelete.running, false, "Upgrade starts paused");
  oldVersion.window.DiscordAutoDelete.stop();

  // Minimize becomes a tiny, live and draggable status window.
  assert.doesNotMatch(source, /id="ad-pill"|ad-pill-text|class="pill"|\.collapsed \.pill/,
    "Legacy large minimized pill was not restored");
  assert.match(source, /id="ad-mini-panel" hidden/, "New compact window exists");
  assert.match(source, /id="ad-restore"/, "Minimized window has expand button");
  assert.ok(e.overlayHost, "Overlay host was mounted");
  assert.equal(e.overlayHost.style.display, undefined, "Overlay host remains visible");
  e.ids.get("ad-min").dispatch("click");
  assert.equal(e.overlayHost.style.display, undefined, "Minimize does not hide the entire host");
  assert.equal(e.ids.get("ad-panel").style.display, "none", "Full dashboard hides");
  assert.equal(e.ids.get("ad-mini-panel").hidden, false, "Compact status appears");
  assert.equal(api.running, false, "Minimize does not silently start monitoring");
  e.ids.get("ad-restore").dispatch("click");
  assert.equal(e.ids.get("ad-panel").style.display, "", "Expand restores full dashboard");
  assert.equal(e.ids.get("ad-mini-panel").hidden, true, "Compact status hides after expand");
  api.hide();
  assert.equal(e.ids.get("ad-mini-panel").hidden, false, "hide() retains minimized status rather than hiding host");
  api.minimize();
  assert.equal(e.ids.get("ad-mini-panel").hidden, false, "Explicit minimize() works");
  api.openDiagnostics();
  assert.equal(e.ids.get("ad-panel").style.display, "", "openDiagnostics() expands full dashboard");
  assert.equal(e.ids.get("ad-mini-panel").hidden, true);
  assert.equal(e.ids.get("ad-diagnostics").open, true,
    "Diagnostics can be opened from compact state");

  // Dragging the mini window moves the host; restore clicks must not start a drag.
  api.minimize();
  const mini = e.ids.get("ad-mini-panel");
  mini.dispatch("pointerdown", { target: { closest: () => null }, clientX: 100, clientY: 140, button: 0 });
  e.documentDispatch("pointermove", { clientX: 180, clientY: 210 });
  assert.equal(e.overlayHost.style.left, "80px", "Mini window can move horizontally");
  assert.equal(e.overlayHost.style.top, "70px", "Mini window can move vertically");
  e.documentDispatch("pointerup", {});
  e.documentDispatch("pointermove", { clientX: 500, clientY: 400 });
  assert.equal(e.overlayHost.style.left, "80px", "Released mini window does not keep moving");
  mini.dispatch("pointerdown", { target: { closest: () => ({}) }, clientX: 80, clientY: 70, button: 0 });
  e.documentDispatch("pointermove", { clientX: 700, clientY: 700 });
  assert.equal(e.overlayHost.style.left, "80px", "Restore button pointerdown never drags the window");
  e.ids.get("ad-restore").dispatch("click");
  assert.equal(e.ids.get("ad-panel").style.display, "", "Expand works after drag");

  // v3.15: a draggable minimized status window and retained v3.14 features.
  assert.match(source, /AutoDelete <span class="version">v3\.20<\/span>/);
  assert.match(source, /<details class="diagnostics" id="ad-diagnostics">/,
    "Safety and activity live in a native collapsed disclosure");
  assert.match(source, /<summary>Diagnostics<\/summary>/,
    "Disclosure retains diagnostic access without long explanatory copy");
  assert.doesNotMatch(source, /class="diag-warning"|class="diag-metrics"|id="ad-warning"/,
    "The two user-selected explanatory text blocks are absent from the UI");
  assert.doesNotMatch(source, /<strong>Unofficial account automation\.<\/strong>/,
    "Large account-risk explanation is no longer rendered in the panel");
  assert.doesNotMatch(source, /Timed Discord messages|id="ad-help"|el\("ad-help"\)/,
    "Header subtitle and '?' help button must be absent");
  assert.match(source, /<summary>Diagnostics<\/summary>/,
    "Footer still exposes diagnostics");
  assert.match(source, /<span>Deleted<\/span>/,
    "A successful deletion must be observed, not assumed from an attempt");
  assert.doesNotMatch(source, /<span>Errors<\/span>|id="ad-failed"|id="ad-mini-errors"/,
    "Errors appear in Diagnostics logs, not as standalone stat cards");
  assert.doesNotMatch(source, /<span>Attempts<\/span>|<span>Caught<\/span>/,
    "Obsolete counter labels are removed");
  assert.match(source, /Deletion events observed after an AutoDelete attempt/,
    "Deleted title is honest about event observations");
  assert.match(source, /notify\("Caught delete error:/,
    "Deletion errors are logged in Diagnostics");
  assert.match(source, /state\.recent\.slice\(0, 18\)/,
    "Diagnostics retains more log entries, including recent errors");
  assert.match(source, /backdrop-filter:blur\(28px\) saturate\(165%\)/,
    "Subtle glass effect is applied to the overall panel");
  assert.match(source, /background:radial-gradient/,
    "Panel has quiet ambient futuristic lighting");
  assert.match(source, /\.panel\.is-active\{[^"\n]*#90ffd18f/,
    "Active glass shell changes to green");
  assert.match(source, /\.panel\{[^"\n]*#d6e0ff5e/,
    "Idle glass shell has a cool translucent stroke");
  assert.match(source, /\.stat svg,\.stat img,\.stat i\{display:none!important\}/,
    "Icons are suppressed in all stat cards");
  assert.match(source, /\.stat strong\{font-size:23px/,
    "Stat numbers are larger and centered without icons");
  assert.doesNotMatch(source, /<span class="hint">1s–24h<\/span>/,
    "Range helper removed per design");
  assert.doesNotMatch(source, /Your messages only/, "Scope helper removed");
  assert.match(source, /by Archivarius/, "Author credit");
  assert.doesNotMatch(source, /id="ad-countdowns"|function renderCountdowns|ACTIVITY LOG|No message text stored/,
    "No timer list or redundant log heading in Diagnostics");
  assert.match(source, /function renderInlineTimers\(\)/, "Countdowns now live beside messages");
  assert.doesNotMatch(source, /<div class="stat[^"]*"[^>]*><(?:svg|img|i)[\s>]/,
    "Stats markup remains icon-free");
  assert.match(source, /\.scope-switch\{[^"\n]*border:1px solid/,
    "Scope segmented control uses one connected capsule");

  assert.doesNotMatch(source, /<p class="desc">/,
    "Long explanatory paragraphs removed from main panel");
  assert.doesNotMatch(source, /<div class="hint" style="text-align:center;margin-top:6px/,
    "Technical metrics note removed from compact panel");
  assert.match(source, /id="ad-error" role="alert"/,
    "Module-discovery errors remain visible outside disclosure");
  assert.match(source, /id="ad-limited"/,
    "Cache-only monitoring limitations must remain visible");
  assert.equal(e.ids.get("ad-diagnostics").open, true,
    "Diagnostics remain available after opening a fully minimized overlay");
  api.openDiagnostics();
  const diag = e.ids.get("ad-diagnostics");
  assert.equal(diag.open, true, "Console command still reveals diagnostics");
  diag.open = false;
  api.openDiagnostics();
  assert.equal(diag.open, true, "Diagnostics still accessible without header help button");
  assert.equal(api.connected, true, "Find real runtime and named exports");
  assert.equal(api.running, false, "Never start deletion automatically");
  assert.match(source, /id="ad-panel"/, "Panel is available for theme state");
  assert.doesNotMatch(source, /id="ad-state"|id="ad-dot"|id="ad-next"/,
    "Redundant status row and empty queue text are gone");
  assert.doesNotMatch(source, /<select id="ad-scope">/,
    "Native select replaced with two independently toggleable buttons");
  assert.doesNotMatch(source, /data-scope="all"|>Everywhere<\/button>/, "No Everywhere button");
  assert.match(source, /id="ad-exclude-search"/, "Search field exists");
  assert.match(source, /id="ad-diag-resize"/, "Bottom-edge resize grip exists");
  assert.ok(source.indexOf('id="ad-diag-resize"') > source.indexOf('id="ad-retry-foot"'),
    "Resize grip is positioned after Reconnect modules on the bottom border");
  assert.doesNotMatch(source, /class="diag-resizer"/,
    "Old internal green divider is not rendered");
  assert.match(source, /class="scope-switch" role="group"/,
    "Scope segmented control remains labelled");
  const toggleIndex = source.indexOf('id="ad-toggle"');
  const scopeIndex = source.indexOf('id="ad-scope-label"');
  const dmIndex = source.indexOf('id="ad-dm-block"');
  const serverIndex = source.indexOf('id="ad-server-block"');
  const statIndex = source.indexOf('id="ad-pending"');
  assert.ok(toggleIndex > 0 && toggleIndex < scopeIndex &&
    scopeIndex < dmIndex && dmIndex < serverIndex && serverIndex < statIndex,
    "UI order: Enable/Disable → Where to delete → DMs → Servers → Counters");
  const dmBlock = e.ids.get("ad-dm-block");
  const serverBlock = e.ids.get("ad-server-block");
  assert.match(source, /\.delay\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/,
    "DM and server delays use equal-width custom and exclusion controls");
  assert.match(source, /\.statrow\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
    "Only Queued and Deleted share equal-width stat cards");
  assert.match(source, /\.mini-stats\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
    "Minimized status retains two aligned counters");
  assert.doesNotMatch(source, /data-delay-for=|class="presets"|>60s<\/button>/,
    "There are no fixed-delay preset buttons");
  for (const kind of ["dm", "servers"]) {
    assert.match(source, new RegExp('id="ad-exclude-' + kind + '"'),
      "Exclusion picker remains for " + kind);
  }
  assert.equal(dmBlock.style.display, "", "Everywhere shows DM timing");
  assert.equal(serverBlock.style.display, "", "Everywhere shows server timing");
  assert.equal(e.ids.get("ad-toggle").textContent, "Enable",
    "Paused primary control uses one-word label");
  assert.match(e.ids.get("ad-toggle").getAttribute("title"), /Enable auto-delete/);
  const panel = e.ids.get("ad-panel");
  assert.ok(!panel.classList.contains("is-active"), "Default paused panel stays black");
  assert.ok(!panel.classList.contains("is-error"), "No false error glow");
  const scope = e.scopeButtons;
  assert.equal(scope.length, 2);
  assert.deepEqual(scope.map(btn => btn.getAttribute("aria-pressed")), ["true", "true"]);
  scope[0].dispatch("click");
  assert.equal(api.status().scope, "dm", "Servers toggles off");
  assert.deepEqual(scope.map(btn => btn.getAttribute("aria-pressed")), ["false", "true"]);
  assert.equal(serverBlock.style.display, "", "Server settings remain visible");
  scope[1].dispatch("click");
  assert.equal(api.status().scope, "dm", "Cannot disable final selected source");
  scope[0].dispatch("click");
  assert.equal(api.status().scope, "all", "Both areas can be active together");
  scope[1].dispatch("click");
  assert.equal(api.status().scope, "servers", "DM toggles off");
  assert.equal(dmBlock.style.display, "", "DM settings remain visible");
  scope[1].dispatch("click");
  assert.equal(api.status().scope, "all", "DM toggles back on");
  assert.match(source, /\.panel\.is-active\{[^"\n]*--ad-accent:#35c878/,
    "Active state uses green tokens, not an always-green palette");
  assert.match(source, /\.panel\.is-active \.primary\{/,
    "Enabled button is highlighted green");
  assert.match(source, /\.panel\.is-active \.scope-btn\.selected\{/,
    "Selected scope becomes green while monitoring is active");

  assert.ok(e.ids.get("ad-toggle"), "Dashboard renders without warning text blocks");

  assert.equal(api.resume(), true);
  e.ids.get("ad-min").dispatch("click");
  assert.equal(e.ids.get("ad-mini-panel").hidden, false, "Active monitoring switches to compact status");
  assert.equal(e.ids.get("ad-mini-panel").classList.contains("is-active"), true,
    "Compact status retains green active styling");
  assert.equal(api.running, true, "Minimize never stops running auto-delete");
  e.post("999999999999999995");
  assert.equal(api.status().pending, 1,
    "Minimized overlay continues to queue confirmed own messages");
  assert.equal(e.ids.get("ad-mini-queued").textContent, 1,
    "Mini Queued counter updates while minimized");
  assert.equal(e.ids.get("ad-mini-deleted").textContent, 0);
  api.open();
  assert.equal(e.ids.get("ad-panel").style.display, "",
    "Restored overlay retains monitoring state");
  await e.flushTimers();
  assert.deepEqual(e.deletions,
    [["444444444444444444", "999999999999999995"]],
    "Queued message is processed while overlay has been minimized");
  assert.equal(e.ids.get("ad-mini-queued").textContent, 0, "Mini Queued updates after timer completes");
  assert.ok(panel.classList.contains("is-active"),
    "Resume enables green theme across the panel");
  assert.equal(e.ids.get("ad-toggle").textContent, "Disable",
    "Primary button communicates active state without status row");
  e.post("555555555555555555", "999999999999999999");
  assert.equal(api.status().pending, 0, "Ignore other people");
  e.post("555555555555555555");
  e.post("555555555555555555");
  assert.equal(api.status().pending, 1, "Deduplicate events");
  await e.flushTimers();
  assert.deepEqual(e.deletions, [
    ["444444444444444444", "999999999999999995"],
    ["444444444444444444", "555555555555555555"]
  ], "Own message deleted once in addition to the hidden-window test");

  api.setDelay(30);
  api.setScope("dm");
  assert.equal(dmBlock.style.display, "", "Programmatic setScope shows relevant DM control");
  assert.equal(serverBlock.style.display, "", "Both settings stay editable under DM scope");
  api.setDmDelay(45);
  assert.equal(api.status().serverDelaySeconds, 30, "Hidden server delay retains its own value");
  assert.equal(api.status().dmDelaySeconds, 45, "DM delay remains independently editable");
  api.setDmDelay(30);
  assert.equal(api.status().serverDelaySeconds, 30);
  assert.equal(api.status().dmDelaySeconds, 30);
  e.post("666666666666666666", e.account.id, "444444444444444444");
  assert.equal(api.status().pending, 0, "Skip server message under DM scope");
  e.post("777777777777777777", e.account.id, "333333333333333333");
  assert.equal(api.status().pending, 1, "DM message queued");
  assert.equal([...e.timers.values()][0].ms, 30000);
  api.pause();
  assert.ok(!panel.classList.contains("is-active"),
    "Pause restores neutral black palette");
  assert.equal(e.ids.get("ad-toggle").textContent, "Enable");
  assert.equal(api.status().pending, 0);
  assert.equal(e.timers.size, 0, "Pause cancels timers");

  api.setScope("all");
  api.resume();
  e.post("888888888888888888");
  e.account.id = "999999999999999999"; // account switch
  await e.flushTimers();
  assert.equal(e.deletions.length, 2, "Account switch must skip deletion");
  assert.equal(api.status().skipped, 2, "Counts scope skip and account switch");

  api.stop();
  assert.equal(e.window.DiscordAutoDelete, undefined, "Stop clears controller");
  // v3.7 — DM-first and manual custom entries must survive the 500ms UI
  // refresh. The fake ShadowRoot deliberately has no activeElement, so a
  // focus-only check would overwrite digits while they are being typed.
  assert.ok(source.indexOf('<label for="ad-dm-delay">') <
    source.indexOf('<label for="ad-server-delay">'),
    "DM control is rendered above Servers control");
  assert.match(source, /id="ad-dm-delay" type="text" inputmode="numeric"/);
  assert.match(source, /id="ad-server-delay" type="text" inputmode="numeric"/);
  const typing = createEnvironment();
  vm.runInContext(source, typing.context, { timeout: 3000 });
  const manual = typing.window.DiscordAutoDelete;
  const dmInput = typing.ids.get("ad-dm-delay");
  const serverInput = typing.ids.get("ad-server-delay");
  assert.equal(dmInput.value, "10");
  assert.equal(serverInput.value, "10");
  dmInput.focus();
  dmInput.value = "";
  dmInput.dispatch("input", { target: dmInput });
  typing.tick();
  assert.equal(dmInput.value, "", "Empty intermediate edit is not overwritten by render");
  dmInput.value = "1";
  dmInput.dispatch("input", { target: dmInput });
  typing.tick();
  assert.equal(dmInput.value, "1", "Partial value may be below min while typing");
  dmInput.value = "125";
  dmInput.dispatch("input", { target: dmInput });
  typing.tick();
  assert.equal(dmInput.value, "125", "Completed entry survives periodic render");
  assert.equal(manual.status().dmDelaySeconds, 10,
    "Delay is not saved prematurely before Enter/blur");
  let stopCalled = false;
  dmInput.dispatch("keydown", {
    key: "2",
    stopPropagation() { stopCalled = true; }
  });
  assert.equal(stopCalled, true, "Typing is isolated from Discord global keyboard shortcuts");
  dmInput.dispatch("keydown", {
    key: "Enter",
    stopPropagation() {}, preventDefault() {}
  });
  assert.equal(manual.status().dmDelaySeconds, 125, "Enter commits custom DM seconds");
  assert.equal(manual.status().serverDelaySeconds, 10,
    "Editing the DM field does not affect Servers");
  serverInput.focus();
  serverInput.value = "45";
  serverInput.dispatch("input", { target: serverInput });
  typing.tick();
  assert.equal(serverInput.value, "45", "Server edit survives periodic rerenders");
  serverInput.blur();
  assert.equal(manual.status().serverDelaySeconds, 45,
    "Clicking outside commits custom Server seconds");
  dmInput.focus();
  dmInput.value = "0";
  dmInput.dispatch("input", { target: dmInput });
  typing.tick();
  assert.equal(dmInput.value, "0", "Invalid interim values remain editable until commit");
  dmInput.blur();
  assert.equal(dmInput.value, "125", "Invalid input restores previously saved value");
  assert.equal(manual.status().dmDelaySeconds, 125);
  dmInput.focus();
  dmInput.value = "888";
  dmInput.dispatch("input", { target: dmInput });
  dmInput.dispatch("keydown", {
    key: "Escape", stopPropagation() {}, preventDefault() {}
  });
  assert.equal(dmInput.value, "125", "Escape restores saved setting");
  assert.equal(manual.status().dmDelaySeconds, 125, "Escape does not save the draft");
  assert.equal(JSON.parse(typing.stored.get("discord-autodelete-ui-v2")).dmDelay, 125);
  manual.stop();

  // A real timer is scheduled for 1000ms when one second is chosen.
  const quick = createEnvironment();
  vm.runInContext(source, quick.context, { timeout: 3000 });
  const quickApi = quick.window.DiscordAutoDelete;
  quickApi.setDmDelay(1);
  quickApi.setServerDelay(1);
  quickApi.resume();
  quick.post("555555555555555555");
  quick.post("666666666666666666", quick.account.id, "333333333333333333");
  const quickWaits = [...quick.timers.values()].map(t => t.ms);
  assert.ok(quickWaits[0] >= 1000 && quickWaits[0] < 1050 && quickWaits[1] - quickWaits[0] >= 1300,
    "One-second minimum delay is preserved while overlapping deletions are paced");
  quickApi.pause(); // No HTTP calls needed for this timing test.
  assert.equal(quickApi.status().pending, 0);
  quickApi.stop();

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
  assert.equal(dual.setDmDelay(1), 1, "One second is now valid");
  assert.equal(dual.setServerDelay(1), 1, "One-second server delay is valid");
  dual.setServerDelay(5);
  dual.setDmDelay(60);
  assert.throws(() => dual.setDmDelay(0), /Delay must be an integer/, "Reject zero-second delay");
  assert.throws(() => dual.setServerDelay(86401), /Delay must be an integer/, "Reject too-long server delay");
  assert.equal(dual.resume(), true);
  splitDelays.post("555555555555555555"); // Server
  splitDelays.post("666666666666666666", splitDelays.account.id, "333333333333333333"); // 1:1 DM
  splitDelays.post("777777777777777777", splitDelays.account.id, "888888888888888888"); // Group DM, type 3
  assert.equal(dual.status().pending, 3);
  const splitWaits = [...splitDelays.timers.values()].map(t => t.ms);
  assert.ok(splitWaits[0] >= 5000 && splitWaits[0] < 5050 &&
    splitWaits[1] >= 60000 && splitWaits[2] - splitWaits[1] >= 1300,
    "Distinct delays are retained and simultaneous DM expirations are paced");
  // Changing a delay must not alter the scheduled timers.
  dual.setServerDelay(30);
  assert.deepEqual([...splitDelays.timers.values()].map(t => t.ms), splitWaits,
    "Old pending deadlines remain intact after changing a setting");
  const settingsStored = JSON.parse(splitDelays.stored.get("discord-autodelete-ui-v2"));
  assert.equal(settingsStored.serverDelay, 30);
  assert.equal(settingsStored.dmDelay, 60);
  // Custom values stay independent even though the fixed 60s shortcuts are gone.
  assert.equal(dual.status().serverDelaySeconds, 30);
  assert.equal(dual.status().dmDelaySeconds, 60);
  assert.equal(splitDelays.timers.size, 3, "Editing custom delay does not cancel earlier jobs");
  dual.pause();
  assert.equal(dual.status().pending, 0);
  dual.stop();

  // Simulate reloading with already persisted settings.
  const persisted = createEnvironment({ initialStorage: [
    ["discord-autodelete-ui-v2", splitDelays.stored.get("discord-autodelete-ui-v2")]
  ] });
  vm.runInContext(source, persisted.context, { timeout: 3000 });
  const afterReload = persisted.window.DiscordAutoDelete;
  assert.equal(afterReload.status().serverDelaySeconds, 30);
  assert.equal(afterReload.status().dmDelaySeconds, 60);
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

  // Inline message clocks: own messages only, per-kind delays, cancel and remount.
  const inlineEnv = createEnvironment();
  vm.runInContext(source, inlineEnv.context, { timeout: 3000 });
  const inlineApi = inlineEnv.window.DiscordAutoDelete;
  inlineApi.setServerDelay(8);
  inlineApi.setDmDelay(12);
  const visibleServer = inlineEnv.showMessage("911111111111111111");
  const visibleDm = inlineEnv.showMessage("922222222222222222");
  const visibleForeign = inlineEnv.showMessage("933333333333333333");
  inlineApi.resume();
  inlineEnv.post("911111111111111111");
  inlineEnv.post("922222222222222222", inlineEnv.account.id, "333333333333333333");
  inlineEnv.post("933333333333333333", "999999999999999999");
  assert.equal(visibleServer.children.length, 1, "Visible own server message gets timer");
  assert.equal(visibleDm.children.length, 1, "Visible own DM gets timer");
  assert.equal(visibleForeign.children.length, 0, "Other people's messages never get timers");
  assert.match(visibleServer.children[0].textContent, /⏱ 8s/, "Server delay");
  assert.match(visibleDm.children[0].textContent, /⏱ 12s/, "DM delay");
  assert.match(visibleServer.children[0].title, /not guaranteed/, "Timer means attempt, not confirmation");
  const formerDmBadge = visibleDm.children[0];
  inlineApi.excludeDm("333333333333333333");
  assert.equal(formerDmBadge.removed, true, "Exclude cancels and removes DM badge");
  const formerServerBadge = visibleServer.children[0];
  inlineEnv.hideMessage("911111111111111111");
  inlineEnv.tick();
  assert.equal(formerServerBadge.removed, true, "Recycling DOM releases badges");
  const remounted = inlineEnv.showMessage("911111111111111111");
  inlineEnv.tick();
  assert.equal(remounted.children.length, 1, "Returning to message restores countdown");
  inlineApi.pause();
  assert.equal(remounted.children[0].removed, true, "Disable clears all message countdowns");
  assert.equal(inlineApi.status().pending, 0);
  inlineApi.stop();

  // v3.14 exclusion rules apply to existing and future jobs.
  const ex = createEnvironment();
  vm.runInContext(source, ex.context, { timeout: 3000 });
  const protectedApi = ex.window.DiscordAutoDelete;
  protectedApi.resume();
  ex.post("555555555555555555", ex.account.id, "333333333333333333");
  ex.post("666666666666666666");
  assert.equal(protectedApi.status().pending, 2);
  protectedApi.excludeDm("333333333333333333");
  assert.equal(protectedApi.status().pending, 1, "DM exclusion cancels queued DM timer");
  protectedApi.excludeServer("222222222222222222");
  assert.equal(protectedApi.status().pending, 0, "Server exclusion cancels queued server timer");
  ex.post("777777777777777777", ex.account.id, "333333333333333333");
  ex.post("888888888888888888");
  assert.equal(protectedApi.status().pending, 0, "Exclude future messages");
  assert.equal(protectedApi.status().excludedDms, 1);
  assert.equal(protectedApi.status().excludedServers, 1);
  protectedApi.excludeDm("333333333333333333", false);
  protectedApi.excludeServer("222222222222222222", false);
  ex.post("999999999999999991", ex.account.id, "333333333333333333");
  ex.post("999999999999999992");
  assert.equal(protectedApi.status().pending, 2, "Removing exclusions restores monitoring");
  assert.throws(() => protectedApi.excludeDm("bogus"), /valid Discord/);
  await ex.flushTimers();
  assert.equal(protectedApi.status().requests, 2);
  assert.equal(protectedApi.status().deleted, 0, "Calls alone must never imply observed deletion");
  ex.emitDelete("999999999999999991");
  ex.emitDelete("999999999999999991");
  ex.emitDelete("999999999999999992");
  ex.emitDelete("999999999999999993");
  assert.equal(protectedApi.status().deleted, 2, "Count two matching observed deletes, never duplicates or others");
  assert.equal(ex.ids.get("ad-deleted").textContent, 2);
  assert.equal(ex.ids.get("ad-mini-deleted").textContent, 2, "Mini Deleted updates for observed events");
  protectedApi.stop();

  // Click the actual new selector to exclude the currently open server.
  const pickerEnv = createEnvironment({ withMessageStore: true });
  vm.runInContext(source, pickerEnv.context, { timeout: 3000 });
  pickerEnv.ids.get("ad-exclude-servers").dispatch("click");
  assert.equal(pickerEnv.ids.get("ad-picker").hidden, false, "Server picker opens");
  pickerEnv.ids.get("ad-exclude-current").dispatch("click");
  assert.equal(pickerEnv.window.DiscordAutoDelete.status().excludedServers, 1);
  pickerEnv.ids.get("ad-exclude-servers").dispatch("click");
  assert.equal(pickerEnv.ids.get("ad-picker").hidden, true, "Server picker closes");
  pickerEnv.window.DiscordAutoDelete.stop();

  // Only open DM channels appear; username lookup and filtering use real IDs.
  const pickerNames = createEnvironment({ withPrivateList: true });
  vm.runInContext(source, pickerNames.context, { timeout: 3000 });
  pickerNames.ids.get("ad-exclude-dm").dispatch("click");
  const list = pickerNames.ids.get("ad-picker-list");
  assert.equal(list.children.length, 2, "Opened DMs, not whole historical cache");
  assert.match(list.children.map(row => row.children[1]?.textContent).join("|"), /Robert \(@robertk\)/);
  assert.doesNotMatch(list.children.map(row => row.title).join("|"), /777777777777777777/,
    "Stale private DM does not appear");
  const search = pickerNames.ids.get("ad-exclude-search");
  search.value = "rober";
  search.dispatch("input");
  assert.equal(list.children.length, 1, "Search filters by username");
  assert.match(list.children[0].children[1].textContent, /robertk/);
  let stopped = 0, prevented = 0;
  search.dispatch("keydown", { key: "Backspace", stopPropagation() { stopped++; },
    preventDefault() { prevented++; } });
  const manualIdInput = pickerNames.ids.get("ad-exclude-id");
  manualIdInput.value = "111111111111111111";
  manualIdInput.dispatch("keydown", { key: "Backspace", stopPropagation() { stopped++; },
    preventDefault() { prevented++; } });
  assert.equal(stopped, 2, "Discord shortcut handling stopped in both fields");
  assert.equal(prevented, 0, "Backspace remains editable");
  pickerNames.ids.get("ad-add-exclude").dispatch("click");
  assert.equal(pickerNames.window.DiscordAutoDelete.status().excludedDms, 1,
    "Existing recipient user ID resolves to the DM channel");
  pickerNames.window.DiscordAutoDelete.stop();

  // Diagnostics expands from its bottom border and remembers the height.
  const resizeEnv = createEnvironment();
  vm.runInContext(source, resizeEnv.context, { timeout: 3000 });
  const handle = resizeEnv.ids.get("ad-diag-resize");
  const logView = resizeEnv.ids.get("ad-logs");
  assert.equal(logView.style.height, "170px");
  handle.dispatch("pointerdown", { clientY: 200, button: 0, preventDefault() {}, stopPropagation() {} });
  resizeEnv.documentDispatch("pointermove", { clientX: 0, clientY: 288 });
  assert.equal(logView.style.height, "270px", "Dragging down grows log area");
  resizeEnv.documentDispatch("pointerup", {});
  assert.equal(JSON.parse(resizeEnv.stored.get("discord-autodelete-ui-v2")).diagnosticsHeight, 270);
  handle.dispatch("keydown", { key: "ArrowUp", preventDefault() {}, stopPropagation() {} });
  assert.equal(logView.style.height, "246px", "Arrow keys also resize");
  // The border cannot grow beyond the viewport; this limit stays fixed
  // for the entire pointer drag instead of jumping as the panel grows.
  const limitedRect = resizeEnv.ids.get("ad-panel");
  limitedRect.getBoundingClientRect = () => ({ bottom: 870 });
  handle.dispatch("pointerdown", { clientY: 100, button: 0, preventDefault() {}, stopPropagation() {} });
  resizeEnv.documentDispatch("pointermove", { clientY: 400 });
  assert.equal(logView.style.height, "271px", "Drag growth stops at available viewport edge");
  resizeEnv.documentDispatch("pointermove", { clientY: 425 });
  assert.equal(logView.style.height, "271px", "Viewport limit does not oscillate while dragging");
  resizeEnv.documentDispatch("pointerup", {});
  resizeEnv.window.DiscordAutoDelete.stop();


  // Client timestamp formats: seconds, numeric strings, Date/Moment
  // objects, and a recent snowflake fallback must all allow NEW messages.
  const variants = createEnvironment();
  vm.runInContext(source, variants.context, { timeout: 3000 });
  const variantsApi = variants.window.DiscordAutoDelete;
  variantsApi.resume();
  const newSnowflake = i => String((BigInt(Date.now() - 1420070400000) << 22n) + BigInt(i));
  const timestamps = [
    Math.floor(Date.now() / 1000),
    String(Math.floor(Date.now() / 1000)),
    { valueOf() { return Date.now(); }, toString() { return "not ISO"; } },
    new Date(),
    "not-a-date"
  ];
  for (let i = 0; i < timestamps.length; i++) {
    variants.emit({ id: newSnowflake(i + 1), timestamp: timestamps[i],
      author: { id: variants.account.id }, channel_id: "444444444444444444",
      guild_id: "222222222222222222", state: "SENT" });
    assert.equal(variantsApi.status().pending, i + 1,
      "New messages with supported timestamp variant " + i + " are queued");
  }
  variants.emit({ id: newSnowflake(100),
    timestamp: Math.floor((Date.now() - 3600_000) / 1000),
    author: { id: variants.account.id }, channel_id: "444444444444444444",
    guild_id: "222222222222222222", state: "SENT" });
  assert.equal(variantsApi.status().pending, timestamps.length,
    "Hour-old messages remain ineligible even when snowflake is recent");
  variantsApi.stop();

  // v3.18-v3.19 regression: the local optimistic SENDING message can
  // lack a server timestamp. It MUST be correlated with a later SENT update.
  const optimistic = createEnvironment({ withMessageStore: true });
  vm.runInContext(source, optimistic.context, { timeout: 3000 });
  const optimisticApi = optimistic.window.DiscordAutoDelete;
  optimisticApi.resume();
  const tx = "700000000000001111", sentId = "700000000000001112";
  const outgoing = { author: { id: optimistic.account.id }, channel_id: "444444444444444444",
    guild_id: "222222222222222222", nonce: tx };
  optimistic.emit({ ...outgoing, id: tx, state: "SENDING", timestamp: "invalid",
    optimistic: true }, { optimistic: true });
  assert.equal(optimisticApi.status().pending, 0, "Optimistic message is never deleted before confirmation");
  assert.equal(optimisticApi.status().provisionalEvents, 1,
    "Provisional send is still remembered with malformed timestamp");
  optimistic.emitUpdate({ ...outgoing, id: sentId, state: "SENT", timestamp: new Date().toISOString(),
    optimistic: false }, { optimistic: false });
  assert.equal(optimisticApi.status().pending, 1,
    "Confirmed send is recovered from its provisional nonce");
  assert.equal(optimisticApi.status().confirmedScheduled, 1);
  assert.equal(optimisticApi.status().requests, 0, "No deletion attempt occurs before the delay");
  assert.ok([...optimistic.timers.values()][0].ms >= 10000, "10s minimum delay is honored");
  optimisticApi.stop();

  // First visit to a server after enabling: recent own messages arriving before
  // the first cache poll are valid, while historical messages remain ineligible.
  const firstVisit = createEnvironment({ withoutDispatcher: true, withMessageStore: true, withRestOnly: true });
  vm.runInContext(source, firstVisit.context, { timeout: 3000 });
  const firstApi = firstVisit.window.DiscordAutoDelete;
  firstApi.resume();
  const historical = { id: "700000000000001210",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    author: { id: firstVisit.account.id },
    channel_id: "555555555555555555", guild_id: "222222222222222222", state: "SENT" };
  const justSent = { ...historical, id: "700000000000001211", timestamp: new Date().toISOString() };
  firstVisit.selectChannel("555555555555555555");
  firstVisit.cached.push(historical, justSent);
  firstVisit.tick();
  assert.equal(firstApi.status().pending, 1, "Fresh message is recovered on first cache observation");
  assert.ok(firstApi.status().ageRejected >= 1, "Historical message is rejected based on creation time");
  firstApi.stop();

  // Safety regression: old messages must NEVER be eligible just because
  // channel switch/history hydration makes them visible in cache.
  const history = createEnvironment({ withoutDispatcher: true, withMessageStore: true, withRestOnly: true });
  vm.runInContext(source, history.context, { timeout: 3000 });
  const historyApi = history.window.DiscordAutoDelete;
  historyApi.resume();
  const oldTimestamp = new Date(Date.now() - 3600_000).toISOString();
  const ownOld = id => ({ id, timestamp: oldTimestamp,
    author: { id: history.account.id }, channel_id: "555555555555555555",
    guild_id: "222222222222222222", state: "SENT" });
  history.selectChannel("555555555555555555");
  history.cached.push(ownOld("666666666666666661"));
  history.tick(); // First view establishes a baseline.
  history.cached.push(ownOld("666666666666666662"));
  history.tick(); // Delayed history hydration must not be scheduled.
  assert.equal(historyApi.status().pending, 0, "Old history never enters pending queue");
  assert.equal(history.timers.size, 0, "No deletion timers are created for backfilled history");
  const currentFreshId = "666666666666666663";
  history.cached.push({ ...ownOld(currentFreshId), timestamp: new Date().toISOString() });
  history.tick();
  assert.equal(historyApi.status().pending, 1, "New cache message after baseline is detected");
  historyApi.pause();
  assert.equal(historyApi.status().pending, 0);
  historyApi.stop();

  // Dispatcher history replay is rejected too; this covers events in addition
  // to cache polling, and a live send remains eligible.
  const older = createEnvironment();
  vm.runInContext(source, older.context, { timeout: 3000 });
  const olderApi = older.window.DiscordAutoDelete;
  olderApi.resume();
  older.emit({ id: "666666666666666664", timestamp: oldTimestamp,
    author: { id: older.account.id }, channel_id: "444444444444444444",
    guild_id: "222222222222222222", state: "SENT" });
  assert.equal(olderApi.status().pending, 0, "Historical create event is rejected");
  older.post("666666666666666665");
  assert.equal(olderApi.status().pending, 1, "New own message still gets scheduled");
  olderApi.stop();

  // Flood regression: the original code would fire DELETEs simultaneously.
  // Every confirmed own message should be queued exactly once with paced slots.
  const burst = createEnvironment();
  vm.runInContext(source, burst.context, { timeout: 3000 });
  const burstApi = burst.window.DiscordAutoDelete;
  burstApi.setServerDelay(4);
  burstApi.resume();
  const burstIds = Array.from({ length: 24 }, (_, i) => String(700000000000000000n + BigInt(i)));
  burstIds.forEach(id => burst.post(id));
  assert.equal(burstApi.status().pending, 24, "All 24 own sends enter the queue");
  const slots = [...burst.timers.values()].map(v => v.ms);
  assert.equal(slots.length, 24);
  assert.ok(slots[0] >= 4000);
  for (let i = 1; i < slots.length; i++) {
    assert.ok(slots[i] - slots[i - 1] >= 1300,
      "Adjacent deletion slots must not collide under a rapid burst");
  }
  await burst.flushTimers();
  assert.equal(burst.deletions.length, 24, "Every burst message gets one delete attempt");
  assert.equal(new Set(burst.deletions.map(entry => entry[1])).size, 24);
  assert.equal(burstApi.status().pending, 0);
  assert.equal(burstApi.status().requests, 24);
  burstApi.stop();

  // A reported 429 keeps its message queued and honors a delay before retrying.
  const limited = createEnvironment({ withRestOnly: true, rateLimitOnce: true });
  vm.runInContext(source, limited.context, { timeout: 3000 });
  const limitedApi = limited.window.DiscordAutoDelete;
  limitedApi.resume();
  limited.post("700000000000000100");
  await limited.flushTimers();
  assert.equal(limitedApi.status().pending, 1, "A 429 must not discard pending deletion");
  assert.equal(limited.restURLs.length, 1);
  assert.equal(limited.timers.size, 1, "A bounded rate-limit retry is scheduled");
  assert.ok([...limited.timers.values()][0].ms >= 1500, "Rate-limit wait is respected");
  await limited.flushTimers();
  assert.equal(limitedApi.status().pending, 0);
  assert.equal(limitedApi.status().requests, 2, "Retry is included in attempt count");
  assert.equal(limitedApi.status().failed, 0, "Recovered 429 is not a permanent error");
  limitedApi.stop();

  // Rapid optimistic -> confirmed transitions via MESSAGE_UPDATE are eligible,
  // but an unrelated historical edit is not.
  const updates = createEnvironment({ withMessageStore: true });
  vm.runInContext(source, updates.context, { timeout: 3000 });
  const updateApi = updates.window.DiscordAutoDelete;
  updateApi.resume();
  const draftNonce = "700000000000000201", finalId = "700000000000000202";
  const own = { author: { id: updates.account.id }, channel_id: "444444444444444444",
    guild_id: "222222222222222222", nonce: draftNonce };
  updates.emit({ ...own, id: draftNonce, state: "SENDING", optimistic: true }, { optimistic: true });
  assert.equal(updateApi.status().pending, 0);
  updates.emitUpdate({ ...own, id: finalId, state: "SENT", optimistic: false }, { optimistic: false });
  updates.emitUpdate({ ...own, id: finalId, state: "SENT", optimistic: false }, { optimistic: false });
  assert.equal(updateApi.status().pending, 1,
    "Acknowledged rapid send via MESSAGE_UPDATE is queued once");
  updates.emitUpdate({ ...own, id: "700000000000000299", nonce: "700000000000000298",
    state: "SENT", optimistic: false }, { optimistic: false });
  assert.equal(updateApi.status().pending, 1, "Unrelated edits are never scheduled");
  await updates.flushTimers();
  assert.deepEqual(updates.deletions, [["444444444444444444", finalId]]);
  updateApi.stop();

  // Exclusions are persistent, but deletion is always disabled after reload.
  const remembered = createEnvironment({ initialStorage: [
    ["discord-autodelete-ui-v2", JSON.stringify({
      scope: "all", excludedDms: ["333333333333333333"],
      excludedGuilds: ["222222222222222222"]
    })]
  ] });
  vm.runInContext(source, remembered.context, { timeout: 3000 });
  assert.equal(remembered.window.DiscordAutoDelete.status().excludedDms, 1);
  assert.equal(remembered.window.DiscordAutoDelete.status().excludedServers, 1);
  assert.equal(remembered.window.DiscordAutoDelete.running, false);
  remembered.window.DiscordAutoDelete.stop();

  console.log("PASS: v3.15 draggable compact live stats, restore behavior, exclusions and prior regressions");
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
