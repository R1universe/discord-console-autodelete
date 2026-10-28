  function currentOpenChannelId() {
    const path = String(location.pathname ?? "");
    const match = path.match(/^\/channels\/@me\/(\d{15,22})(?:\/|$)/);
    if (match) return match[1];
    if (path === "/channels/@me" || path === "/channels/@me/") return "";
    return String(hooks?.selectedChannel?.getChannelId?.() ?? "");
  }
  function resolveDmId(value) {
    const id = String(value ?? "");
    if (!validId(id)) return "";
    const channel = hooks?.channelStore?.getChannel?.(id);
    if (channel?.type === 1 || channel?.type === 3) return id;
    const result = hooks?.channelStore?.getDMFromUserId?.(id);
    const channelId = String(typeof result === "string" ? result : result?.id ?? "");
    const dm = hooks?.channelStore?.getChannel?.(channelId);
    return validId(channelId) && (dm?.type === 1 || dm?.type === 3) ? channelId : "";
  }
  function getChoices(kind) {
    const choices = new Map();
    const add = (id, title) => {
      id = String(id ?? "");
      if (!validId(id)) return;
      const name = String(title ?? "").trim().slice(0, 120);
      if (!choices.has(id) || (name && choices.get(id).startsWith("Unknown ")))
        choices.set(id, name || "Unknown " + (kind === "dm" ? "DM" : "server") + " · " + id.slice(-6));
    };
    if (kind === "servers") {
      const guilds = hooks?.guildStore?.getGuilds?.() ?? {};
      for (const guild of (Array.isArray(guilds) ? guilds : Object.values(guilds)).slice(0, 400)) {
        if (validId(guild?.id)) add(guild.id, guild.name);
      }
      const channel = hooks?.channelStore?.getChannel?.(currentOpenChannelId());
      const guildId = String(channel?.guild_id ?? channel?.guildId ?? "");
      if (validId(guildId)) add(guildId, hooks?.guildStore?.getGuild?.(guildId)?.name);
    } else {
      const sidebar = new Map();
      for (const link of document.querySelectorAll?.('a[href^="/channels/@me/"]') ?? []) {
        const m = String(link.getAttribute?.("href") ?? "").match(/^\/channels\/@me\/(\d{15,22})(?:\/|$)/);
        if (m) sidebar.set(m[1], String(link.getAttribute?.("aria-label") ?? "").trim());
      }
      const ids = new Set(sidebar.keys());
      const collect = data => {
        if (!data) return;
        const addId = item => {
          const id = String(typeof item === "string" ? item : item?.channelId ?? item?.id ?? "");
          if (validId(id)) ids.add(id);
        };
        if (Array.isArray(data)) data.slice(0, 500).forEach(addId);
        else if (typeof data === "object") for (const [key, item] of Object.entries(data).slice(0, 500)) {
          if (validId(key)) ids.add(key);
          addId(item);
        }
      };
      // Never mix the authoritative opened-DM list with a stale general cache.
      for (const method of ["getPrivateChannelIds", "getSortedPrivateChannels", "getPrivateChannels"]) {
        try { collect(hooks?.privateChannelStore?.[method]?.()); } catch {}
      }
      if (!ids.size) {
        for (const method of ["getPrivateChannelIds", "getSortedPrivateChannels", "getPrivateChannels"]) {
          try { collect(hooks?.channelStore?.[method]?.()); } catch {}
        }
      }
      const current = currentOpenChannelId();
      if (validId(current)) ids.add(current);
      for (const id of ids) {
        const channel = hooks?.channelStore?.getChannel?.(id);
        if (channel?.type !== 1 && channel?.type !== 3) continue;
        const recipients = channel.recipients ?? channel.recipientIds ?? [];
        const people = (Array.isArray(recipients) ? recipients : []).map(person => {
          const uid = String(typeof person === "string" ? person : person?.id ?? "");
          const user = (validId(uid) ? hooks?.users?.getUser?.(uid) : null) ||
            (typeof person === "object" ? person : null);
          if (!user) return "";
          const display = String(user.globalName ?? user.global_name ?? user.username ?? "").trim();
          const username = String(user.username ?? "").trim();
          return display && username && display.toLowerCase() !== username.toLowerCase() ?
            display + " (@" + username + ")" : display || (username ? "@" + username : "");
        }).filter(Boolean);
        add(id, (channel.type === 3 ? (channel.name || people.join(", ")) :
          (people[0] || channel.name)) || sidebar.get(id));
      }
    }
    for (const id of kind === "dm" ? config.excludedDms : config.excludedGuilds)
      if (!choices.has(id)) add(id, "Saved ID · " + id.slice(-6));
    return [...choices.entries()].sort((a,b) => a[1].localeCompare(b[1])).slice(0, 400);
  }
  function renderPicker() {
    const panel = el("ad-picker");
    panel.hidden = !pickerKind;
    panel.style.display = pickerKind ? "" : "none";
    if (!pickerKind) return;
    const kind = pickerKind, key = kind === "dm" ? "excludedDms" : "excludedGuilds";
    el("ad-picker-title").textContent = kind === "dm" ? "DMs to keep" : "Servers to keep";
    const list = el("ad-picker-list");
    list.replaceChildren();
    const query = String(el("ad-exclude-search").value ?? "").trim().toLocaleLowerCase();
    const matches = getChoices(kind).filter(([id,name]) =>
      !query || name.toLocaleLowerCase().includes(query) || id.includes(query));
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "picker-note";
      empty.textContent = query ? "No matches." :
        "No opened chats found. Open a chat, or enter a channel/user ID below.";
      list.appendChild(empty);
    }
    for (const [id, name] of matches) {
      const row = document.createElement("label");
      row.className = "picker-option";
      row.title = "Channel / server ID: " + id;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = config[key].includes(id);
      input.addEventListener("change", () => exclude(kind, id, input.checked));
      const title = document.createElement("span");
      title.textContent = name;
      row.append(input, title);
      list.appendChild(row);
    }
    const current = currentOpenChannelId();
    const channel = hooks?.channelStore?.getChannel?.(current);
    const canExclude = kind === "dm" ? (channel?.type === 1 || channel?.type === 3) :
      validId(channel?.guild_id ?? channel?.guildId);
    el("ad-exclude-current").disabled = !canExclude;
    el("ad-exclude-current").textContent = kind === "dm" ? "Exclude currently open DM" : "Exclude currently open server";
  }
  function togglePicker(kind) {
    pickerKind = pickerKind === kind ? null : kind;
    el("ad-exclude-search").value = "";
    el("ad-exclude-id").value = "";
    renderPicker(); render();
  }
  // Stop propagation of Discord shortcuts, not normal Backspace editing.
  for (const id of ["ad-exclude-search", "ad-exclude-id"]) {
    const input = el(id);
    for (const type of ["keydown", "keyup", "keypress"]) input.addEventListener(type, event => {
      event.stopPropagation?.();
      if (type === "keydown" && event.key === "Enter" && id === "ad-exclude-id") {
        event.preventDefault?.();
        el("ad-add-exclude").click();
      }
    });
  }
  el("ad-exclude-search").addEventListener("input", renderPicker);
  el("ad-exclude-dm").addEventListener("click", () => togglePicker("dm"));
  el("ad-exclude-servers").addEventListener("click", () => togglePicker("servers"));
  el("ad-exclude-current").addEventListener("click", () => {
    if (!pickerKind) return;
    const id = currentOpenChannelId(), channel = hooks?.channelStore?.getChannel?.(id);
    if (pickerKind === "dm" && (channel?.type === 1 || channel?.type === 3)) exclude("dm", id);
    else if (pickerKind === "servers" && validId(channel?.guild_id ?? channel?.guildId))
      exclude("servers", channel.guild_id ?? channel.guildId);
  });
  el("ad-add-exclude").addEventListener("click", () => {
    if (!pickerKind) return;
    const raw = String(el("ad-exclude-id").value ?? "").trim();
    const id = pickerKind === "dm" ? resolveDmId(raw) : raw;
    if (pickerKind === "dm" && !id) {
      notify("Enter an existing DM channel ID or DM recipient user ID.", "bad");
      return;
    }
    try { exclude(pickerKind, id); el("ad-exclude-id").value = ""; }
    catch (err) { notify(String(err.message), "bad"); }
  });
  function setServerDelay(seconds) { return updateDelay("servers", seconds); }
  function setDmDelay(seconds) { return updateDelay("dm", seconds); }
  // Legacy command: sets both delays, keeping older console workflows working.
  function setDelay(seconds) {
    if (!validDelay(seconds)) throw new RangeError("Delay must be an integer from 1 to 86400 seconds.");
    config.serverDelay = config.dmDelay = Number(seconds);
    save();
    render();
    notify("Both delays set to " + seconds + "s (new messages only).");
    return Number(seconds);
  }
  function setScope(value) {
    if (!scopes.has(value)) throw new RangeError("Scope: all | servers | dm");
    config.scope = value;
    save();
    render();
    notify("Scope changed: " + value + " (new messages only).");
    return value;
  }
  function toggleScope(kind) {
    const servers = config.scope !== "dm", dm = config.scope !== "servers";
    const nextServers = kind === "servers" ? !servers : servers;
    const nextDm = kind === "dm" ? !dm : dm;
    if (!nextServers && !nextDm) return config.scope;
    return setScope(nextServers && nextDm ? "all" : nextServers ? "servers" : "dm");
  }

  el("ad-toggle").addEventListener("click", () => state.enabled ? pause() : resume());
  el("ad-retry").addEventListener("click", connect);
  el("ad-retry-foot").addEventListener("click", connect);
  // Preserve manual edits until Enter or blur, with explicit input locks
  // so the half-second render never resets keystrokes while editing.
