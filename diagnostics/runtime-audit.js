/**
 * AutoDelete runtime audit — READ ONLY
 * Run in https://discord.com/app Console after reviewing the full script.
 *
 * IMPORTANT: This script cannot and does not delete/edit/send messages.
 * It never accesses an authorization token, message body, storage, or the network.
 * It reports aggregated technical metadata about module exports only.
 * Note: reading an exposed JS property can invoke a property getter. This script
 * never intentionally calls any Discord API, but it cannot guarantee that
 * arbitrary getters in the client have zero side effects.
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
  // The previous audit incorrectly treated HTTP only as a function.
  // Real HTTP transports may be objects. Count this property separately.
  const httpPropertyTypes = {
    absent: 0, nullish: 0, function: 0, object: 0, other: 0,
    nestedObjectsWithGetDel: 0, nestedObjectsWithGetPostPutDel: 0,
    nestedFunctionsWithGetDel: 0
  };
  const crossFamily = {
    userAndRest: 0,
    userAndMessageActions: 0,
    messageStoreAndRest: 0,
    actionsAndRest: 0,
    threeOrMoreFamilies: 0,
    fiveOrMoreFamilies: 0
  };
  const signatures = {
    userStoreLike: 0, messageActionsLike: 0, restLike: 0,
    messageStoreLike: 0, selectedChannelLike: 0, dispatcherLike: 0,
    improbableCrossFamily: 0
  };

  for (const obj of objects) {
    const flags = {};
    let http;
    let httpOwn = false;
    try {
      httpOwn = Object.prototype.hasOwnProperty.call(obj, "HTTP");
      if (httpOwn) http = obj.HTTP;
    } catch {}
    if (!httpOwn) httpPropertyTypes.absent++;
    else if (http == null) httpPropertyTypes.nullish++;
    else if (typeof http === "function") httpPropertyTypes.function++;
    else if (typeof http === "object") httpPropertyTypes.object++;
    else httpPropertyTypes.other++;
    if (http && (typeof http === "object" || typeof http === "function")) {
      try {
        const httpMethods = ["get", "post", "put", "del"].map(key => typeof http[key] === "function");
        if (httpMethods[0] && httpMethods[3]) {
          if (typeof http === "function") httpPropertyTypes.nestedFunctionsWithGetDel++;
          else httpPropertyTypes.nestedObjectsWithGetDel++;
        }
        if (httpMethods.every(Boolean) && typeof http === "object")
          httpPropertyTypes.nestedObjectsWithGetPostPutDel++;
      } catch {}
    }
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
    if (user && rest) crossFamily.userAndRest++;
    if (user && actions) crossFamily.userAndMessageActions++;
    if (messages && rest) crossFamily.messageStoreAndRest++;
    if (actions && rest) crossFamily.actionsAndRest++;
    const familyCount = [user, actions, rest, messages, selected].filter(Boolean).length;
    if (familyCount >= 3) {
      signatures.improbableCrossFamily++;
      crossFamily.threeOrMoreFamilies++;
    }
    if (familyCount >= 5) crossFamily.fiveOrMoreFamilies++;
  }
  for (const key of fields) summary[key].distinctReferences = uniques[key].size;

  // No user IDs, tokens, channel/message IDs, usernames or source code included.
  const result = Object.freeze({
    auditVersion: "1.1",
    browserRuntimeCount: reqs.length,
    runtimes: runtimeModules,
    inspectedExportObjects: objects.length,
    signatures,
    crossFamily,
    httpPropertyTypes,
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