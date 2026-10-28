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
    append() {}, appendChild() {}, replaceChildren() {},
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    remove() { this.removed = true; },
    attachShadow() { return shadow; }
  };
}

let shadow;
function createEnvironment(options = {}) {
  const ids = new Map();
  let overlayHost = null;
  const presets = ["servers", "dm"].flatMap(kind =>
    ["60"].map(delay => {
      const e = fakeElement();
      e.dataset.delay = delay;
      e.dataset.delayFor = kind;
      return e;
    })
  );
  const scopeButtons = ["all", "servers", "dm"].map(scope => {
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
      if (selector === "[data-delay-for]") return presets;
      if (selector === "[data-scope]") return scopeButtons;
      throw new Error("Unexpected selector: " + selector);
    },
    appendChild() {},
  };
  const documentEvents = new Map();
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
    addEventListener(type, fn) { documentEvents.set(type, fn); },
    removeEventListener(type) { documentEvents.delete(type); }
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
      if (id === "888888888888888888") return { id, type: 3 };
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
    context, window, document, ids, get overlayHost() { return overlayHost; }, presets, localStorage, account,
    post, emit: (message, extra = {}) => dispatcher.dispatch({ type: "MESSAGE_CREATE", message, ...extra }),
    emitDelete: id => dispatcher.dispatch({ type: "MESSAGE_DELETE", id }),
    flushTimers, timers, deletions, calls, cached, restURLs, stored, presets, scopeButtons,
    proxyReads, tick: () => interval(), documentDispatch: (type, event) => documentEvents.get(type)?.(event)
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
    assert.ok(script.includes('".panel{width:392px;max-width:calc(100vw - 24px);'), file + " retains the full panel width");
    assert.ok(script.includes('".mini-panel{position:relative;width:392px;max-width:calc(100vw - 24px);'), file + " matches compact width");
    assert.ok(script.includes("#2d3857a1") && script.includes("#193c3aa3"), file + " softens normal and active full-panel glass");
    assert.ok(script.includes("#273251bd") && script.includes("#1c4943be"), file + " softens normal and active mini glass");
  }
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
  assert.match(source, /AutoDelete <span class="version">v3\.15<\/span>/);
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
  assert.match(source, /<span>Errors<\/span>/,
    "Caught is relabeled Errors");
  assert.doesNotMatch(source, /<span>Attempts<\/span>|<span>Caught<\/span>/,
    "Obsolete counter labels are removed");
  assert.match(source, /Deletion events observed after an AutoDelete attempt/,
    "Deleted title is honest about event observations");
  assert.match(source, /background HTTP failures may not appear/,
    "Errors title explicitly limits what it counts");
  assert.match(source, /backdrop-filter:blur\(28px\) saturate\(165%\)/,
    "Subtle glass effect is applied to the overall panel");
  assert.match(source, /background:radial-gradient/,
    "Panel has quiet ambient futuristic lighting");
  assert.match(source, /\.panel\.is-active\{[^"\n]*#90ffd1b3/,
    "Active glass shell changes to green");
  assert.match(source, /\.panel\{[^"\n]*#d6e0ff75/,
    "Idle glass shell has a cool translucent stroke");
  assert.match(source, /\.stat svg,\.stat img,\.stat i\{display:none!important\}/,
    "Icons are suppressed in all stat cards");
  assert.match(source, /\.stat strong\{font-size:23px/,
    "Stat numbers are larger and centered without icons");
  assert.doesNotMatch(source, /<span class="hint">1s–24h<\/span>/,
    "Range helper removed per design");
  assert.doesNotMatch(source, /Your messages only/, "Scope helper removed");
  assert.match(source, /by Archivarius/, "Author credit");
  assert.match(source, /id="ad-countdowns"/, "Live countdowns");
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
    "Native select replaced with 3 buttons");
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
  assert.match(source, /grid-template-columns:minmax\(0,\.9fr\) minmax\(0,1\.4fr\)/,
    "Delay row reserves more space for exclusions");
  assert.match(source, /\.presets\{display:contents\}/,
    "Preset wrapper does not occupy an extra grid cell");
  for (const kind of ["dm", "servers"]) {
    const renderedPresets = [...source.matchAll(new RegExp('data-delay-for="' + kind + '" data-delay="(\\d+)"', "g"))]
      .map(match => match[1]);
    assert.deepEqual(renderedPresets, ["60"],
      kind + " row has custom delay / exclusions / 60s");
    assert.equal(e.presets.filter(p => p.dataset.delayFor === kind).length, 1,
      "Mock and markup expose only one preset button for " + kind);
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
  assert.equal(scope.length, 3);
  assert.deepEqual(scope.map(btn => btn.getAttribute("aria-pressed")),
    ["true","false","false"], "Everywhere default has a single active scope");
  scope[1].dispatch("click");
  assert.equal(api.status().scope, "servers", "Clicking Servers changes scope");
  assert.equal(dmBlock.style.display, "none", "Servers hides DM timing");
  assert.equal(serverBlock.style.display, "", "Servers shows server timing");
  assert.deepEqual(scope.map(btn => btn.getAttribute("aria-pressed")),
    ["false","true","false"], "Selected scope is visually and accessibly exclusive");
  scope[2].dispatch("click");
  assert.equal(api.status().scope, "dm", "Clicking DMs changes scope");
  assert.equal(dmBlock.style.display, "", "DMs shows DM timing");
  assert.equal(serverBlock.style.display, "none", "DMs hides server timing");
  assert.deepEqual(scope.map(btn => btn.getAttribute("aria-pressed")),
    ["false","false","true"]);
  scope[0].dispatch("click");
  assert.equal(api.status().scope, "all", "Everywhere can be reselected");
  assert.equal(dmBlock.style.display, "", "Everywhere restores DM timing");
  assert.equal(serverBlock.style.display, "", "Everywhere restores server timing");
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
  assert.equal(e.ids.get("ad-mini-errors").textContent, 0);
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
  assert.equal(serverBlock.style.display, "none", "Programmatic setScope hides irrelevant server control");
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
  assert.deepEqual([...quick.timers.values()].map(t => t.ms), [1000, 1000],
    "One-second delays schedule one-second browser timers for both channel types");
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
  assert.deepEqual([...splitDelays.timers.values()].map(t => t.ms), [5000, 60000, 60000],
    "Different timer durations for server and DM messages");
  // Changing a delay must not alter the scheduled timers.
  dual.setServerDelay(30);
  assert.deepEqual([...splitDelays.timers.values()].map(t => t.ms), [5000, 60000, 60000],
    "Old pending deadlines remain intact after changing a setting");
  const settingsStored = JSON.parse(splitDelays.stored.get("discord-autodelete-ui-v2"));
  assert.equal(settingsStored.serverDelay, 30);
  assert.equal(settingsStored.dmDelay, 60);
  const uiServers = splitDelays.presets.find(p => p.dataset.delayFor === "servers" && p.dataset.delay === "60");
  const uiDm = splitDelays.presets.find(p => p.dataset.delayFor === "dm" && p.dataset.delay === "60");
  uiServers.dispatch("click");
  uiDm.dispatch("click");
  assert.equal(dual.status().serverDelaySeconds, 60, "Server 60s preset only changes server delay");
  assert.equal(dual.status().dmDelaySeconds, 60, "DM 60s preset only changes DM delay");
  dual.pause();
  assert.equal(dual.status().pending, 0);
  dual.stop();

  // Simulate reloading with already persisted settings.
  const persisted = createEnvironment({ initialStorage: [
    ["discord-autodelete-ui-v2", splitDelays.stored.get("discord-autodelete-ui-v2")]
  ] });
  vm.runInContext(source, persisted.context, { timeout: 3000 });
  const afterReload = persisted.window.DiscordAutoDelete;
  assert.equal(afterReload.status().serverDelaySeconds, 60);
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
