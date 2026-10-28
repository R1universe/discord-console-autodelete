  function bindDelayInput(kind, id) {
    const input = el(id);
    const selectedDelay = () => kind === "dm" ? config.dmDelay : config.serverDelay;
    const commit = () => {
      const raw = String(input.value ?? "").trim();
      editingDelay.delete(kind);
      if (/^\d+$/.test(raw) && validDelay(Number(raw))) {
        const seconds = Number(raw);
        if (seconds !== selectedDelay()) updateDelay(kind, seconds);
        else render();
      } else {
        notify("Enter a whole number between 1 and 86400 seconds.", "bad");
        input.value = String(selectedDelay());
        render();
      }
    };
    input.addEventListener("focus", () => editingDelay.add(kind));
    input.addEventListener("input", () => editingDelay.add(kind));
    // Discord listens for shortcuts and may treat 0-9 as client hotkeys.
    // Keep typing inside the Shadow DOM control.
    for (const type of ["keydown", "keyup", "keypress"]) {
      input.addEventListener(type, event => {
        event.stopPropagation?.();
        if (type !== "keydown") return;
        if (event.key === "Enter") {
          event.preventDefault?.();
          input.blur?.();
          if (editingDelay.has(kind)) commit();
        } else if (event.key === "Escape") {
          event.preventDefault?.();
          editingDelay.delete(kind);
          input.value = String(selectedDelay());
          input.blur?.();
          render();
        }
      });
    }
    input.addEventListener("change", () => commit());
    input.addEventListener("blur", () => {
      if (editingDelay.has(kind)) commit();
    });
  }
  bindDelayInput("dm", "ad-dm-delay");
  bindDelayInput("servers", "ad-server-delay");
  shadow.querySelectorAll("[data-scope]").forEach(btn =>
    btn.addEventListener("click", () => toggleScope(btn.dataset.scope)));
  // Switching views never stops monitoring or cancels any timer.
  function clampPosition() {
    if (!host.style.left || host.style.left === "auto") return;
    const rect = host.getBoundingClientRect();
    const left = parseFloat(host.style.left), top = parseFloat(host.style.top);
    if (Number.isFinite(left))
      host.style.left = Math.max(6, Math.min(left, Math.max(6, window.innerWidth - rect.width - 6))) + "px";
    if (Number.isFinite(top))
      host.style.top = Math.max(6, Math.min(top, Math.max(6, window.innerHeight - rect.height - 6))) + "px";
  }
  function minimizePanel() {
    if (state.destroyed) return;
    el("ad-panel").style.display = "none";
    el("ad-mini-panel").hidden = false;
    el("ad-mini-panel").style.display = "";
    clampPosition();
    render();
  }
  function showPanel() {
    if (state.destroyed) return;
    el("ad-mini-panel").hidden = true;
    el("ad-mini-panel").style.display = "none";
    el("ad-panel").style.display = "";
    clampPosition();
    render();
  }
  el("ad-min").addEventListener("click", minimizePanel);
  el("ad-restore").addEventListener("click", showPanel);

  // Drag the bottom border to expand Diagnostics without changing deletion behavior.
  let diagnosticsResize = null;
  const resizeHandle = el("ad-diag-resize"), logView = el("ad-logs");
  logView.style.height = config.diagnosticsHeight + "px";
  resizeHandle.addEventListener("pointerdown", event => {
    if (event.button != null && event.button !== 0) return;
    const rect = el("ad-panel").getBoundingClientRect?.();
    const room = Math.max(0, (window.innerHeight ?? 900) - 8 - (rect?.bottom ?? 0));
    diagnosticsResize = {
      y: event.clientY, height: config.diagnosticsHeight,
      maxHeight: Math.min(520, config.diagnosticsHeight + room / 0.88)
    };
    event.preventDefault?.();
    event.stopPropagation?.();
  });
  const resizeTo = value => {
    config.diagnosticsHeight = Math.max(100, Math.min(520, Math.round(value)));
    logView.style.height = config.diagnosticsHeight + "px";
  };
  const onDiagnosticsMove = event => {
    if (!diagnosticsResize) return;
    // A fixed drag-start limit prevents a jumping/oscillating bottom border.
    const requested = diagnosticsResize.height + (event.clientY - diagnosticsResize.y) / 0.88;
    resizeTo(Math.min(requested, diagnosticsResize.maxHeight));
  };
  const endDiagnosticsResize = () => { if (diagnosticsResize) { diagnosticsResize = null; save(); } };
  resizeHandle.addEventListener("keydown", event => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault?.();
    event.stopPropagation?.();
    resizeTo(config.diagnosticsHeight + (event.key === "ArrowDown" ? 24 : -24));
    save();
  });
  document.addEventListener("pointermove", onDiagnosticsMove);
  document.addEventListener("pointerup", endDiagnosticsResize);
  document.addEventListener("pointercancel", endDiagnosticsResize);

  // Main header and compact status view both act as drag handles.
  // Pointerdown on the restore/minimize/close buttons must not start dragging.
  let moving = null;
  const onMove = event => {
    if (!moving) return;
    const rect = host.getBoundingClientRect();
    const maxX = Math.max(6, window.innerWidth - rect.width - 6);
    const maxY = Math.max(6, window.innerHeight - rect.height - 6);
    host.style.left = Math.max(6, Math.min(maxX, event.clientX - moving.dx)) + "px";
    host.style.top = Math.max(6, Math.min(maxY, event.clientY - moving.dy)) + "px";
  };
  const onUp = () => { moving = null; };
  const startDrag = event => {
    if (event.target?.closest?.("button")) return;
    if (event.button != null && event.button !== 0) return;
    const rect = host.getBoundingClientRect();
    moving = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    host.style.right = "auto";
    event.preventDefault?.();
  };
  el("ad-head").addEventListener("pointerdown", startDrag);
  el("ad-mini-panel").addEventListener("pointerdown", startDrag);
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);

  function stop() {
    if (state.destroyed) return;
    disconnect();
    state.destroyed = true;
    if (ticker) clearInterval(ticker);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    document.removeEventListener("pointermove", onDiagnosticsMove);
    document.removeEventListener("pointerup", endDiagnosticsResize);
    document.removeEventListener("pointercancel", endDiagnosticsResize);
    host.remove();
    try { delete window[NAME]; } catch { window[NAME] = undefined; }
    console.info("[AutoDelete] Stopped. Dashboard removed.");
  }
  el("ad-close").addEventListener("click", stop);
  const controller = {
    get version() { return VERSION; },
    get running() { return state.ready && state.enabled && !state.destroyed; },
    get connected() { return state.ready; },
    open() { showPanel(); },
    hide() { minimizePanel(); },
    minimize() { minimizePanel(); },
    openDiagnostics() {
      showPanel();
      el("ad-diagnostics").open = true;
    },
    status() {
      const snapshot = {
        ready: state.ready, enabled: state.enabled, error: state.error, monitor: state.monitor,
        serverDelaySeconds: config.serverDelay, dmDelaySeconds: config.dmDelay,
        scope: config.scope,
        filteredProxyExports: hooks?.ignoredProxies ?? 0, pending: state.pending.size,
        requests: state.requests, deleted: state.deleted, failed: state.failed, skipped: state.skipped,
        detected: state.detected,
        ownEvents: state.telemetry.ownEvents,
        provisionalEvents: state.telemetry.provisional,
        updateEvents: state.telemetry.updates,
        cacheCandidates: state.telemetry.cacheCandidates,
        confirmedScheduled: state.telemetry.confirmed,
        ageRejected: state.telemetry.ageRejected,
        snowflakeRecovered: state.telemetry.snowflakeRecovered,
        nonceRecovered: state.telemetry.nonceRecovered,
        lastAgeRejectionReason: state.telemetry.lastAgeRejectionReason,
        lastRejectedAgeSeconds: state.telemetry.lastRejectedAgeSeconds,
        invalidChannel: state.telemetry.invalidChannel,
        lastOwnEventAt: state.telemetry.lastOwnEventAt ?
          new Date(state.telemetry.lastOwnEventAt).toLocaleTimeString() : "none",
        excludedDms: config.excludedDms.length, excludedServers: config.excludedGuilds.length,
        metricsNote: "deleted = observed MESSAGE_DELETE events after attempted calls; 0 can mean missing event coverage; requests are attempts only"
      };
      console.table(snapshot);
      return snapshot;
    },
    setDelay, setServerDelay, setDmDelay, setScope, excludeDm: (id,on=true)=>exclude("dm",id,on), excludeServer: (id,on=true)=>exclude("servers",id,on), pause, resume, retry: connect, stop
  };
  Object.defineProperty(window, NAME, { value: controller, configurable: true });
  ticker = setInterval(() => { scanCache(); render(); }, 500);
  render();
  connect();