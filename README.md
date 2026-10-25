# Discord AutoDelete v3.3

An experimental **English-first, in-page control panel** for deleting your own new Discord messages after a configurable delay. This script runs in the Discord web client's JavaScript console. The panel opens in **paused** mode by default.

> **Important:** This is an unsupported client modification / self-bot. Discord prohibits automating normal user accounts and may suspend or terminate your account. Changes to Discord's internal code may break this project at any time. Tests use simulated Discord internals; **live account deletion has not been verified**.

## Current status: live Discord compatibility unverified

**The v3.2 client screenshots showed 83–86 false-positive module candidates. The v1.1 diagnostic revealed 83 objects simultaneously matching five unrelated module families. v3.3 now filters likely translation/catch-all Proxies before method detection, following a documented Vencord blacklist mechanism. This is a specific fix for that failure pattern, but real Discord deletion is still unverified.** It does not send/edit/delete messages, fetch a token, read message content, or make any explicit network request.

1. Reload Discord Web to stop any previous AutoDelete instance.
2. Review and paste `diagnostics/runtime-audit.js` into the browser console.
3. Share only the aggregate `[AutoDelete Audit]` JSON. It contains no account IDs or messages. Do not share browser cookies, Authorization headers, or tokens.

See the [full October 2026 audit (Russian)](./research/AUDIT_2026-10-25_RU.md). The previous audit guided the proxy-filter regression test; if v3.3 still fails, share its filtered-proxy count and module diagnostics without credentials.


## QA and field testing

- [Manual QA checklist (v3.3)](./QA_TEST_PLAN.md) — staged checks for delays, multiple messages, pause, DM/server scope, switching channels, and restart behavior.
- [Read-only queue event audit](./diagnostics/QUEUE_AUDIT_README.md) — investigate why one visible outgoing message can create two queued deletions, without invoking any DELETE operations.
- One live successful deletion was reported by a user; broader correctness and reliability have **not** been verified.

## Features

- Floating, draggable dashboard in English, with status, queue, activity log and controls.
- Delay from **2 seconds to 24 hours**, plus 5 / 10 / 30 / 60 second presets.
- Scopes: **all**, **servers only**, **DMs only** (scope classification depends on available channel metadata).
- Enable, pause, retry detection, minimize, close.
- Settings for delay and scope saved in this browser. Auto-deletion is **never enabled automatically**.
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
DiscordAutoDelete.setDelay(30)
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

Version 3.3 passed GitHub Actions checks using mocks, including regression cases with 83 duplicated REST exports, duplicated MessageActions, and genuinely ambiguous deletion functions. **This is not a live Discord test.** If the UI still says ERROR, note the module candidate counts shown in the panel; do not share or extract an authorization token.

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
