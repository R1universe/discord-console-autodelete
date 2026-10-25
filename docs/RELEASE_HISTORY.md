# AutoDelete — development notes and legacy release history

This file preserves the original long-form README through v3.13, moved out of the landing page on 26 October 2026. It is historical material: old defaults, labels and limitations may no longer describe the current script. For current usage see [the main README](../README.md).

---

# Discord AutoDelete v3.13

Experimental **English-first browser-console dashboard** for deleting your own new Discord messages after a delay. **Unofficial self-bot automation violates Discord's rules** and can put your account at risk. Do not run unreviewed scripts or provide your Discord user token.

## What's new in v3.13 — truly minimize to nothing

The header **−** button now completely hides the floating overlay. It no longer replaces the interface with the large `AutoDelete · Paused` / `AutoDelete · Active` pill. **Nothing remains on-screen.**

- **Minimize (−)** — hide the entire overlay via `host.style.display = "none"`. Monitoring, in-memory timer queue, and settings are **unchanged**; if auto-delete was enabled it can still delete messages while hidden.
- **Reopen** — run `DiscordAutoDelete.open()` in the Discord Web browser console. Alternatively **paste the same inspected script again into the same tab**; it detects the existing controller and reopens the original panel without installing another one.
- **Open Diagnostics** — `DiscordAutoDelete.openDiagnostics()` also restores the panel and opens the log.
- **Disable** — stop monitoring and cancel pending timers. **Close (×)** — stop, detach listeners and remove the script's overlay. **Browser refresh** — the console script and queue do not persist.
- No floating pill, badge or small hidden-position click target is created on minimize.

**Note:** The existing console-script automation remains unsupported by Discord. Minimize does **not** mean Disable; to stop deletion, click Disable **before** minimizing or reopen with `DiscordAutoDelete.open()` and then Disable.

Mock-based regression tests verify that clicking Minimize fully hides the host, active monitoring and pending jobs survive minimization, and console reopening and diagnostics restore the full panel. This is not a live Discord compatibility guarantee.

## What's new in v3.12 — transparent Apple × Discord glass

The floating panel now follows the two user-selected **glass interface mockups**: cool blue-violet in the disabled state and softly luminous emerald while enabled. It has real `backdrop-filter: blur(28px) saturate(165%)`, translucent layered backgrounds, specular hairline borders, soft ambient reflections, rounded glass controls, and a restrained active-state glow. The effect depends on the browser and the page behind the floating panel.

- The three statistics (**Queued**, **Requests**, **Errors**) remain **icon-free**: large centered number with its label beneath, no graphic glyphs in the counters.
- **Custom deletion delay now supports 1–86,400 seconds (1s–24h)** for each of DMs and Servers. Each delay row still has three equal-width controls: **editable seconds / 4s / 60s**. Previous saved delays migrate unchanged.
- One-second timing refers to **scheduling the delete attempt one second after a confirmed message is observed**. Browser timer throttling, slow message confirmation, rate limits and network conditions mean actual deletion is not guaranteed to occur within one second.
- The existing module resolution, provisional-message filtering, scope selection, disabled-by-default state, and queue-cancellation behavior are retained.
- **Requests** counts attempted calls, **not server-confirmed deletions**. **Errors** only counts captured exceptions; background 404/429 responses may be missed. See [Issue #2](./issues/2).
- The original script remains an unsupported Discord self-bot, which Discord forbids and may sanction.

Tests now validate the translucent style markers, icon-free metrics and both 1000ms server/DM schedules using mocked clients. **The v3.12 appearance and real-world timing still need validation in the user's browser.**

See the [v3.12 visual specification](./design/UX_SPEC_v3.12.md).

## What's new in v3.11 — symmetrical delay rows

The header displays just **AutoDelete v3.11**, plus Minimize and Close. The subtitle **“Timed Discord messages”** and the header **?** help button have been removed. Diagnostics remains accessible from the footer (and from `DiscordAutoDelete.openDiagnostics()`).

Each visible delay row now consists of exactly **three equally sized controls**: **custom seconds input | 4s | 60s**. Both DMs and Servers use the same grid geometry and presets. Custom input continues to accept any valid integer from **2 to 86,400 seconds**; press Enter or click outside to save. The values from previous versions are preserved, even when they do not match the 4s or 60s presets.

The Where to delete selector still controls whether the DM row, Server row, or both appear. Timer scheduling, confirmation filtering, event handling and self-bot risks have not changed. Unit tests verify the new markup, presets, persistence and queue behavior. **Live Discord visual compatibility has not yet been verified for v3.11.**

## What's new in v3.10 — futuristic Discord-like graphite glass

v3.10 refines the visual layer only. It uses a near-black **glass/graphite aesthetic** with an understated ambient Blurple highlight while disabled, and a restrained emerald glow while enabled. Buttons and stats use translucent gradients, fine inset edges and softer borders. The scope selector is now a single connected three-option capsule. Reduced-motion support remains available.

- Dashboard counters now read **Queued / Requests / Errors**, replacing Attempts/Caught.
  - **Queued** = live pending timers.
  - **Requests** = delete API method calls initiated, **not** confirmed successful server deletions.
  - **Errors** = errors caught from the invoked method, **not** all background HTTP errors. Known 404/429 behavior remains unresolved; see [Issue #2](./issues/2).
- The two verbose explanatory paragraphs are **removed from the Diagnostics panel**. Diagnostics still contains Activity Log and Reconnect; concise counter caveats remain available as native hover titles.
- **Account risk disclosure is maintained in this README**, not presented as a large warning block inside the compact UI. This remains unofficial Discord self-bot automation and can trigger sanctions.
- Connection errors and limited-coverage notices remain visible when applicable.
- Existing Delay/Scope, timer persistence, confirmation filtering and deletion logic are untouched.

Automated mock tests validate the refreshed DOM/CSS markers, honest counter labels and existing functional behavior. **The new visual styling has not yet been tested in a live Discord browser session.**

## What's new in v3.9 — choose where, then choose when

The compact UI now places controls in this order: **Enable / Disable → Where to delete → relevant delay settings → Queued / Attempts / Caught**.

- Primary button labels are simply **Enable** and **Disable**. Disable still **cancels all pending timers**, as in earlier versions; the active button has a tooltip clarifying that behavior.
- The `Where to delete` segmented control sits directly below the primary button.
- **Everywhere** shows both delay settings (DMs first, Servers second).
- **DMs** shows only the **DMs · deletion delay** field; **Servers** shows only **Servers · deletion delay**.
- Switching scope does not reset hidden delay values. They are preserved in local settings and reappear unchanged when needed.
- Scope changes affect **future messages only**; existing queued jobs keep their original deadlines. Disable cancels them.
- Green/black theme, diagnostics, valid manual time entry and the core scheduling/deletion implementation remain unchanged.

Mock-based tests cover the visual order, all scope/field combinations, independent hidden settings and button labels. **This update has not yet been visually tested on the user's live Discord client.** Using a normal account for this automation remains prohibited by Discord.

## What's new in v3.8 — black + green interactive redesign

The main panel is now **near-black while paused** and softly **green-accented when auto-delete is active**. It uses a neutral graphite palette (base `#101113`, enabled background `#101714`, enabled border `#2e7d57`) instead of the older blue-charcoal scheme.

- **Enable / Disable** is the first control directly below the header. The button clearly communicates whether deletion is on; enabling changes the accent, border and glow across the entire panel.
- The old **ACTIVE / PAUSED · LOCAL** header row is removed. Version remains next to the title, and errors continue to appear as visible alerts.
- **Where to delete** now uses three side-by-side **Everywhere / Servers / DMs** buttons instead of a browser-native dropdown. The selected button uses `aria-pressed` and the accent switches from subdued blue (off) to green (on).
- The redundant **Queue empty / Next deletion** line is gone. `Queued`, `Attempts`, and `Caught` remain in the compact statistics row.
- The **DMs-first** and **Servers-second** timer fields, manual seconds entry, settings migration and scheduling logic are retained from v3.7.
- **Diagnostics & safety** is still available, collapsed by default. Connection errors and current-channel-only limitations remain visible without expanding it.

See [v3.8 UX specification](./design/UX_SPEC_v3.8.md). Mock-based tests pass, but the new visual layout has **not yet been checked on a real Discord Web session**. Unsupported self-bot automation can put the account at risk.

## What's new in v3.7 — DM-first and reliable manual time entry

- **DMs · deletion delay** now appears **above** **Servers · deletion delay** in the floating UI, as requested.
- Both custom numeric fields now accept freely typed values between **2 and 86,400 seconds**. The 500ms dashboard refresh no longer overwrites partially typed numbers (including an empty field or an initial `1`).
- Type your value and press **Enter**, or **click outside the field**, to save it. Press **Escape** to discard changes.
- Values are validated **on commit**, not each keystroke. Invalid entries revert to the previous valid setting with an Activity Log notice.
- Keyboard input inside those fields is isolated from Discord's global bubble-phase shortcuts where supported. The script does not override browser or Discord capture-phase hotkeys.
- Existing presets, saved settings, timer scheduling, and deletion logic are unchanged.

Automated tests replay manual typing with periodic redraws and check Enter/blur/Escape, numeric validation and the DM-first field order. **The UI fix has not yet been tested on the user's live Discord Web browser.**

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
