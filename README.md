# Discord AutoDelete — Self-Destructing Messages in Discord Web

**Give your next Discord messages an expiration timer.** AutoDelete is an experimental, single-file JavaScript tool that watches for **your newly sent messages** and automatically **attempts to delete them** after a delay you choose — as short as **1 second**.

**No manual token entry. No token extraction. No separate application. No bulk-history cleanup.** Just an in-page dashboard for timed deletion of your own new DMs and server messages.

[![Automated tests](https://github.com/R1universe/discord-console-autodelete/actions/workflows/test.yml/badge.svg)](https://github.com/R1universe/discord-console-autodelete/actions/workflows/test.yml)
[![JavaScript](https://img.shields.io/badge/JavaScript-browser%20console-F7DF1E?logo=javascript&logoColor=black)](./autodelete.js)
[![Unofficial](https://img.shields.io/badge/Discord-unofficial-orange)](#important-limitations-and-discord-policy)

<p align="center">
  <img src="assets/autodelete-active.webp" alt="Previous AutoDelete v3.13 interface, before the v3.14 exclusion picker and Deleted counter" width="350">
</p>

<p align="center"><sub>Previous v3.13 interface · v3.17 adds a narrower aligned layout and bottom-edge Diagnostics resizing alongside paced burst deletion, independent scope switches and a draggable compact status view; current builds show inline message countdowns</sub></p>

> [!WARNING]
> **Experimental, unofficial Discord self-bot automation.** Discord prohibits automating regular user accounts; using this script can result in account restrictions or termination. The tool does **not guarantee** that a message will disappear at the requested time, or that it was not read, copied, saved or logged beforehand. Not affiliated with Discord.

## The idea: self-destructing-style messages for Discord

Send a message. The script detects it. A countdown begins. When its timer expires, AutoDelete asks the Discord client to delete that message.

```text
You send a new DM  →  Detected  →  4-second timer  →  Delete attempted
You send in a server → Detected  →  60-second timer →  Delete attempted
```

This is **not a bulk message deleter**. It is designed to give **future messages a configurable lifetime**, while the script is enabled in your Discord Web tab.

### What makes AutoDelete different?

| Most Discord history-cleanup tools | Discord AutoDelete |
| --- | --- |
| Search for **old** messages and delete them in a batch | Watch for **new** messages and schedule each one separately |
| A cleanup session that you start when you want to erase history | An enabled monitor that reacts as you send |
| “Delete delay” often means *time between API requests* | “Deletion delay” means *how long a newly detected message waits before deletion is attempted* |
| May ask for or extract an account token to make API requests | Does **not explicitly extract a token** or ask you to paste one; calls existing authenticated Discord client functions |

This is a **distinct approach**, not a claim to be the world's first Discord deletion script. Existing projects such as [Undiscord](https://github.com/victornpb/undiscord) focus on cleaning existing message history instead.

## Features

- **Live self-destruct timer:** automatically queue an attempted deletion for each detected, newly sent message by your account.
- **Separate DM and server delays:** any whole number from **1 to 86,400 seconds (24 hours)**, with manual per-category entry and an exclusion picker; no fixed-delay presets.
- **Choose where:** **Servers and DMs are independent switches** (both can be enabled, or either alone; at least one remains selected). Each category has its own **Excluded** picker to protect individual DMs or servers; exclusions persist locally.
- **In-Discord glass dashboard:** floating and draggable UI, color-coded disabled/enabled states, timer controls and collapsible diagnostics.
- **No manual token entry or token scraping:** uses Discord's internal authenticated `RestAPI.del()` or `MessageActions.deleteMessage()` when discoverable.
- **Burst handling:** deletion attempts are spaced at least 1.4 seconds apart; messages expiring together can remain queued longer than their configured minimum delay. Explicit `429` errors are retried at most twice with backoff; failures hidden by the Discord client may remain undetected.
- **Acknowledged sends:** an additional message-update listener recovers some provisional-to-confirmed transitions without treating unrelated historical edits as new messages.
- **Version-aware reload:** pasting the updated script stops an older in-page instance (cancels its pending timers) and starts the new build disabled.
- **Inline expiry indicators:** a live timer appears next to each visible, newly sent message in Discord DMs and servers; it disappears after an attempt or cancellation. No message text is read or stored.
- **Honest counters:** **Queued / Deleted**. Deleted counts only matching `MESSAGE_DELETE` events observed after an AutoDelete attempt; it may undercount if events are unavailable. Calls alone never increase Deleted. Caught errors are recorded in Diagnostics rather than shown as a counter.
- **Narrower, aligned controls:** full and minimized panels are each 344px before the retained 88% UI zoom (about 303px on-screen); Excluded buttons now match the custom delay inputs in height and font size.
- **Draggable mini dashboard:** **Minimize (−)** collapses the full overlay to a **same-width, shorter status window** (both modes are scaled down by 12%) showing live **Queued / Deleted** counters. Drag it anywhere on screen, and press **↗** to expand. Monitoring and queued timers continue while minimized; `DiscordAutoDelete.open()` expands it from the console.
- **DM exclusion search:** uses Discord’s available list of opened private channels and the sidebar, displays names from UserStore with username where available, and filters by name or ID. Manual entry accepts an existing DM channel ID or a recipient user ID that resolves to an existing DM. It does not enumerate all past conversations.
- **Resizable Diagnostics:** expand the section, then drag its **bottom border** down to reveal more logs or up to shrink it. Arrow Up/Down also work on the focused bottom edge. The saved height respects the available screen space.
- **Local preferences:** delays, scope, and excluded DM/server IDs are remembered in the browser; **the script starts disabled on every fresh load**.

## Quick start — Discord Web console

1. **Review the complete [`autodelete.js`](./autodelete.js) source first.** Never execute untrusted code in an authenticated browser console.
2. Open [Discord Web](https://discord.com/app). Open the developer console: **Chrome on macOS** `Cmd + Option + J`; **Chrome on Windows/Linux** `Ctrl + Shift + J`.
3. Copy the reviewed `autodelete.js` source into the console and run it. No npm, Python, userscript extension or separate desktop application is required.
4. In the dashboard, enable **Servers**, **DMs**, or both and set the deletion delays. To protect a conversation, open its category’s **Excluded** picker, search by username or ID, select a result, choose **Exclude currently open**, or enter an existing DM channel/user ID when needed. Press **Enable**.
5. Send a harmless new message in a test conversation and observe the **live expiry countdown beside the message**. Use **Disable** to stop monitoring and cancel pending timers.

**Never share your Discord token, cookies or authorization headers.** Do not run unreviewed remote loaders such as `fetch(...).then(eval)`.

## Discord Canary desktop — BetterDiscord plugin (experimental)

For a Discord Canary desktop installation with [BetterDiscord](https://betterdiscord.app/), install the standalone [`AutoDelete.plugin.js`](./AutoDelete.plugin.js). This is a separate packaging of the v3.17 console prototype; the original `autodelete.js` remains available.

1. In BetterDiscord, open **Settings → BetterDiscord → Plugins → Open Plugins Folder**.
2. Download the plugin from [GitHub](./AutoDelete.plugin.js) using **Download raw file**, and put `AutoDelete.plugin.js` in that folder.
3. In **BetterDiscord → Plugins**, enable **AutoDelete** and restart Canary if necessary.
4. The AutoDelete panel will appear automatically when BetterDiscord starts it. Click **Enable** in the panel only when you want monitoring to begin.

**Safety:** it intentionally starts with deletion **disabled** on every fresh launch, and disabling the BetterDiscord plugin stops the monitor and cancels queued deletion attempts. No BDFDB library is needed. The plugin retries initial module discovery, but compatibility with live Discord Canary is **not verified**, and Discord updates can break it. BetterDiscord and user-account automation are unofficial and carry account-risk. See [installation and troubleshooting](./docs/BETTERDISCORD.md).

### Console controls

```js
DiscordAutoDelete.status()            // Status and diagnostics summary
DiscordAutoDelete.setDmDelay(4)        // DM timer: 4 seconds
DiscordAutoDelete.setServerDelay(60)   // Server timer: 60 seconds
DiscordAutoDelete.setScope("all")      // "all" = both on; also "servers" or "dm"
DiscordAutoDelete.excludeDm("DM_CHANNEL_ID")       // Keep a DM out of auto-delete
DiscordAutoDelete.excludeServer("GUILD_ID")       // Keep an entire server
DiscordAutoDelete.excludeDm("DM_CHANNEL_ID", false) // Undo the DM exclusion
DiscordAutoDelete.open()               // Expand the dashboard from mini view
DiscordAutoDelete.minimize()           // Show compact draggable live stats
DiscordAutoDelete.hide()               // Alias for minimize(), never stops timers
DiscordAutoDelete.openDiagnostics()    // Show diagnostic log
DiscordAutoDelete.pause()              // Disable and cancel queued timers
DiscordAutoDelete.stop()               // Remove script UI and stop
```

## How it works — technical architecture

1. **Find client modules.** Inspect Discord Web's existing Webpack module cache for `UserStore`, a usable `FluxDispatcher`, message stores and the client's deletion methods. The script does not obtain a raw user token.
2. **Listen for your next messages.** Subscribe to `MESSAGE_CREATE` events when available. If event subscription is unavailable but the relevant stores exist, fall back to polling the **currently selected channel's** message cache.
3. **Only queue eligible new messages.** Check the author against the logged-in user, reject provisional/unconfirmed IDs, avoid repeated events, and enforce selected scope and per-DM/server exclusions **before** scheduling. Excluding a location also cancels its currently queued jobs.
4. **Start a per-message timer.** Use `setTimeout()` with the selected delay. The clock begins when a confirmed message is **observed** — not necessarily exactly when you press Send.
5. **Request deletion.** Call Discord's existing authenticated internal deletion action. The browser client and Discord servers ultimately determine whether the request succeeds.

**Why not the same as Undiscord?** Undiscord searches historical messages and sends its own authenticated API deletion requests, commonly using an automatically retrieved token. AutoDelete instead observes **new messages** and invokes existing client deletion methods **without explicit token extraction**.

## What the dashboard actually counts

| Counter | Meaning |
| --- | --- |
| **Queued** | Message-deletion timers still pending; visible messages have inline countdown badges until the attempt |
| **Deleted** | Matching `MESSAGE_DELETE` events observed **after the tool attempted a deletion**. Not a guaranteed server-confirmed total; may be zero if these events are unavailable |
Caught errors are reported in the **Diagnostics** activity log and remain available through `DiscordAutoDelete.status().failed`; background failures may not always be detected.

### Important limitations and Discord policy

- **Not instant, guaranteed or truly ephemeral.** A 1-second setting is a target delay after detection, not a guarantee that Discord will remove the message in one second. Other participants can preserve messages before deletion.
- **Not a message-history cleaner.** The script does not automatically erase messages sent before you enable it.
- **Unofficial and fragile.** Discord can change undocumented Webpack exports, event handling or deletion methods at any time.
- **Limited fallback coverage.** Cache-only monitoring observes the currently open channel, **not every server and DM globally**. The DM picker prefers Discord’s active private-channel list and currently rendered sidebar, so archived/closed DMs may not appear. Store APIs and sidebar markup can vary between Discord versions. Use **Exclude current** or a known channel/user ID if a chat is missing.
- **Browser-tab lifecycle.** Refreshing the page stops the script and loses its pending timers. **Disable** also cancels timers; **minimizing the UI does not**. Mini-window position lasts only for the current browser page session.
- **Not a privacy or security guarantee.** This does not provide end-to-end disappearing-message protection.
- **Discord's [self-bot policy](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots)** prohibits automating normal user accounts. Account sanctions are possible. An officially supported alternative for permitted use cases is the [Discord bot API](https://discord.com/developers/docs/intro).

## Project status

**v3.17 · Experimental JavaScript browser-console prototype.** Automated checks cover mocked Discord client scenarios; **they do not certify compatibility or successful deletion on live Discord**.

- [Source code](./autodelete.js)
- [Manual QA test plan](./QA_TEST_PLAN.md)
- [Automated tests](./test/test.js)
- [Known issues and bug reports](https://github.com/R1universe/discord-console-autodelete/issues)
- [Release history and technical investigations](./docs/RELEASE_HISTORY.md)
- [GitHub Topics and discovery settings](./docs/REPOSITORY_DISCOVERY.md)

If you find this **self-destructing-style Discord message timer** useful, consider starring the repository. For bug reports, include reproducible steps but **never** tokens, real message contents or private identifiers.


### Source layout and build

The console and BetterDiscord scripts are generated from the **same runtime source** in `src/runtime/`. These seven ordered fragments separate state, styles, dashboard, Discord-module discovery, scheduling, exclusions and UI controls. They run inside one private closure in the generated scripts; the fragments are not individually pasteable.

`src/entry/` contains the two distribution templates. After changing sources, run:

```sh
node scripts/build.js
node test/test.js
```

CI runs `node scripts/build.js --check` and refuses to pass if `autodelete.js` or `AutoDelete.plugin.js` differs from the shared source. **Do not edit generated distributions manually.** No external dependencies are required to build, and the shipped console file remains copy-pasteable.

**History safety:** AutoDelete must schedule only recently created own messages observed after Enable, never messages loaded when entering an old channel or while backfilling history. Unknown creation timestamps are skipped rather than guessed. Test in an empty/disposable channel before using it elsewhere.
