# Research: Discord deletion and editing projects (October 2026)

This is a focused, source-code-oriented sample of relevant GitHub projects, **not** an exhaustive crawl of every GitHub repository.

| Project | Implementation | Lesson for AutoDelete |
|---|---|---|
| [nyxxbit/discord-quest-completer](https://github.com/nyxxbit/discord-quest-completer) | Browser-console script with UI and Webpack module selection | Some builds have multiple Webpack runtime caches; avoid one hard-coded cache and false guarantees |
| [justinhsu1477/crypto-signal-trader](https://github.com/justinhsu1477/crypto-signal-trader/blob/main/discord-monitor/src/cdp_client.py) | Injects a JS observer for MESSAGE_CREATE; attempts a known module ID and finds candidates across runtimes | A live Flux candidate may not be the first one found; implementations cannot count on a fixed internal API |
| [victornpb/undiscord](https://github.com/victornpb/undiscord) | UserScript for scanning and deleting older messages, with separate authentication | Older/history-deletion problem; **not** proof that automatic deletion through a raw browser console works |
| [Codefollows/discord-self-delete](https://github.com/Codefollows/discord-self-delete) | Local Node service, user token held in memory, Discord REST API, scanning and continuous watching | A token-based API client is architecturally different from using the browser client's internal authorized actions |
| [SurefireStudios/DiscordCleanupTool](https://github.com/SurefireStudios/DiscordCleanupTool) | Local tool with user/bot token modes and message scanning | Official bot tokens cannot automatically manage the user's private DM history |
| [hddq/discord-messages-autodelete](https://github.com/hddq/discord-messages-autodelete) | Node/TypeScript self-bot with token, SQLite scheduler, history-import and time-based deletion | Persistence and scheduling can be useful, but it depends on a user token, unlike this console approach |
| [Nanda070/SilentDelete](https://github.com/Nanda070/SilentDelete/blob/main/index.tsx) | Vencord plugin using the Discord client's authorized `RestAPI.del` | Demonstrates a delete operation within the authenticated client, without separately asking for the user's token |
| [aurickk/SilentEdit-Vencord](https://github.com/aurickk/SilentEdit-Vencord) | Experiments with replacement/nonce behavior rather than normal message edit | Client display tricks are not guaranteed server-side edits, and may be fixed by Discord |
| [peekeeper/Vencord-Message-Purge-Plugin](https://github.com/peekeeper/Vencord-Message-Purge-Plugin) | Plugin with search + per-message delete requests and rate-limit backoff | One-delete-per-message and rate-limit handling are essential |
| [DohmBoy64Bit/MessageDeleter](https://github.com/DohmBoy64Bit/MessageDeleter) | Vencord user plugin with date filters and confirmation UI | UX for irreversible deletion should default to safe explicit opt-in |

## Root-cause findings

1. The original AutoDelete v1/v2 required `FluxDispatcher` before it could do anything. Real builds returned **0 candidates**.
2. The v2 check was too restrictive: it required methods and private fields on one object, while projects above use multiple kinds of module discovery, multiple Webpack runtime caches, or a different event source.
3. There are **two independent operations**:
   - Observation: learn the IDs of *new messages from the account currently logged in*.
   - Deletion: authorize a request to `DELETE /channels/{channel.id}/messages/{message.id}`.
4. A Discord client already authenticated in the browser has its own internal REST transport. JavaScript code injected into that client may be able to call it without **extracting or manually pasting a token**. This is not anonymous/unauthenticated access.
5. If Flux cannot be observed, v3 attempts `MessageStore` polling. That fallback is **restricted to the open channel** and can miss messages on channel switches or in other tabs/devices.
6. Mock tests cannot prove compatibility with a live Discord instance. Live validation and honest capability reporting remain necessary.

## What we did *not* implement

- User token extraction or a separate user-token client.
- Editing messages silently or changing their server-side history.
- Interception of raw network traffic, speculative mutation of internal functions, or global WebSocket patching.
- Bulk-history deletion or silent mass edits.
- A bypass of Discord permissions or rate limits.

## Official Discord references

- [Message endpoints](https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx) — message GET, PATCH, DELETE, permission requirements, 204 on successful delete.
- [Self-bots](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots) — automation of normal accounts is forbidden.
- [OAuth2 and bot users](https://github.com/discord/discord-api-docs/blob/main/developers/topics/oauth2.mdx) — bots cannot join ordinary group DMs.

**Caution:** Repository claims about defeating logging, avoiding detection, or guaranteed account safety should not be treated as independently verified facts.


## More directly relevant implementations (October 2026)

Two independently found client-plugin implementations closely match the requested feature:

- [o9ll/Guncord: timeDelete](https://github.com/o9ll/Guncord/blob/main/src/guncordplugins/timeDelete/index.tsx): subscribes to `MESSAGE_CREATE`, ignores optimistic messages and other authors, and uses a configurable timer before `MessageActions.deleteMessage(channelId, messageId)`. It uses the mod framework's lazy lookup `findByPropsLazy("deleteMessage")`, rather than guessing through a raw console's already-loaded modules.
- [caedesdev/moggcord: SelfDestruct](https://github.com/caedesdev/moggcord/blob/main/src/moggcordplugins/selfDestruct/index.tsx): adds a chat-bar toggle and a visible countdown to the user's own messages; obtains `MessageActions` through `findByPropsLazy("deleteMessage", "startEditMessage")` and subscribes through the plugin's `flux.MESSAGE_CREATE` hook.

**Root-cause improvement in v3.1:** Equicord's [REST module lookup](https://github.com/Combatmaster331/Equicord/blob/main/src/webpack/common/utils.ts) first looks up `getAPIBaseURL`, then uses `mod.HTTP ?? mod`. Version 3.0 did not descend into the nested `HTTP` property. It also failed the entire discovery if it found more than one otherwise plausible candidate, and required every necessary module to be in the same Webpack runtime. Version 3.1 addresses both assumptions and reports candidate counts instead of misleading booleans.

Even so, an installed client mod can resolve lazy modules via its own loader and patch APIs, which a one-time console script may not replicate reliably. **Live Discord compatibility still requires testing.**


## v3.2: excessive wrapper matches in an actual client screenshot

A Discord Web client showed `MessageActions=84 candidates (84 preferred)` and `RestAPI=85 candidates; 83 getAPIBaseURL wrappers; 83 tagged transports`, but the same client uniquely identified the actual UserStore and MessageStore via their store display names.

The prior discovery implementation counted **export wrapper identities**, which is often not the same as the count of underlying operations. v3.2 groups deletion candidates by the identity of their actual `deleteMessage` function and REST candidates by the identity of `del`. If all wrappers refer to the same function, one representative can be selected without guessing between different operations. If there is more than one distinct operation, discovery still fails safely and reports the number of distinct functions.

A CI regression now tests 83 wrappers sharing the same REST method and intentionally conflicting REST methods. This is a **hypothesis grounded in screenshots and source code**, not confirmed as the exact live Discord runtime's behavior until retested there.
