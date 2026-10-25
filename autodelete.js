/*
 * Discord AutoDelete — console prototype (2026-10)
 * Automatically deletes YOUR NEW Discord messages after a delay.
 * This is an unsupported Discord client modification / self-bot.
 * It violates Discord rules and could lead to account termination.
 *
 * SECURITY:
 * - no token retrieval or credential access
 * - no external network requests, eval, or remotely loaded code
 * - never logs or stores message text
 * - requires Discord's undocumented internal modules
 *
 * USAGE: review this entire file before pasting into Discord's browser console.
 * Once started, call DiscordAutoDelete.status(), .setDelay(30), .stop().
 */
(() => {
  "use strict";

  const NAME = "DiscordAutoDelete";
  const DEFAULT_SECONDS = 10; // Change this to your preferred number of seconds.
  const MIN_SECONDS = 2;
  const MAX_SECONDS = 24 * 60 * 60;

  if (window[NAME]?.running) {
    console.warn(`[${NAME}] Already running; call ${NAME}.status() or ${NAME}.stop().`);
    return;
  }
  if (!(location.hostname === "discord.com" || location.hostname.endsWith(".discord.com"))) {
    console.error(`[${NAME}] Run only on https://discord.com/app`);
    return;
  }

  // Read the already loaded application's module cache. Does NOT access a token.
  const chunks = window.webpackChunkdiscord_app;
  if (!chunks || typeof chunks.push !== "function") {
    console.error(`[${NAME}] Discord webpack runtime not found. Client may have changed.`);
    return;
  }

  let webpackRequire;
  const tempId = `console-autodelete-${Date.now()}`;
  try {
    chunks.push([[tempId], {}, (req) => { webpackRequire = req; }]);
    // Discord's webpack runtime usually keeps a chunk list. Do not pop unless
    // the marker we just added is still the last entry.
    if (chunks.at(-1)?.[0]?.[0] === tempId) chunks.pop();
  } catch (error) {
    console.error(`[${NAME}] Cannot inspect client modules:`, error);
    return;
  }
  if (!webpackRequire?.c) {
    console.error(`[${NAME}] Module cache inaccessible. Nothing was installed.`);
    return;
  }

  const modules = []
  const alreadySeen = new Set();
  const addModule = (value) => {
    if (value && (typeof value === "object" || typeof value === "function") && !alreadySeen.has(value)) {
      alreadySeen.add(value);
      modules.push(value);
    }
  };
  for (const item of Object.values(webpackRequire.c)) {
    const exported = item?.exports;
    if (!exported) continue;
    addModule(exported);
    if (exported.default) addModule(exported.default);
  }

  // Fail closed on ambiguity: never guess which action to call.
  function findUnique(predicate, what, preference = () => false) {
    const matches = modules.filter((candidate) => {
      try { return predicate(candidate); } catch { return false; }
    });
    const preferred = matches.filter(preference);
    const selected = preferred.length === 1 ? preferred : (matches.length === 1 ? matches : []);
    if (selected.length !== 1) {
      throw new Error(`${what}: found ${matches.length} candidates; refusing to guess.`);
    }
    return selected[0];
  }

  let dispatcher;
  let userStore;
  let messageActions;
  try {
    dispatcher = findUnique(
      (x) => typeof x?.subscribe === "function" && typeof x?.unsubscribe === "function" && typeof x?.dispatch === "function",
      "FluxDispatcher",
      (x) => x?._actionHandlers != null
    );
    userStore = findUnique(
      (x) => typeof x?.getCurrentUser === "function" && typeof x?.getUser === "function",
      "UserStore",
      (x) => typeof x?.initialize === "function"
    );
    messageActions = findUnique(
      (x) => typeof x?.deleteMessage === "function",
      "MessageActions",
      (x) => typeof x?.startEditMessage === "function" || typeof x?.editMessage === "function"
    );
  } catch (error) {
    console.error(`[${NAME}] Unsupported Discord build:`, error.message);
    return;
  }

  const accountId = String(userStore.getCurrentUser()?.id ?? "");
  if (!/^\d{15,22}$/.test(accountId)) {
    console.error(`[${NAME}] Could not determine current account. Not starting.`);
    return;
  }

  let delaySeconds = DEFAULT_SECONDS;
  let running = true;
  let deleted = 0;
  let failed = 0;
  let skipped = 0;
  const pending = new Map(); // IDs and timers only; no message contents.
  const validId = (value) => /^\d{15,22}$/.test(String(value ?? ""));

  function cancel(messageId) {
    const key = String(messageId);
    const job = pending.get(key);
    if (!job) return;
    clearTimeout(job.timer);
    pending.delete(key);
  }

  function onMessageCreate(event) {
    if (!running) return;
    const msg = event?.message;
    if (!msg || String(msg.author?.id ?? "") !== accountId) return;
    const messageId = String(msg.id ?? "");
    const channelId = String(event?.channelId ?? event?.channel_id ?? msg.channel_id ?? msg.channelId ?? "");
    if (!validId(messageId) || !validId(channelId) || pending.has(messageId)) return;

    const expiresAt = Date.now() + delaySeconds * 1000;
    const timer = setTimeout(async () => {
      pending.delete(messageId);
      if (!running) return;
      // A browser tab can be re-used after switching accounts: do not act in
      // a different logged-in account's session.
      if (String(userStore.getCurrentUser()?.id ?? "") !== accountId) {
        skipped += 1;
        console.warn(`[${NAME}] Account changed: skipped message ${messageId}.`);
        return;
      }
      try {
        await Promise.resolve(messageActions.deleteMessage(channelId, messageId));
        deleted += 1;
        console.info(`[${NAME}] Delete requested for message ${messageId}.`);
      } catch (error) {
        failed += 1;
        console.error(`[${NAME}] Delete failed for message ${messageId}:`, error);
      }
    }, delaySeconds * 1000);
    pending.set(messageId, { timer, channelId, expiresAt });
    console.info(`[${NAME}] Scheduled ${messageId} for deletion in ${delaySeconds}s.`);
  }

  function onMessageDelete(event) {
    cancel(event?.id ?? event?.messageId ?? event?.message?.id);
  }

  try {
    dispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
    dispatcher.subscribe("MESSAGE_DELETE", onMessageDelete);
  } catch (error) {
    try { dispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate); } catch {}
    console.error(`[${NAME}] Failed to subscribe. Not running:`, error);
    return;
  }

  const controller = {
    get running() { return running; },
    status() {
      const result = {
        running,
        delaySeconds,
        pending: pending.size,
        deleteRequests: deleted,
        failed,
        skipped,
        accountId,
      };
      console.table(result);
      return result;
    },
    setDelay(seconds) {
      if (!Number.isInteger(seconds) || seconds < MIN_SECONDS || seconds > MAX_SECONDS) {
        throw new RangeError(`Delay must be an integer from ${MIN_SECONDS} to ${MAX_SECONDS} seconds.`);
      }
      delaySeconds = seconds;
      console.info(`[${NAME}] New messages will be deleted after ${seconds}s. Pending timers are unchanged.`);
    },
    stop() {
      if (!running) return;
      running = false;
      dispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
      dispatcher.unsubscribe("MESSAGE_DELETE", onMessageDelete);
      for (const job of pending.values()) clearTimeout(job.timer);
      pending.clear();
      console.info(`[${NAME}] Stopped and cancelled pending timers.`);
    },
  };

  Object.defineProperty(window, NAME, { value: controller, configurable: true });
  console.warn(
    `[${NAME}] EXPERIMENTAL. Running for YOUR NEW messages, ${delaySeconds}s delay. ` +
    `This violates Discord's self-bot rules and may get your account banned. ` +
    `To stop: ${NAME}.stop()`
  );
})();