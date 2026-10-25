# Discord AutoDelete v3.6

Experimental **English-first browser-console dashboard** for deleting your own new Discord messages after a delay. **Unofficial self-bot automation violates Discord's rules** and can put your account at risk. Do not run unreviewed scripts or provide your Discord user token.

## What's new in v3.6 — compact dark UI

The dashboard has been redesigned with a **neutral Discord-adjacent charcoal palette**, one restrained blurple accent, and a smaller information footprint:

- Introductory paragraph removed from the primary screen.
- Large warning and technical metric caveat moved into a **collapsed `Diagnostics & safety`** section (also accessible via the header `?`).
- Activity Log and manual module reconnect live in the expanded section.
- **Connection errors remain visible in the main panel**; a limited-coverage warning remains visible if only the current open channel is observed.
- Server and DM delays, scope, Pause/Enable, metrics and queue status remain in the main panel.
- The module-discovery, token-handling, timer and deletion logic remains unchanged from v3.5.

See the [complete UX spec and palette](./design/UX_SPEC_v3.6.md). Tests cover the default collapsed layout and the safety/diagnostics entry points. **Visual rendering has not been verified on the user's live Discord browser.**

## What's new in v3.5 — independent server and DM delays

The dashboard now has **two separate time controls**:

- **Servers · deletion delay** — for your own confirmed messages in server channels.
- **DMs · deletion delay** — for your own confirmed messages in one-to-one and group DMs.

For example, set **Servers = 10 seconds** and **DMs = 60 seconds**, then choose **Everywhere**. Each message is assigned its applicable delay **when scheduled**. Existing pending jobs are never retimed by a settings change. Both settings are saved locally and survive refresh, but auto-delete always restarts **paused**.

For existing users, v3.5 migrates the previous single `delay` setting to **both** fields, so the upgrade does not silently change existing behavior. Both fields accept integer delays of 2–86,400 seconds with 5/10/30/60s preset buttons.

If channel identity cannot be reliably determined, no deletion is scheduled; the script never guesses which timer should apply. The separate delays and migration were verified using mocked tests, **not a live Discord session**.

```js
DiscordAutoDelete.setServerDelay(10) // Only server messages
DiscordAutoDelete.setDmDelay(60)     // Only DMs and group DMs
DiscordAutoDelete.setDelay(30)       // Legacy: set both categories to 30s
DiscordAutoDelete.status()           // Shows serverDelaySeconds and dmDelaySeconds
```

## Status — 25 October 2026

**v3.3 was observed deleting live messages**, but a genuine user test exposed an important bug: a single outgoing message temporarily appeared under two different message IDs, creating **Queued=2**. A separate problem showed rejected HTTP DELETE calls (404 and 429) while the UI's previous error metric stayed at 0.

The read-only [queue event audit](./diagnostics/QUEUE_AUDIT_README.md) captured the exact sequence:

- **M2:** `id === nonce N1`, `state: SENDING`, first event `optimistic: true`, later visible in cache with `optimistic: false`.
- **M3:** `id !== nonce N1`, eventually `state: SENT`, with the same `nonce`. This is the confirmed server ID.

**v3.4 fixes the confirmed-only scheduling error**: it rejects optimistic/SENDING events and `id === nonce` temporary messages before creating jobs, and deduplicates confirmed representations by their nonce. GitHub Actions tests replay this sequence and assert exactly one deletion action against M3. The correction has **not yet been verified in a live Discord session**.

The interface now calls its counters **Attempts** (method invocations, not server-confirmed deletions) and **Caught** (errors visible through return values/promises, not all background HTTP failures). [Issue #2](./issues/2) remains open. Do not interpret Attempts as successful deletions.

For module discovery history see [research audit](./research/AUDIT_2026-10-25_RU.md); v3.3 excluded Discord i18n Proxy false positives and found a usable client module set.

## QA and field testing

- [Manual QA checklist (v3.3–v3.6)](./QA_TEST_PLAN.md) — staged checks for delays, multiple messages, pause, DM/server scope, switching channels, and restart behavior.
- [Read-only queue event audit](./diagnostics/QUEUE_AUDIT_README.md) — investigate why one visible outgoing message can create two queued deletions, without invoking any DELETE operations.
- v3.3 deletion worked in user testing; v3.4's fix is unit-tested but has not been live-tested. Broad correctness and reliability are unverified.

## Features

- Floating, draggable dashboard in English, with status, queue, activity log and controls.
- **Two independent delays** (servers and DMs), each from **2 seconds to 24 hours**, with 5 / 10 / 30 / 60 second presets.
- Scopes: **all**, **servers only**, **DMs only** (scope classification depends on available channel metadata).
- Enable, pause, retry detection, minimize, close.
- Both separate delays and the scope are saved in this browser. Auto-deletion is **never enabled automatically**.
- Only message IDs are handled. Script does not retrieve a token, store text, read messages for their contents, or load code from an external site.
- Tries **Flux event subscriptions** when available and **MessageStore polling** as a secondary strategy.
- Uses the Discord client's already authenticated **RestAPI.del** action where available, otherwise **MessageActions.deleteMessage**. The script does not fetch a user token.

## Installation

1. Read the complete [autodelete.js](./autodelete.js). Never run unreviewed scripts in an authenticated browser console.
2. Open [Discord Web](https://discord.com/app).
3. Open developer console: **Chrome on macOS:** `Cmd + Option + J`; **Windows/Linux:** `Ctrl + Shift + J`.
4. Paste **the JavaScript source** into the console, then press Enter.
5. An AutoDelete panel should appear. If it says **ERROR**, review the details; no deletion will be enabled.
6. Select a delay and where you want deletion, click **Enable auto-delete**, and test using a harmless message.
7. The app is local to the current browser page. Closing/reloading it removes the running script and pending timers.

**Do not run remote loaders** like `fetch(...).then(eval)`, and never share your Discord account token.

## Commands (optional)

```js
DiscordAutoDelete.status()
DiscordAutoDelete.open()
DiscordAutoDelete.hide()
DiscordAutoDelete.setServerDelay(10)
DiscordAutoDelete.setDmDelay(60)
DiscordAutoDelete.setDelay(30) // sets both timers
DiscordAutoDelete.setScope("servers") // all | servers | dm
DiscordAutoDelete.resume()
DiscordAutoDelete.pause()
DiscordAutoDelete.retry()
DiscordAutoDelete.stop()
```

## Compatibility and limitations

The original v1 and v2 versions failed on some real Discord builds:

```text
FluxDispatcher: 0 candidates
```

### What changed in v3–v3.3

- **v3.1:** Searches all Webpack runtimes as a single pool, diagnoses ambiguous matches by candidate counts, and discovers the REST client from `getAPIBaseURL` exports and nested `HTTP` transports. This addresses a case where `REST=false` did not mean that REST was absent.
- **v3.3:** Rejects known Discord `IntlMessagesProxy` exports and anonymous catch-all Proxy exports **before** reading methods such as `deleteMessage` or `del`. That prevents translation proxies from being mistaken for 83 independently valid API clients. Filters ambiguous Flux event bus candidates instead of subscribing to all of them. Adds mocked tests for 83 caching proxies (some untagged). The log and `DiscordAutoDelete.status()` show how many proxies were filtered. [Upstream precedent: Vencord's `shouldIgnoreValue`](https://github.com/Vendicated/Vencord/blob/main/src/webpack/webpack.ts).
- **v3.2:** Re-exported Discord functions may appear through dozens of wrapper objects. Module selection now groups wrappers by **actual function reference** rather than treating every wrapper as a different operation. If distinct deletion functions remain, the script stops rather than guessing. 
- Flux is **not mandatory**. The script inspects named Webpack exports across runtime caches and accepts candidates with the core subscribe/dispatch interface.
- If an event dispatcher cannot be found but `MessageStore` and `SelectedChannelStore` are accessible, it can monitor the **currently open channel** by polling its cached messages.
- Cache-only mode is **not global monitoring**. Navigating to a new channel establishes a baseline so old messages won't be deleted; the first message sent during a channel switch might be missed.
- Deletion tries an internal authenticated REST action before a MessageActions fallback. These internals can still disappear in future versions.
- Failure to find any observation or deletion mechanism disables the feature, rather than guessing or requesting your user token.

### Important behavior

- Only new messages observed while enabled are processed; the script does not bulk-delete history.
- Cache monitoring can only see the current/open channel, not every DM or server channel simultaneously.
- Message deletion can fail due to permission checks, rate limits, network errors, or client API changes.
- Deletion cannot stop someone from archiving a message beforehand.
- Pausing cancels pending timers. Timers and queue **are not persisted** across reload.
- A logged delete request does not necessarily prove all other clients have removed the message.
- The script can use your existing browser session **without asking for a token**; the session still authorizes requests internally.
- The script's code in the GitHub repository is public. It contains no credentials.

## Research notes

See [research/related-projects.md](./research/related-projects.md) for a comparison of existing GitHub projects and their methods.

## Tests

No Discord account is used in CI. GitHub Actions runs:

```bash
node --check autodelete.js
node test/test.js
```

Mocked tests cover multiple runtimes, named exports, safe default, event monitoring, cache-only fallback, authorized RestAPI wrapper, duplicate events, scope filters, pause, account switching, and English UI. They **cannot prove real-world compatibility**.

## Risk

[Discord's self-bot policy](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots) prohibits this category of automation, including scripts that change your own messages. Use of a secondary account doesn't make the method permitted.
### Current test status

Version 3.4 passed GitHub Actions checks using mocks, including regression cases with 83 duplicated REST exports, duplicated MessageActions, and genuinely ambiguous deletion functions. **This is not a live Discord test.** If the UI still says ERROR, note the module candidate counts shown in the panel; do not share or extract an authorization token.

### Audit v1.1 (HTTP shape correction)

A user's first read-only report inspected 52,606 exported objects across two Webpack runtimes. It showed 83 distinct `HTTP` **functions**, each stable under repeated reads and reported as an own property. **The v1.0 audit only counted function-valued `HTTP` fields**, accidentally excluding object-valued `HTTP` transports. The data do not prove there are 83 usable Discord REST clients.

The new v1.1 diagnostic adds `httpPropertyTypes` (object vs function and nested method signatures) plus `crossFamily` (overlap of unrelated client-module traits). It performs no explicit network requests, reads no messages and never retrieves credentials; reading a JS property can still trigger a getter in the host app. Paste the complete, aggregated report from v1.1, not screenshots cut off at the bottom.

```js
copy(JSON.stringify(window.AutoDeleteAuditReport, null, 2))
```

The command copies the aggregated diagnostic object created by the audit, **not** a user token or message content.


### The actual root-cause hypothesis

The user's v1.1 read-only audit showed **83 export values that simultaneously resemble UserStore, MessageActions, RestAPI, MessageStore, and SelectedChannelStore**. Their properties were stable on repeated reads and often present as own properties. This is characteristic of caching i18n / catch-all proxies. [Vencord's actual webpack loader](https://github.com/Vendicated/Vencord/blob/main/src/webpack/webpack.ts) explicitly excludes `IntlMessagesProxy` and values that produce non-`undefined` for a nonsense key, because i18n proxies can **cache the synthesized value on first read**. Our previous search did not exclude these modules.

The result explains why `84 distinct deleteMessage functions` was misleading: those may be 83 translation functions generated on demand, plus one real method. **This remains a hypothesis until a live v3.3 run**; we do not log any contents or credentials to verify it.

## Version 3.4 regression and limitations

The field trace demonstrates a confirmed message with `nonce N1` preceded by an optimistic message whose **ID also equals `N1`**. The cache's copy of the optimistic message had `optimistic: false` but still `state: SENDING`. `v3.3` incorrectly queued that temporary ID and then the real server ID, often resulting in a false DELETE 404. The new test reproduces the Flux + cache sequence, including an event with a temporary ID; only the real message gets queued.

- Queue timers are intentionally lost on page refresh and Pause. The script does not guarantee exact timing in suspended tabs.
- Same-nonce confirmed event representations are deduplicated per channel; nonces remain ephemeral in memory and no message content is logged.
- HTTP 404 may have other causes and HTTP 429 is a separate rate-limit response. This fix does not resolve all possible HTTP failures or confirm server-side deletion status.
- The logic for `Caught` still cannot observe a Discord method's asynchronous rejection if that method returns `undefined`; no user tokens are requested.

See [queue duplicate bug #1](./issues/1) and [HTTP failure reporting bug #2](./issues/2). Both require live verification before being marked fully resolved.
