# Discord AutoDelete — Timed Message Deletion for Discord Web

**A JavaScript browser-console tool for automatically attempting to delete your own new Discord messages after a configurable delay.** Choose different timers for direct messages (DMs) and server channels from a floating, glass-style dashboard.

[![Automated tests](https://github.com/R1universe/discord-console-autodelete/actions/workflows/test.yml/badge.svg)](https://github.com/R1universe/discord-console-autodelete/actions/workflows/test.yml)
[![JavaScript](https://img.shields.io/badge/JavaScript-browser%20console-F7DF1E?logo=javascript&logoColor=black)](./autodelete.js)
[![Unofficial](https://img.shields.io/badge/Discord-unofficial-orange)](#important-discord-policy-and-privacy)

<p align="center">
  <img src="assets/autodelete-active.webp" alt="Actual Discord AutoDelete v3.13 interface showing its enabled green glass theme, separate DM and server deletion timers, scope buttons, and queue statistics" width="350">
</p>

<p align="center"><sub>Actual AutoDelete v3.13 screenshot — enabled state. Interface design inspired by translucent glass UI.</sub></p>

> [!WARNING]
> **Unofficial self-bot automation.** Discord prohibits automating a normal user account, and using this project can result in account restrictions or termination. This is a personal experiment, **not an official Discord feature**, and timed deletion is not guaranteed. Review the complete source before executing it.

## Features

- **Auto-delete your own newly sent messages** after a custom delay, when Discord's internal client modules are accessible.
- **Independent DM and server timers**, configurable from **1 second to 24 hours**, with quick **4s** and **60s** presets.
- **Choose scope:** Everywhere · Servers · DMs (including group DMs). Only the relevant timer settings are shown.
- **Floating glass dashboard** with dark blue-violet disabled styling, green enabled styling, draggable window and collapsible Diagnostics.
- **Enable / Disable**, three honest counters (**Queued / Requests / Errors**) and a minimal activity log.
- **Fully hide the panel** with `−`; reopen with `DiscordAutoDelete.open()`. Minimize does not stop monitoring.
- Local settings persist across page reloads, but **the script itself always starts disabled**; pending deletion timers do not survive a reload.
- No account-token entry, message-text collection or remote script loader is required by this source.

## Quick start

1. **Read the source:** [`autodelete.js`](./autodelete.js). Never paste unfamiliar code into an authenticated browser console.
2. Open [Discord Web](https://discord.com/app) and its developer console (macOS Chrome: `Cmd + Option + J`; Windows/Linux Chrome: `Ctrl + Shift + J`).
3. Paste the reviewed source code and execute it. The AutoDelete dashboard appears if the Discord client is compatible.
4. Pick **Everywhere / Servers / DMs**, set the delays, then choose **Enable**.
5. To stop, choose **Disable**; this also cancels pending deletion timers.

**Do not enter or share your Discord user token, cookies or authorization headers.** Avoid `fetch(...).then(eval)` and other unreviewed remote loaders.

### Console controls

```js
DiscordAutoDelete.status()            // Inspect current status
DiscordAutoDelete.setDmDelay(4)        // DM delay in seconds
DiscordAutoDelete.setServerDelay(60)   // Server delay in seconds
DiscordAutoDelete.setScope("all")      // "all", "servers", or "dm"
DiscordAutoDelete.open()               // Restore a minimized panel
DiscordAutoDelete.openDiagnostics()    // Open the activity log
DiscordAutoDelete.pause()              // Disable and cancel pending timers
DiscordAutoDelete.stop()               // Stop and remove the panel
```

## How it works

The script runs **in your current Discord Web tab** and attempts to observe **confirmed new messages authored by the current account**. It uses Discord's undocumented client modules to schedule a deletion call after the selected delay. A timer begins when the script observes a confirmed message, **not necessarily the instant you hit Send**.

The three counters mean:

| Indicator | Meaning |
| --- | --- |
| **Queued** | Messages with pending timers |
| **Requests** | Deletion calls initiated; **not** server-confirmed successful deletions |
| **Errors** | Errors the script caught; it may **miss background HTTP failures** |

Deletion can fail due to client changes, network conditions, permission issues or Discord rate limits. This script is not an ephemeral-message security feature: other people may already have read, saved or copied content.

## Important: Discord policy and privacy

- [Discord's policy on automated user accounts and self-bots](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots) prohibits this approach.
- This project is **not affiliated with or endorsed by Discord**.
- The current source does **not** explicitly request your token or store the text of messages. However, executing any JavaScript inside an authenticated Discord session is inherently sensitive.
- Browser refresh and **Disable** cancel scheduled jobs. **Minimize only hides the UI; monitoring continues while enabled.**
- For a supported integration, prefer an [official Discord bot account and API](https://discord.com/developers/docs/intro).

## Status, testing, and documentation

**Version:** v3.13 · **Type:** experimental browser-console prototype · **Language:** JavaScript.

Automated tests run against **mocked Discord runtime behavior**, not the live Discord API. Discord updates can break the tool without warning.

- [Russian guide / Инструкция на русском](./README_RU.md)
- [Manual QA checklist](./QA_TEST_PLAN.md)
- [Automated test source](./test/test.js)
- [Issues and known limitations](https://github.com/R1universe/discord-console-autodelete/issues)
- [Release history and investigation notes](./docs/RELEASE_HISTORY.md)

**Discoverability keywords:** Discord auto delete messages, Discord message deletion timer, disappearing Discord messages, Discord self-destruct messages, Discord DM auto-delete, Discord server message auto-delete, JavaScript Discord console script.

---

If this experiment was useful, you can **Star** the repository to find it again. Bug reports with reproducible steps (without tokens, message content or personal IDs) are welcome.
