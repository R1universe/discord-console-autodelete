/**
 * AutoDelete runtime audit — READ ONLY
 * Run in https://discord.com/app Console after reviewing the full script.
 *
 * IMPORTANT: This script cannot and does not delete/edit/send messages.
 * It never accesses an authorization token, message body, storage, or the network.
 * It reports aggregated technical metadata about module exports only.
 */
(() => {
  "use strict";
  if (location.hostname !== "discord.com" &&
      !location.hostname.endsWith(".discord.com")) {
    console.error("[AutoDelete Audit] Open Discord Web first.");
    return;
  }

  const chunks = window.webpackChunkdiscord_app;
  if (!chunks || typeof chunks.push !== "function") {
    console.error("[AutoDelete Audit] Discord's module registry is unavailable.");
    return;
  }
  const reqs = [];
  const marker = Symbol("AutoDeleteAudit");
  try {
    chunks.push([[marker], {}, req => {
      if (req?.c && !reqs.includes(req)) reqs.push(req);
    }]);
    if (chunks.at(-1)?.[0]?.[0] === marker) chunks.pop();
  } catch {
    console.error("[AutoDelete Audit] Cannot inspect Webpack module cache.");
    return;
  }

  const objects = [];
  const known = new WeakSet();
  const runtimeModules = [];
  const remember = (value) => {
    if (!value || (typeof value !== "object" && typeof value !== "function")) return;
    if (known.has(value)) return;
    known.add(value);
    objects.push(value);
  };
  for (const req of reqs) {
    const cache = req.c ?? {};
    runtimeModules.push({
      initialized: Object.keys(cache).length,
      availableFactories: Object.keys(req.m ?? {}).length
    });
    for (const entry of Object.values(cache)) {
      let exp;
      try { exp = entry?.exports; } catch { continue; }
      remember(exp);
      if (!exp || (typeof exp !== "object" && typeof exp !== "function")) continue;
      for (const key of Object.keys(exp)) {
        try { remember(exp[key]); } catch {}
      }
    }
  }

  const fields = [
    "getCurrentUser", "getUser", "deleteMessage", "editMessage",
    "startEditMessage", "get", "del", "getAPIBaseURL",
    "getMessages", "getMessage", "getChannelId", "getChannel",
    "subscribe", "dispatch", "HTTP"
  ];
  const summary = Object.fromEntries(fields.map(key => [key, {
    functions: 0,
    distinctReferences: 0,
    ownProperties: 0,
    getters: 0,
    stableOnRepeatedRead: 0,
    unstableOnRepeatedRead: 0
  }]));
  const uniques = Object.fromEntries(fields.map(key => [key, new Set()]));
  const signatures = {
    userStoreLike: 0, messageActionsLike: 0, restLike: 0,
    messageStoreLike: 0, selectedChannelLike: 0, dispatcherLike: 0,
    improbableCrossFamily: 0
  };

  for (const obj of objects) {
    const flags = {};
    for (const field of fields) {
      let first, second;
      try {
        first = obj[field];
        if (typeof first !== "function") continue;
        second = obj[field];
      } catch { continue; }
      flags[field] = true;
      const stat = summary[field];
      stat.functions++;
      uniques[field].add(first);
      if (first === second) stat.stableOnRepeatedRead++;
      else stat.unstableOnRepeatedRead++;
      try {
        if (Object.prototype.hasOwnProperty.call(obj, field)) stat.ownProperties++;
        const desc = Object.getOwnPropertyDescriptor(obj, field);
        if (typeof desc?.get === "function") stat.getters++;
      } catch {}
    }
    const user = flags.getCurrentUser && flags.getUser;
    const actions = flags.deleteMessage && (flags.editMessage || flags.startEditMessage);
    const rest = flags.get && flags.del;
    const messages = flags.getMessages && flags.getMessage;
    const selected = flags.getChannelId;
    const flux = flags.subscribe && flags.dispatch;
    if (user) signatures.userStoreLike++;
    if (actions) signatures.messageActionsLike++;
    if (rest) signatures.restLike++;
    if (messages) signatures.messageStoreLike++;
    if (selected) signatures.selectedChannelLike++;
    if (flux) signatures.dispatcherLike++;
    if ([user, actions, rest, messages, selected].filter(Boolean).length >= 3)
      signatures.improbableCrossFamily++;
  }
  for (const key of fields) summary[key].distinctReferences = uniques[key].size;

  // No user IDs, tokens, channel/message IDs, usernames or source code included.
  const result = Object.freeze({
    auditVersion: "1.0",
    browserRuntimeCount: reqs.length,
    runtimes: runtimeModules,
    inspectedExportObjects: objects.length,
    signatures,
    methods: Object.fromEntries(
      Object.entries(summary).filter(([, info]) => info.functions > 0)
    ),
    note: "READ ONLY. Counts are not proof of live message or REST capability."
  });
  console.info("[AutoDelete Audit] Read-only, anonymous module report:");
  console.log(JSON.stringify(result, null, 2));
  window.AutoDeleteAuditReport = result;
  console.info("[AutoDelete Audit] No messages were read, modified, sent or deleted.");
  return result;
})();