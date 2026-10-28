# BetterDiscord desktop plugin (experimental)

The file [`AutoDelete.plugin.js`](../AutoDelete.plugin.js) is a self-contained BetterDiscord build of the v3.15 console tool. It does not depend on BDFDB. The original [`autodelete.js`](../autodelete.js) remains unchanged.

## Install on macOS / Discord Canary

1. Finish installing BetterDiscord into **Discord Canary** and confirm its section appears in **User Settings**.
2. Open **User Settings → BetterDiscord → Plugins → Open Plugins Folder**.
3. Save [`AutoDelete.plugin.js`](../AutoDelete.plugin.js) into the folder exactly with the `.plugin.js` extension (not `.txt`).
4. Enable **AutoDelete** in the BetterDiscord plugin list. The panel should be added to the Discord window without opening the developer console.
5. Check the panel's connection status. Press **Enable** only when you intentionally want future messages monitored for scheduled deletion. Test with a disposable message first.

For the official BetterDiscord installation instructions, see https://docs.betterdiscord.app/plugins/introduction/quick-start.html .

## Behavior and limitations

- The code is embedded directly inside the plugin; no remote loader, BDFDB dependency, or user-token extraction is added.
- Each fresh plugin start initializes the panel with deletion **disabled**. Settings and exclusions continue to be stored locally by the original script.
- The wrapper retries initial Discord module detection up to 20 times (about 30 seconds), without interrupting monitoring after it has been enabled. If detection fails, use **Retry connection** in the panel.
- Disabling the plugin invokes the original cleanup: cancels queued timers, unsubscribes client events, removes its UI, and clears wrapper timers.
- This build has passed a JavaScript parse / BetterDiscord entrypoint check, **not a live Canary compatibility test**. Discord's undocumented internals and the latest Canary builds may require further fixes.
- Refreshing/restarting Discord cancels pending timers. A successful deletion is not guaranteed.
- **Discord prohibits self-bot automation on normal user accounts; account sanctions are possible.** This is an unofficial, experimental tool.

## Troubleshooting

- **Plugin missing:** check BetterDiscord is actually loaded, the file is in the plugins directory, and its name ends in `.plugin.js`.
- **Dashboard missing:** disable and re-enable the plugin; check Canary's developer console for `[AutoDeletePlugin]` errors. An already-running console instance must be stopped before enabling the plugin.
- **Connection error:** wait for the initial retry cycle, then use **Retry connection**. Canary's module APIs may have changed.
- **Dashboard visible but messages are not deleted:** ensure you pressed **Enable**, confirm the scope and exclusions, and inspect Diagnostics. Availability of deletion methods is not guaranteed.
- **Safe shutdown:** turn off **AutoDelete** in BetterDiscord's Plugins screen to cancel the current queue and unload the dashboard.
