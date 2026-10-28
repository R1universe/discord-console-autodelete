/*
 * Discord AutoDelete v3.15 — draggable minimized status window
 * This is NOT a supported Discord API integration. Self-bots can result in bans.
 * No token extraction, credential access, external code or network requests.
 * Does not read, log or store the contents of messages.
 */
(() => {
  "use strict";

  const NAME = "DiscordAutoDelete";
  const HOST_ID = "discord-autodelete-v2";
  const SETTINGS_KEY = "discord-autodelete-ui-v2";
  const VERSION = "3.15.0";
  const validId = value => /^\d{15,22}$/.test(String(value ?? ""));
  const validDelay = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 86400;
  const scopes = new Set(["all", "servers", "dm"]);

  if (window[NAME]?.open) {
    window[NAME].open();
    console.info("[AutoDelete] Already installed in this tab. Reopened the panel.");
    return;
  }
  if (location.hostname !== "discord.com" && !location.hostname.endsWith(".discord.com")) {
    console.error("[AutoDelete] Open https://discord.com/app first.");
    return;
  }

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch {}
  // Migrate the previous shared delay into both independent settings.
  const legacyDelay = validDelay(saved.delay) ? Number(saved.delay) : 10;
  const config = {
    serverDelay: validDelay(saved.serverDelay) ? Number(saved.serverDelay) : legacyDelay,
    dmDelay: validDelay(saved.dmDelay) ? Number(saved.dmDelay) : legacyDelay,
    scope: scopes.has(saved.scope) ? saved.scope : "all",
    excludedDms: Array.isArray(saved.excludedDms) ? [...new Set(saved.excludedDms.filter(validId).map(String))].slice(0, 300) : [],
    excludedGuilds: Array.isArray(saved.excludedGuilds) ? [...new Set(saved.excludedGuilds.filter(validId).map(String))].slice(0, 300) : []
  };
  const state = {
    ready: false, enabled: false, error: "", pending: new Map(),
    requests: 0, deleted: 0, failed: 0, skipped: 0, detected: 0, processed: new Set(), processedNonces: new Set(),
    attemptedIds: new Set(), countedDeleted: new Set(), cacheSeen: new Map(), monitor: "",
    accountId: null, connected: null, recent: [], destroyed: false
  };
  let ticker = null;
  let hooks = null;
  let pickerKind = null;

  function save() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(config)); } catch {}
  }

  // A Shadow DOM keeps the controls isolated from Discord's CSS.
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "position:fixed;z-index:2147483000;right:24px;top:86px;";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = [
    /* v3.10 deep graphite glass: blurred Discord-like surfaces, quiet futuristic lines */
    ":host{all:initial;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;color:#eef1f4;font-size:13px}",
    "*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:disabled{opacity:.46;cursor:not-allowed}",
    ".panel{--ad-bg:#0b0d10;--ad-surface:#171b20;--ad-hover:#20262d;--ad-border:#2b3138;--ad-text:#eef1f4;--ad-muted:#a5adb7;--ad-dim:#88929f;--ad-accent:#6f7cff;--ad-accent-hover:#8390ff;--ad-ring:#6879ff44;width:370px;max-width:calc(100vw - 24px);max-height:calc(100vh - 110px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:#404850 transparent;background:radial-gradient(ellipse 120% 65% at 95% -15%,#6f7cff09,transparent 67%),linear-gradient(168deg,#111418 0%,#0b0d10 75%);color:var(--ad-text);border:1px solid #2b3138;border-radius:15px;box-shadow:inset 0 1px 0 #ffffff0a,0 24px 55px #000a,0 0 0 1px #0006;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);transition:background .22s,border-color .22s,box-shadow .22s}",
    ".panel.is-active{--ad-bg:#0d1511;--ad-surface:#18241f;--ad-hover:#203329;--ad-border:#2b6344;--ad-accent:#35c878;--ad-accent-hover:#48d58c;--ad-ring:#35c87844;background:radial-gradient(ellipse 115% 70% at 96% -12%,#35c87812,transparent 65%),linear-gradient(164deg,#111c16 0%,#0b1210 78%);border-color:#2b8a57;box-shadow:inset 0 1px 0 #b7ffcc0e,0 24px 58px #000a,0 0 0 1px #2b8a5722,0 0 32px #35c8781a}",
    ".panel.is-error{border-color:#98505a}",
    ".head{position:relative;padding:15px 16px 14px;background:linear-gradient(120deg,#171b21a2,#101317a3);border-bottom:1px solid #2a303a;cursor:grab;touch-action:none;user-select:none}",
    ".head:after{content:'';position:absolute;bottom:-1px;left:17px;right:17px;height:1px;background:linear-gradient(90deg,transparent,#6f7cff1e,transparent);pointer-events:none}",
    ".panel.is-active .head{background:linear-gradient(120deg,#15261da5,#0e1813b0);border-bottom-color:#295339}",
    ".panel.is-active .head:after{background:linear-gradient(90deg,transparent,#35c8783b,transparent)}",
    ".top,.brand,.head-buttons,.fieldrow,.delay{display:flex;align-items:center;gap:8px}.top,.fieldrow{justify-content:space-between}",
    ".brand-icon{display:grid;place-items:center;flex:none;width:35px;height:35px;border-radius:11px;background:linear-gradient(145deg,#737fff1a,#4656de11);border:1px solid #6f7cff38;box-shadow:inset 0 1px 0 #ffffff0d;color:#aeb7ff;font-size:20px}",
    ".panel.is-active .brand-icon{color:#91ecc0;background:linear-gradient(140deg,#35c8781c,#17683a14);border-color:#35c87852;box-shadow:inset 0 1px 0 #ffffff08,0 0 18px #35c87814}",
    "h1{font-size:15px;line-height:1.2;margin:0;font-weight:730;letter-spacing:-.25px}.muted{color:var(--ad-muted);font-size:11px;margin-top:3px}.version{color:var(--ad-dim);font-size:10px;font-weight:600}",
    ".head-buttons{gap:5px}.mini{min-width:27px;height:27px;padding:0 6px;border:1px solid #39424d;border-radius:8px;color:#aeb7c1;background:linear-gradient(135deg,#21262b6d,#161b216d);box-shadow:inset 0 1px 0 #ffffff06}",
    ".mini:hover{background:#2b323a;color:#fff;border-color:#53606e}.mini:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--ad-accent);outline-offset:2px}",
    ".body{padding:16px 16px 13px}.error-alert{border:1px solid #98505a;background:#4b232733;color:#fac9cf;border-radius:9px;padding:9px 11px;font-size:11px;line-height:1.5;margin:0 0 12px;overflow-wrap:anywhere}",
    ".limited-alert{color:#dfc68e;font-size:11px;line-height:1.5;margin-bottom:10px}",
    ".primary{display:block;width:100%;border:1px solid #8892ff52;padding:14px 12px;border-radius:11px;background:linear-gradient(135deg,#7885ff,#5f6cf1);color:#fff;font-weight:740;font-size:12px;letter-spacing:.12px;box-shadow:inset 0 1px 0 #ffffff2c,0 6px 18px #515cfc15;transition:transform .18s,background .18s,box-shadow .2s,border-color .18s;margin:0 0 16px}",
    ".primary:hover:not(:disabled){background:linear-gradient(135deg,#8793ff,#6d79fa);box-shadow:inset 0 1px 0 #ffffff34,0 8px 25px #6471ff2a}.primary:active:not(:disabled){transform:translateY(1px)}",
    ".panel.is-active .primary{background:linear-gradient(135deg,#238f58,#176e48);border-color:#35c87862;color:#f3fff7;box-shadow:inset 0 1px 0 #c5ffd01e,0 0 22px #35c8781d}",
    ".panel.is-active .primary:hover:not(:disabled){background:linear-gradient(135deg,#2cad6a,#1b8353)}",
    ".reconnect{width:100%;border:1px solid #3c4650;background:#1d2329;padding:9px;border-radius:9px;color:#d9e0e6;margin:0 0 12px}",
    ".field{margin-bottom:15px}.fieldrow{margin-bottom:8px}label{font-weight:660;font-size:12px;color:#e4e9ec}.hint{font-size:10px;color:var(--ad-dim)}",
    ".delay{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;align-items:stretch}.value{display:block;width:100%;min-width:0;padding:11px 12px;border:1px solid #364049;background:linear-gradient(140deg,#1a1f25bd,#15191ec2);color:var(--ad-text);border-radius:9px;outline:none;line-height:1.2;font-variant-numeric:tabular-nums;box-shadow:inset 0 1px 0 #ffffff08}",
    ".value:focus{border-color:var(--ad-accent);box-shadow:0 0 0 2px var(--ad-ring)}",
    ".presets{display:contents}.preset{display:block;width:100%;min-width:0;border:1px solid #35404a;background:linear-gradient(150deg,#1c222895,#151a20a1);color:#adb7c1;border-radius:9px;padding:11px 0;font-size:11px;line-height:1.2;box-shadow:inset 0 1px 0 #ffffff06}",
    ".preset:hover{background:var(--ad-hover);color:#fff}.preset.selected{background:#6f7cff18;color:#dfe3ff;border-color:#7784ff;box-shadow:inset 0 1px 0 #ffffff07,0 0 0 1px #6f7cff12}",
    ".panel.is-active .preset.selected{background:#35c87814;color:#d4f8e1;border-color:#35c8787e;box-shadow:0 0 12px #35c8780e}",
    ".scope-switch{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:4px;border:1px solid #2b343d;border-radius:12px;background:linear-gradient(160deg,#11161b97,#171b1fa2);box-shadow:inset 0 1px 3px #0005}",
    ".scope-btn{border:1px solid transparent;background:transparent;color:#aeb8c2;border-radius:9px;padding:10px 3px;font-size:11px;font-weight:670;line-height:1.3;white-space:nowrap}",
    ".scope-btn:hover{background:#27303a66;color:#fff}.scope-btn.selected{background:linear-gradient(140deg,#333b60,#242e53);color:#f0f2ff;border-color:#7685ff5e;box-shadow:inset 0 1px 0 #ffffff14,0 3px 12px #0005,0 0 13px #6f7cff10}",
    ".panel.is-active .scope-switch{background:linear-gradient(160deg,#101d16,#17251b);border-color:#2a6345}.panel.is-active .scope-btn.selected{background:linear-gradient(140deg,#28583d,#183b29);color:#e5fff0;border-color:#37b8777d;box-shadow:inset 0 1px 0 #ffffff0f,0 2px 12px #0004,0 0 15px #35c87812}",
    ".statrow{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:14px}",
    ".stat{background:linear-gradient(150deg,#1b2026a1,#12171ca1);border:1px solid #303944;padding:11px 5px;border-radius:11px;text-align:center;box-shadow:inset 0 1px 0 #ffffff08}",
    ".panel.is-active .stat{background:linear-gradient(150deg,#1b30249f,#101b15ae);border-color:#2e5d42}",
    ".stat strong{display:block;font-size:20px;line-height:1.15;letter-spacing:-.5px;color:#f3f6f8;font-variant-numeric:tabular-nums}.stat span{display:block;margin-top:6px;font-size:10px;font-weight:500;color:var(--ad-muted)}",
    ".footer{border-top:1px solid #2b323c;background:linear-gradient(140deg,#14191eb2,#101418ba);padding:0 16px}.panel.is-active .footer{border-top-color:#2c543d;background:linear-gradient(140deg,#13251b97,#101b14ad)}",
    ".diagnostics{font-size:11px}.diagnostics>summary{display:flex;align-items:center;justify-content:space-between;padding:12px 0;color:#bac3cd;cursor:pointer;list-style:none;font-weight:610;user-select:none}",
    ".diagnostics>summary::-webkit-details-marker{display:none}.diagnostics>summary:after{content:'⌄';font-size:17px;line-height:12px;color:#a8b4bd;transform:translateY(-1px)}.diagnostics[open]>summary:after{transform:rotate(180deg)}",
    ".diag-body{padding:2px 0 14px;border-top:1px solid #303944}.diag-title{margin:10px 0 7px;font-size:10px;letter-spacing:.4px;font-weight:700;color:#b2bfca}",
    ".loglist{max-height:135px;overflow:auto;scrollbar-width:thin;color:#aeb9c1;font-family:ui-monospace,SFMono-Regular,monospace;font-size:10px}",
    ".logitem{padding:3px 0;overflow-wrap:anywhere;line-height:1.45}.logitem .time{color:#87929d;margin-right:5px}.logitem.bad{color:#f1a9af}.logitem.good{color:#94dab6}",
    ".footer button.diag-action{border:1px solid #33404a;background:linear-gradient(140deg,#20272f,#171e25);color:#d8e0e7;border-radius:9px;padding:10px;width:100%;margin-top:12px}.footer button.diag-action:hover{background:#28333b}",
    "@media(max-width:500px){.panel{max-width:calc(100vw - 16px)}.body{padding:14px}.head{padding:13px 14px}.footer{padding:0 14px}}",
    /* v3.12: transparent frosted glass with contrasting blurple and emerald states */,
    ".panel{width:392px;max-width:calc(100vw - 24px);border-radius:24px;border:1px solid #d6e0ff5e;background:radial-gradient(ellipse at 80% -15%,#8598ff29,transparent 75%),linear-gradient(150deg,#2d3857a1,#12192ba7);backdrop-filter:blur(28px) saturate(165%);-webkit-backdrop-filter:blur(28px) saturate(165%);box-shadow:inset 0 1px 0 #ffffff5b,0 25px 60px #0009,0 0 28px #7288ff1a;transition:background .2s,border-color .2s,box-shadow .2s}",
    ".panel.is-active{border-color:#90ffd18f;background:radial-gradient(ellipse at 85% -15%,#4affe43a,transparent 76%),linear-gradient(150deg,#193c3aa3,#0b1920a7);box-shadow:inset 0 1px 0 #effff370,0 25px 62px #0009,0 0 31px #40ffb93e}",
    ".head{border-radius:23px 23px 0 0;background:linear-gradient(130deg,#cfddff16,#344b7512);border-bottom:1px solid #e1e8ff35;padding:17px 17px 15px}",
    ".panel.is-active .head{background:linear-gradient(130deg,#b7ffe51a,#2f845b16);border-bottom-color:#bbffe04a}",
    ".brand-icon{height:37px;width:37px;border-radius:12px;background:linear-gradient(140deg,#a3b2ff89,#4045dcab);border:1px solid #d5ddff74;box-shadow:inset 0 1px 0 #fff7,0 0 18px #6b7aff69;color:white}",
    ".panel.is-active .brand-icon{background:linear-gradient(140deg,#75ffd09e,#0ba371ac);border-color:#c3ffe499;box-shadow:inset 0 1px 0 #fff7,0 0 20px #48ffa264}",
    ".mini{border-radius:11px;border-color:#cedbff64;background:linear-gradient(140deg,#abc6ff2a,#3e528143);box-shadow:inset 0 1px 0 #ffffff3e;color:#f2f5ff}",
    ".body{padding:16px 17px 13px}",
    ".primary{border-radius:17px;padding:15px 12px;border:1px solid #e2e7ff99;background:radial-gradient(ellipse at 25% 0%,#eff1ff4f,transparent 75%),linear-gradient(130deg,#9ba6ffaf,#5264f8b3);box-shadow:inset 0 1px 0 #fff7,0 0 22px #677bff50,0 8px 25px #5364ff2a;font-size:13px}",
    ".panel.is-active .primary{background:radial-gradient(ellipse at 25% 0%,#d0fff36d,transparent 72%),linear-gradient(130deg,#3ad9b1b8,#0a906cae);border-color:#daffe8b3;box-shadow:inset 0 1px 0 #fff7,0 0 25px #4affb957}",
    ".scope-switch{border-radius:16px;background:linear-gradient(145deg,#a7baff20,#2639625c);border:1px solid #bfceff5e;padding:4px;box-shadow:inset 0 1px 0 #fff3}",
    ".scope-btn{border-radius:12px;padding:12px 3px;color:#d0d9ee}",
    ".scope-btn.selected{border-color:#b5c4ff8d;background:linear-gradient(145deg,#929eff89,#485ce484);box-shadow:inset 0 1px 0 #fff6,0 0 15px #788aff48;color:white}",
    ".panel.is-active .scope-switch{border-color:#9bffdc70;background:linear-gradient(145deg,#51f3b623,#214e4956)}",
    ".panel.is-active .scope-btn.selected{border-color:#b7ffe48b;background:linear-gradient(145deg,#78fbd27b,#008d687b);box-shadow:inset 0 1px 0 #fff6,0 0 15px #42f8b34e}",
    /* Controls and counter cards are deliberately icon-free. */,
    ".field{margin-bottom:16px}.fieldrow{margin-bottom:9px}.fieldrow label{color:#f3f6ff}.hint{color:#b5c0da}",
    ".delay{gap:8px}.value,.preset{min-height:44px;border-radius:13px;border:1px solid #becfff62;background:linear-gradient(150deg,#a4baff27,#26385f5e);box-shadow:inset 0 1px 0 #ffffff32,0 4px 15px #0002;color:#f6f7ff}",
    ".value{font-size:14px;padding:11px 13px}.value:focus{border-color:#e3e9ff;box-shadow:0 0 0 2px #9eadff5f,inset 0 1px 0 #fff7}",
    ".preset{font-size:12px}.preset:hover{background:#b7c7ff4b}.preset.selected{background:linear-gradient(140deg,#9baafc69,#5268d47d);border-color:#bdc7ff89;color:#fff;box-shadow:inset 0 1px 0 #fff5,0 0 13px #758bff3b}",
    ".panel.is-active .value,.panel.is-active .preset{background:linear-gradient(145deg,#9effd02b,#205f5963);border-color:#a9ffe06f}",
    ".panel.is-active .preset.selected{background:linear-gradient(140deg,#86ffd586,#1b92777e);border-color:#cbffe39f;color:white;box-shadow:inset 0 1px 0 #fff6,0 0 15px #48ffbe4e}",
    ".statrow{gap:8px;margin-top:16px}.stat{min-height:78px;border-radius:15px;background:linear-gradient(150deg,#b3c6fb2b,#1f305470);border:1px solid #c5d2ff5c;box-shadow:inset 0 1px 0 #ffffff36,0 6px 14px #0002;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:13px 4px}",
    ".stat strong{font-size:23px;line-height:1.08;font-weight:750;color:#fff}.stat span{font-size:11px;margin-top:0;color:#d3d9eb}.stat svg,.stat img,.stat i{display:none!important}",
    ".panel.is-active .stat{background:linear-gradient(155deg,#83ffc342,#1449408e);border-color:#b5ffd86e}.panel.is-active .stat span{color:#cbf4e6}",
    ".footer{border-top:1px solid #d3deff3e;padding:0 16px;border-radius:0 0 23px 23px;background:linear-gradient(150deg,#c0d3ff15,#263a6355)}",
    ".panel.is-active .footer{border-top-color:#b5ffde54;background:linear-gradient(150deg,#a4ffcf1a,#154c4566)}",
    ".diagnostics>summary{padding:14px 1px;color:#e3e9fa;font-weight:650}.diagnostics>summary:after{color:#e9eeff}",
    ".footer button.diag-action{border-radius:13px;border-color:#b3c8ff5e;background:linear-gradient(140deg,#bac9ff29,#283c6266);box-shadow:inset 0 1px 0 #fff4}",
    ".fieldrow{justify-content:center;text-align:center}.fieldrow label{text-align:center}.brand-by{font-size:10px;color:var(--ad-muted);margin-top:3px;font-weight:500}",
    ".delay{grid-template-columns:minmax(0,.9fr) minmax(0,1.4fr) minmax(0,.9fr)}.exclude-btn{font-size:10px;line-height:1.3;padding:10px 3px;white-space:normal;overflow-wrap:anywhere}",
    ".picker{border:1px solid var(--ad-border);border-radius:14px;background:linear-gradient(145deg,#192d2bb2,#0b191cba);padding:12px;margin:2px 0 16px;box-shadow:inset 0 1px 0 #ffffff13}.picker[hidden]{display:none}",
    ".picker-title{text-align:center;font-weight:700;font-size:12px;margin:0 0 9px}.picker-note{font-size:10px;color:#c9d1d9;line-height:1.5;margin:6px 0}",
    ".picker-list{max-height:180px;overflow-y:auto;display:grid;gap:4px}.picker-option{display:flex;align-items:center;gap:8px;min-width:0;font-size:11px;padding:7px 6px;border:1px solid #ffffff19;border-radius:9px;overflow-wrap:anywhere}",
    ".picker-option input{accent-color:#35c878;flex:none}.picker-action{padding:9px 12px;margin:4px 0 7px;min-height:36px;width:100%;font-size:11px}",
    ".picker-input-row{display:flex;gap:7px;margin-top:8px}.picker-input-row input{min-width:0;width:100%;font-size:11px}.picker-input-row button{width:auto;white-space:nowrap;padding:8px 10px}",
    /* Minimized, draggable frosted-glass status view. */
    ".mini-panel{position:relative;width:392px;max-width:calc(100vw - 24px);padding:14px 10px 11px;border:1px solid #b3ceff7b;border-radius:18px;background:radial-gradient(ellipse at 80% -20%,#7d9aff2b,transparent 78%),linear-gradient(150deg,#273251bd,#101824be);backdrop-filter:blur(25px) saturate(155%);-webkit-backdrop-filter:blur(25px) saturate(155%);box-shadow:inset 0 1px 0 #ffffff4e,0 12px 32px #0009,0 0 19px #6f7cff20;color:#eef1f4;cursor:grab;touch-action:none;user-select:none}",
    ".mini-panel.is-active{border-color:#9cffe099;background:radial-gradient(ellipse at 85% -25%,#4affe43a,transparent 78%),linear-gradient(155deg,#1c4943be,#0d2524c0);box-shadow:inset 0 1px 0 #ffffff66,0 12px 32px #0009,0 0 20px #40ffb93b}",
    ".mini-panel.is-error{border-color:#f2a8b7}.mini-panel:active{cursor:grabbing}",
    ".mini-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-right:10px}",
    ".mini-stat{min-width:0;text-align:center;border-radius:10px;border:1px solid #e5ebff2b;background:#ffffff0e;padding:8px 2px 7px;display:flex;flex-direction:column;gap:3px;align-items:center}",
    ".mini-panel.is-active .mini-stat{border-color:#baffdb37;background:#72ffd414}",
    ".mini-stat strong{font-size:18px;line-height:1.1;color:#f7fffa;font-variant-numeric:tabular-nums}.mini-stat span{font-size:9px;color:#d7e4e8;font-weight:600;letter-spacing:-.1px}",
    ".mini-restore{position:absolute;top:5px;right:5px;border:1px solid #d5edff44;border-radius:7px;background:#ffffff1a;color:#edf5ff;font-size:13px;line-height:17px;width:22px;height:22px;padding:0;cursor:pointer}.mini-restore:hover{background:#ffffff2e}.mini-restore:focus-visible{outline:2px solid #9dffdb;outline-offset:2px}",
    ".mini-panel[hidden]{display:none!important}",
    /* One 12% scale reduction in both dimensions; mini and full retain equal widths. */
    ".ad-shell{zoom:.88}",
    "@media(prefers-reduced-motion:reduce){.panel,.primary{transition:none}}"
  ].join("\n");
  shadow.appendChild(style);

  const root = document.createElement("div");
  root.className = "ad-shell";
  root.innerHTML = [
    '<section class="panel" id="ad-panel" role="region" aria-label="Discord AutoDelete controls">',
      '<div class="head" id="ad-head">',
        '<div class="top">',
          '<div class="brand"><div class="brand-icon">◷</div><div><h1>AutoDelete <span class="version">v3.15</span></h1><div class="brand-by">by Archivarius</div></div></div>',
          '<div class="head-buttons"><button class="mini" id="ad-min" type="button" title="Minimize" aria-label="Minimize">−</button><button class="mini" id="ad-close" type="button" title="Stop and close" aria-label="Close">×</button></div>',
        '</div>',
      '</div>',
      '<div class="body">',
        '<div class="error-alert" id="ad-error" role="alert" style="display:none"></div>',
        '<div class="limited-alert" id="ad-limited" style="display:none">Limited coverage: current channel only</div>',
        '<button class="primary" id="ad-toggle" disabled>Checking connection…</button>',
        '<button class="reconnect" id="ad-retry" style="display:none">Retry connection</button>',
        '<div class="field"><div class="fieldrow"><label id="ad-scope-label">Where to delete</label></div>',
          '<div class="scope-switch" role="group" aria-labelledby="ad-scope-label">',
            '<button type="button" class="scope-btn" data-scope="all" aria-pressed="true">Everywhere</button>',
            '<button type="button" class="scope-btn" data-scope="servers" aria-pressed="false">Servers</button>',
            '<button type="button" class="scope-btn" data-scope="dm" aria-pressed="false">DMs</button>',
          '</div></div>',
        '<div class="field" id="ad-dm-block"><div class="fieldrow"><label for="ad-dm-delay">DMs · deletion delay</label></div>',
          '<div class="delay"><input class="value" id="ad-dm-delay" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" spellcheck="false" title="Type seconds, then press Enter or click outside to save" aria-label="DM deletion delay in seconds"><div class="presets">',
          '<button type="button" class="preset exclude-btn" id="ad-exclude-dm" aria-expanded="false">Excluded DMs ›</button><button class="preset" data-delay-for="dm" data-delay="60">60s</button>',
        '</div></div></div>',
        '<div class="field" id="ad-server-block"><div class="fieldrow"><label for="ad-server-delay">Servers · deletion delay</label></div>',
          '<div class="delay"><input class="value" id="ad-server-delay" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" spellcheck="false" title="Type seconds, then press Enter or click outside to save" aria-label="Server deletion delay in seconds"><div class="presets">',
          '<button type="button" class="preset exclude-btn" id="ad-exclude-servers" aria-expanded="false">Excluded Servers ›</button><button class="preset" data-delay-for="servers" data-delay="60">60s</button>',
        '</div></div></div>',
        '<section class="picker" id="ad-picker" hidden aria-label="Exclusion picker">',
          '<div class="picker-title" id="ad-picker-title"></div>',
          '<div class="picker-note" id="ad-picker-note">Select chats or servers to keep out of automatic deletion. Existing queued timers in excluded locations will be cancelled.</div>',
          '<button type="button" class="preset picker-action" id="ad-exclude-current">Exclude current conversation / server</button>',
          '<div class="picker-list" id="ad-picker-list"></div>',
          '<div class="picker-input-row"><input class="value" id="ad-exclude-id" inputmode="numeric" type="text" autocomplete="off" placeholder="Channel / server ID" aria-label="ID to exclude"><button type="button" class="preset" id="ad-add-exclude">Add ID</button></div>',
          '<div class="picker-note">Only identifiers are stored locally. If the list is incomplete, open that chat/server and use Exclude current, or enter its ID.</div>',
        '</section>',
        '<div class="statrow"><div class="stat"><strong id="ad-pending">0</strong><span>Queued</span></div>',
        '<div class="stat" title="Deletion events observed after an AutoDelete attempt; may miss deletion confirmations"><strong id="ad-deleted">0</strong><span>Deleted</span></div>',
        '<div class="stat" title="Errors caught by this script; background HTTP failures may not appear"><strong id="ad-failed">0</strong><span>Errors</span></div></div>',
      '</div>',
      '<div class="footer"><details class="diagnostics" id="ad-diagnostics">',
        '<summary>Diagnostics</summary>',
        '<div class="diag-body">',
          '<div class="loglist" id="ad-logs" aria-live="polite"></div>',
          '<button class="diag-action" type="button" id="ad-retry-foot">Reconnect modules</button>',
        '</div>',
      '</details></div>',
    '</section>',
    '<aside class="mini-panel" id="ad-mini-panel" hidden role="region" aria-label="Minimized AutoDelete status">',
      '<button type="button" class="mini-restore" id="ad-restore" title="Expand AutoDelete" aria-label="Expand AutoDelete">↗</button>',
      '<div class="mini-stats">',
        '<div class="mini-stat"><strong id="ad-mini-queued">0</strong><span>Queued</span></div>',
        '<div class="mini-stat" title="Observed deletion events, not guaranteed server confirmations"><strong id="ad-mini-deleted">0</strong><span>Deleted</span></div>',
        '<div class="mini-stat" title="Caught errors; background failures may not appear"><strong id="ad-mini-errors">0</strong><span>Errors</span></div>',
      '</div>',
    '</aside>'
  ].join("");
  shadow.appendChild(root);
  const el = id => shadow.getElementById(id);

  function notify(message, tone = "") {
    const entry = { time: new Date().toLocaleTimeString(), message, tone };
    state.recent.unshift(entry);
    if (state.recent.length > 18) state.recent.length = 18;
    const list = el("ad-logs");
    if (list) {
      list.replaceChildren();
      state.recent.slice(0, 6).forEach(item => {
        const line = document.createElement("div");
        line.className = "logitem " + item.tone;
        const date = document.createElement("span");
        date.className = "time";
        date.textContent = item.time;
        const msg = document.createElement("span");
        msg.textContent = item.message;
        line.append(date, msg);
        list.appendChild(line);
      });
    }
    if (tone === "bad") console.warn("[AutoDelete] " + message);
    else console.info("[AutoDelete] " + message);
  }

  function formatRemaining(milliseconds) {
    const s = Math.max(0, Math.ceil(milliseconds / 1000));
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60), seconds = s % 60;
    return m + "m " + String(seconds).padStart(2, "0") + "s";
  }
  // Render the countdown beside confirmed own messages, not inside Diagnostics.
  // Discord virtualizes message DOM nodes; the existing 500ms tick reattaches badges.
  // Only message IDs are consulted. No message content is read.
  const inlineBadges = new Map();
  function clearInlineBadge(id) {
    const entry = inlineBadges.get(id);
    if (!entry) return;
    entry.badge.remove();
    inlineBadges.delete(id);
  }
  function renderInlineTimers() {
    for (const [id, entry] of inlineBadges) {
      if (!state.pending.has(id) || entry.target.isConnected === false ||
          entry.badge.parentElement !== entry.target) clearInlineBadge(id);
    }
    if (!state.pending.size) return;
    const visible = document.querySelectorAll?.('[id^="message-content-"]') ?? [];
    for (const target of visible) {
      const id = String(target.id ?? "").slice("message-content-".length);
      if (!validId(id)) continue;
      const job = state.pending.get(id);
      if (!job || target.isConnected === false) continue;
      let entry = inlineBadges.get(id);
      if (!entry || entry.target !== target) {
        clearInlineBadge(id);
        const badge = document.createElement("span");
        badge.className = "discord-autodelete-inline-timer";
        badge.style.cssText = "display:inline-flex;align-items:center;margin-inline-start:8px;" +
          "padding:1px 6px;border:1px solid #82dbb37a;border-radius:6px;" +
          "background:#123d32a8;color:#b7ffe0;font:600 11px/1.5 Inter,ui-sans-serif,Arial,sans-serif;" +
          "white-space:nowrap;vertical-align:middle;pointer-events:none;user-select:none";
        badge.setAttribute("aria-live", "off");
        target.appendChild(badge);
        entry = { target, badge };
        inlineBadges.set(id, entry);
      }
      const remaining = formatRemaining(job.deadline - Date.now());
      const label = "⏱ " + remaining;
      if (entry.badge.textContent !== label) entry.badge.textContent = label;
      entry.badge.title = "AutoDelete deletion attempt in " + remaining + " (not guaranteed)";
    }
  }

  // Track edits independently of ShadowRoot.activeElement to avoid focus
  // races caused by the hosting Discord client.
  const editingDelay = new Set();

  function render() {
    if (state.destroyed) return;
    const isActive = state.ready && state.enabled && !state.error;
    const panel = el("ad-panel");
    panel.classList.toggle("is-active", isActive);
    panel.classList.toggle("is-error", Boolean(state.error));
    const mini = el("ad-mini-panel");
    mini.classList.toggle("is-active", isActive);
    mini.classList.toggle("is-error", Boolean(state.error));
    // Compact by default. Connection failures remain visible in the main panel.
    el("ad-error").style.display = state.error ? "block" : "none";
    el("ad-error").textContent = state.error ? "Connection failed: " + state.error : "";
    const limited = state.ready && state.monitor === "Open-channel cache only";
    el("ad-limited").style.display = limited ? "block" : "none";
    el("ad-toggle").disabled = !state.ready;
    el("ad-toggle").textContent = state.enabled ? "Disable" : "Enable";
    el("ad-toggle").setAttribute("title", state.enabled ?
      "Disable and cancel pending timers" : "Enable auto-delete");
    el("ad-toggle").className = "primary" + (state.enabled ? " stop" : "");
    el("ad-retry").style.display = state.ready ? "none" : "block";
    // Discord can steal focus or route typing through document handlers.
    // Explicit edit locks prevent the 500ms UI refresh from overwriting
    // partially typed values (including temporary empty strings).
    if (!editingDelay.has("servers") && shadow.activeElement !== el("ad-server-delay"))
      el("ad-server-delay").value = String(config.serverDelay);
    if (!editingDelay.has("dm") && shadow.activeElement !== el("ad-dm-delay"))
      el("ad-dm-delay").value = String(config.dmDelay);
    shadow.querySelectorAll("[data-scope]").forEach(btn => {
      const selected = btn.dataset.scope === config.scope;
      btn.classList.toggle("selected", selected);
      btn.setAttribute("aria-pressed", String(selected));
    });
    // Scope controls which timing fields are relevant. The hidden category's
    // value remains saved and is restored unchanged if the user selects it.
    // Existing queued jobs keep their original deadlines.
    el("ad-dm-block").style.display = config.scope === "servers" ? "none" : "";
    el("ad-server-block").style.display = config.scope === "dm" ? "none" : "";
    shadow.querySelectorAll("[data-delay-for]").forEach(btn => {
      const seconds = btn.dataset.delayFor === "servers" ? config.serverDelay : config.dmDelay;
      btn.classList.toggle("selected", Number(btn.dataset.delay) === seconds);
    });
    el("ad-pending").textContent = state.pending.size;
    el("ad-deleted").textContent = state.deleted;
    el("ad-exclude-dm").textContent = "Excluded DMs (" + config.excludedDms.length + ") ›";
    el("ad-exclude-servers").textContent = "Excluded Servers (" + config.excludedGuilds.length + ") ›";
    el("ad-exclude-dm").setAttribute("aria-expanded", String(pickerKind === "dm"));
    el("ad-exclude-servers").setAttribute("aria-expanded", String(pickerKind === "servers"));
    renderInlineTimers();
    el("ad-failed").textContent = state.failed;
    el("ad-mini-queued").textContent = state.pending.size;
    el("ad-mini-deleted").textContent = state.deleted;
    el("ad-mini-errors").textContent = state.failed;

  }

  function cancel(id) {
    const key = String(id ?? "");
    const job = state.pending.get(key);
    if (!job) return;
    clearTimeout(job.timer);
    state.pending.delete(key);
    render();
  }
  function clearPending() {
    for (const job of state.pending.values()) clearTimeout(job.timer);
    state.pending.clear();
    render();
  }

  // Adapted from Vencord's shouldIgnoreValue(): Discord exports i18n
  // Proxy values that return a function for ANY property name. These can
  // cache the synthesized function onto themselves, producing hundreds of
  // false candidates (see the 83 cross-family matches in audit v1.1).
  // This guard MUST run before probing methods like deleteMessage or del.
  const INVALID_PROXY_KEY = "is this a proxy that returns values for any key?";
  const lookupStats = { ignored: 0, recognizedI18n: 0, arbitraryKey: 0 };
  const ignoredExports = new WeakSet();
  function ignoreExport(value) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) return true;
    if (value === window || value === document || value === document.documentElement) return true;
    if (ignoredExports.has(value)) return true;
    try {
      const tag = value[Symbol.toStringTag];
      if (tag === "IntlMessagesProxy" || tag === "DOMTokenList") {
        ignoredExports.add(value);
        lookupStats.ignored++;
        lookupStats.recognizedI18n++;
        return true;
      }
    } catch { return true; }

    // A unique probe catches other proxies with the same behaviour. Restore
    // an *initially absent* property when the proxy caches the probe result.
    // Avoid invoking this on known translation proxies (above).
    try {
      const existed = Object.prototype.hasOwnProperty.call(value, INVALID_PROXY_KEY);
      const arbitrary = value[INVALID_PROXY_KEY];
      if (arbitrary !== undefined && !existed) {
        try { Reflect.deleteProperty(value, INVALID_PROXY_KEY); } catch {}
        ignoredExports.add(value);
        lookupStats.ignored++;
        lookupStats.arbitraryKey++;
        return true;
      }
    } catch { return true; }
    return false;
  }
  function addCandidates(cache) {
    const found = [], seen = new Set();
    const put = value => {
      if (!value || (typeof value !== "object" && typeof value !== "function") ||
          seen.has(value) || ignoreExport(value)) return;
      seen.add(value);
      found.push(value);
    };
    for (const entry of Object.values(cache)) {
      try {
        const exported = entry?.exports;
        put(exported);
        if (!exported || ignoreExport(exported)) continue;
        for (const key of Object.keys(exported)) {
          try { put(exported[key]); } catch {}
        }
      } catch {}
    }
    return found;
  }
  function choose(candidates, predicate, displayName, preference) {
    const matches = candidates.filter(item => {
      try { return predicate(item); } catch { return false; }
    });
    const preferred = matches.filter(item => {
      try { return preference?.(item); } catch { return false; }
    });
    const options = preferred.length === 1 ? preferred : matches.length === 1 ? matches : [];
    if (options.length !== 1) throw new Error(displayName + ": " + matches.length + " candidates; cannot select safely");
    return options[0];
  }
  const storeNamed = name => obj => {
    try { return Object.getPrototypeOf(obj)?.constructor?.displayName === name || obj?.constructor?.displayName === name; }
    catch { return false; }
  };

  function discover() {
    const chunk = window.webpackChunkdiscord_app;
    if (!chunk || typeof chunk.push !== "function") throw new Error("Discord's Webpack runtime is not available.");
    const runtimes = [], marker = Symbol("AutoDelete");
    try {
      chunk.push([[marker], {}, req => {
        if (req?.c && !runtimes.includes(req)) runtimes.push(req);
      }]);
      if (chunk.at(-1)?.[0]?.[0] === marker) chunk.pop();
    } catch (err) {
      throw new Error("Unable to inspect modules: " + String(err?.message ?? err));
    }
    if (!runtimes.length) throw new Error("No Webpack runtime found.");

    // Pool all caches: requiring UserStore and REST to live in the same runtime
    // is another brittle assumption. Deduplicate candidates by object identity.
    const all = [], seen = new Set();
    for (const req of runtimes) {
      for (const item of addCandidates(req.c)) {
        if (seen.has(item)) continue;
        seen.add(item);
        all.push(item);
      }
      // Optional hint from older versions. Never assume a fixed module ID.
      const special = req.c?.[73153]?.exports;
      if (special) {
        for (const item of [special, ...Object.values(special)]) {
          if (item && (typeof item === "object" || typeof item === "function") &&
              !seen.has(item) && !ignoreExport(item)) {
            seen.add(item);
            all.push(item);
          }
        }
      }
    }

    function matches(predicate) {
      return all.filter(x => { try { return Boolean(predicate(x)); } catch { return false; } });
    }
    function unique(xs) { return [...new Set(xs)]; }
    function pick(pool, prefer, label, notes) {
      const preferred = unique(pool.filter(x => { try { return Boolean(prefer?.(x)); } catch { return false; } }));
      const chosen = preferred.length === 1 ? preferred[0] : pool.length === 1 ? pool[0] : null;
      notes[label] = pool.length + " candidates" + (preferred.length ? " (" + preferred.length + " preferred)" : "");
      return chosen;
    }
    // Discord's Webpack caches can contain many *different wrapper objects*
    // that re-export the very same operation. Count distinct METHOD references,
    // not wrapper objects. If method identity is not unique, fail closed.
    function pickByMethod(pool, method, label, notes, preference) {
      const methods = new Map();
      for (const obj of pool) {
        let fn;
        try { fn = obj?.[method]; } catch { continue; }
        if (typeof fn !== "function") continue;
        if (!methods.has(fn)) methods.set(fn, []);
        methods.get(fn).push(obj);
      }
      notes[label] = pool.length + " wrappers / " + methods.size + " distinct " + method + " functions";
      if (methods.size !== 1) return null;
      const wrappers = [...methods.values()][0];
      const preferred = wrappers.filter(x => {
        try { return Boolean(preference?.(x)); } catch { return false; }
      });
      // When all wrappers have the same method reference, picking one of them
      // does not pick a different operation. Prioritize a direct HTTP owner.
      return preferred[0] ?? wrappers[0] ?? null;
    }

    const notes = { IgnoredProxies: lookupStats.ignored +
      " (" + lookupStats.recognizedI18n + " IntlMessagesProxy, " +
      lookupStats.arbitraryKey + " catch-all)" };
    const userCandidates = matches(x => typeof x?.getCurrentUser === "function" && typeof x?.getUser === "function");
    const users = pick(userCandidates, storeNamed("UserStore"), "UserStore", notes);
    const actionCandidates = matches(x => typeof x?.deleteMessage === "function");
    const actions = pickByMethod(actionCandidates, "deleteMessage",
      "MessageActions", notes, x =>
        Object.prototype.hasOwnProperty.call(x, "deleteMessage") &&
        (typeof x.startEditMessage === "function" || typeof x.editMessage === "function"));

    // Equicord and other Vencord-derived code discovers getAPIBaseURL and
    // returns mod.HTTP ?? mod. The HTTP transport can live one level DEEPER
    // than the object exporting getAPIBaseURL (the v3 search missed it).
    const httpSignatures = x => x && typeof x.del === "function" && typeof x.get === "function";
    const restDirect = matches(x => httpSignatures(x));
    const restFromWrappers = [];
    const wrappers = matches(x => typeof x?.getAPIBaseURL === "function");
    for (const wrapper of wrappers) {
      try {
        if (httpSignatures(wrapper?.HTTP)) restFromWrappers.push(wrapper.HTTP);
      } catch {}
    }
    // A REST transport exposed with getAPIBaseURL itself is preferred.
    const taggedDirect = restDirect.filter(x => typeof x.getAPIBaseURL === "function");
    const restCandidates = unique([...restFromWrappers, ...taggedDirect, ...restDirect]);
    const explicitlyTagged = unique([...restFromWrappers, ...taggedDirect]);
    const preferredTransportPool = explicitlyTagged.length ? explicitlyTagged : restCandidates;
    const rest = pickByMethod(preferredTransportPool, "del",
      "RestAPI", notes, x =>
        Object.prototype.hasOwnProperty.call(x, "del") && typeof x.getAPIBaseURL === "function");
    notes.RestAPI += "; " + wrappers.length + " getAPIBaseURL wrappers";

    const store = pick(matches(x => typeof x?.getMessages === "function" &&
      typeof x?.getMessage === "function"), storeNamed("MessageStore"), "MessageStore", notes);
    const selected = pick(matches(x => typeof x?.getChannelId === "function"),
      storeNamed("SelectedChannelStore"), "SelectedChannelStore", notes);
    const guildStore = pick(matches(x => typeof x?.getGuilds === "function" && typeof x?.getGuild === "function"),
      storeNamed("GuildStore"), "GuildStore", notes);
    const channel = pick(matches(x => typeof x?.getChannel === "function" &&
      (typeof x?.getDMFromUserId === "function" || typeof x?.getChannels === "function")),
      storeNamed("ChannelStore"), "ChannelStore", notes);

    // Keep legacy event discovery, but do not mistake a list of candidates
    // for proof that the real Discord gateway is connected.
    const dispatcherMatches = unique(matches(x =>
      typeof x?.subscribe === "function" &&
      typeof x?.unsubscribe === "function" &&
      typeof x?.dispatch === "function"));
    // Avoid subscribing to every event bus in the app. If the core Dispatcher
    // is ambiguous, rely on open-channel cache until discovery is verified.
    const preferredDispatchers = dispatcherMatches.filter(x =>
      x._subscriptions != null && typeof x.flushWaitQueue === "function");
    const dispatchers = preferredDispatchers.length === 1 ?
      preferredDispatchers : dispatcherMatches.length === 1 ? dispatcherMatches : [];
    notes.EventSources = dispatcherMatches.length + " candidates; " +
      dispatchers.length + " uniquely selected";
    const accountId = String(users?.getCurrentUser()?.id ?? "");
    if (users && validId(accountId) && (rest || actions) &&
        (dispatchers.length || (store && selected))) {
      return {
        users, actions, rest, messageStore: store, selectedChannel: selected,
        channelStore: channel, guildStore, dispatchers, accountId, moduleCount: all.length, ignoredProxies: lookupStats.ignored,
        discovery: notes
      };
    }
    throw new Error("Required modules unresolved. " +
      Object.entries(notes).map(([k,v]) => k + "=" + v).join("; ") +
      "; caches=" + runtimes.length);
  }

  function classifyChannel(msg, channelId) {
    const channel = hooks?.channelStore?.getChannel(channelId);
    const type = channel?.type;
    if (type === 1 || type === 3) return "dm"; // DM / group DM
    const guildId = msg?.guild_id ?? msg?.guildId ?? channel?.guild_id ?? channel?.guildId;
    if (guildId != null && guildId !== "") return "servers";
    // Unknown channels are never guessed to be server or DM, even in all scope.
    return null;
  }
  function scopeMatches(kind) {
    return kind != null && (config.scope === "all" || config.scope === kind);
  }
  // Discord uses a temporary local message whose id may be the client
  // nonce. The cache often lists it as SENDING without optimistic=true.
  // Never schedule deletion until a server-assigned message ID is present.
  // Confirmed by the user-provided live event trace: M2.id === nonce, SENDING;
  // M3.id !== nonce, SENT, with the same nonce.
  function isProvisional(msg, event) {
    if (!msg) return true;
    if (event?.optimistic === true || msg.optimistic === true) return true;
    const stateName = typeof msg.state === "string" ? msg.state.toUpperCase() : "";
    if (["SENDING", "QUEUED", "PENDING", "FAILED", "SEND_FAILED"].includes(stateName))
      return true;
    const id = String(msg.id ?? "");
    return msg.nonce != null && id === String(msg.nonce);
  }

  function onCreate(event) {
    if (!state.enabled || !hooks || state.destroyed) return;
    const msg = event?.message;
    if (!msg || String(msg.author?.id ?? "") !== state.accountId) return;
    if (isProvisional(msg, event)) return;
    const id = String(msg.id ?? "");
    const channelId = String(event?.channelId ?? event?.channel_id ?? msg.channel_id ?? msg.channelId ?? "");
    if (!validId(id) || !validId(channelId) || state.pending.has(id) || state.processed.has(id)) return;
    const kind = classifyChannel(msg, channelId);
    if (!scopeMatches(kind)) { state.skipped++; return; }
    const guildId = String(msg.guild_id ?? msg.guildId ?? hooks?.channelStore?.getChannel(channelId)?.guild_id ?? "");
    if ((kind === "dm" && config.excludedDms.includes(channelId)) ||
        (kind === "servers" && config.excludedGuilds.includes(guildId))) {
      state.skipped++;
      return;
    }
    const delaySeconds = kind === "servers" ? config.serverDelay : config.dmDelay;
    // Some clients emit more than one confirmed object for the same send.
    // The client nonce correlates them without reading/storing message text.
    const nonceKey = msg.nonce == null ? null : channelId + ":" + String(msg.nonce);
    if (nonceKey && state.processedNonces.has(nonceKey)) return;
    state.processed.add(id);
    if (state.processed.size > 5000) state.processed.delete(state.processed.values().next().value);
    if (nonceKey) {
      state.processedNonces.add(nonceKey);
      if (state.processedNonces.size > 5000)
        state.processedNonces.delete(state.processedNonces.values().next().value);
    }
    state.detected++;
    const deadline = Date.now() + delaySeconds * 1000;
    const timer = setTimeout(async () => {
      state.pending.delete(id);
      render();
      if (state.destroyed || !state.enabled) return;
      if (String(hooks.users.getCurrentUser()?.id ?? "") !== state.accountId) {
        state.skipped++;
        notify("Account changed — skipping deletion.", "bad");
        render();
        return;
      }
      // Count an attempt before invoking the client's delete action.
      // MessageActions may return void and perform async HTTP in the background,
      // so resolving this call is NOT a server-confirmed successful deletion.
      state.requests++;
      state.attemptedIds.add(id);
      if (state.attemptedIds.size > 1500) state.attemptedIds.delete(state.attemptedIds.values().next().value);
      try {
        if (hooks.rest) {
          await Promise.resolve(hooks.rest.del({ url: "/channels/" + channelId + "/messages/" + id }));
        } else {
          await Promise.resolve(hooks.actions.deleteMessage(channelId, id));
        }
        notify("Delete action invoked (server result not independently verified).", "good");
      } catch (err) {
        state.failed++;
        notify("Caught delete error: " + String(err?.message ?? err).slice(0, 140), "bad");
      }
      render();
    }, delaySeconds * 1000);
    state.pending.set(id, { timer, deadline, kind, channelId, guildId });
    notify((kind === "dm" ? "DM" : "Server") + " message scheduled for a deletion attempt in " + delaySeconds + "s.");
    render();
  }
  function onDelete(event) {
    const id = String(event?.id ?? event?.messageId ?? event?.message?.id ?? "");
    if (!validId(id)) return;
    if (state.attemptedIds.has(id) && !state.countedDeleted.has(id)) {
      state.countedDeleted.add(id);
      if (state.countedDeleted.size > 1500)
        state.countedDeleted.delete(state.countedDeleted.values().next().value);
      state.deleted++;
      notify("Observed message deletion after AutoDelete request.", "good");
    }
    cancel(id);
    render(); // A timer may have left pending before MESSAGE_DELETE arrives.
  }

  // Cache polling is an independent fallback when Discord does not expose a
  // usable FluxDispatcher. It only sees messages in the currently open channel.
  function cachedMessages() {
    if (!hooks?.messageStore || !hooks?.selectedChannel) return null;
    const channelId = String(hooks.selectedChannel.getChannelId?.() ?? "");
    if (!validId(channelId)) return null;
    const messages = hooks.messageStore.getMessages(channelId);
    const items = messages?._array ?? messages?.toArray?.() ?? [];
    return { channelId, items: Array.isArray(items) ? items : [] };
  }
  function scanCache() {
    if (!state.ready || !state.enabled || state.destroyed || !hooks) return;
    let cache;
    try { cache = cachedMessages(); } catch { return; }
    if (!cache) return;
    const { channelId, items } = cache;
    if (!state.cacheSeen.has(channelId)) {
      // Establish a baseline instead of accidentally deleting old history.
      state.cacheSeen.set(channelId, new Set(items.map(m => String(m?.id ?? ""))));
      return;
    }
    const seen = state.cacheSeen.get(channelId);
    for (const msg of items) {
      const id = String(msg?.id ?? "");
      if (!validId(id) || seen.has(id)) continue;
      // Don't mark a provisional cache ID as already seen. The same cached
      // message might transition to SENT without changing its ID.
      if (isProvisional(msg)) continue;
      seen.add(id);
      if (String(msg.author?.id ?? "") === state.accountId)
        onCreate({ message: msg, channelId });
    }
    if (seen.size > 2500) {
      state.cacheSeen.set(channelId, new Set(items.map(m => String(m?.id ?? ""))));
    }
  }
  function primeCache() {
    state.cacheSeen.clear();
    try {
      const cache = cachedMessages();
      if (cache) state.cacheSeen.set(cache.channelId, new Set(cache.items.map(m => String(m?.id ?? ""))));
    } catch {}
  }

  function disconnect() {
    if (hooks) {
      for (const dispatcher of hooks.activeDispatchers ?? []) {
        try { dispatcher.unsubscribe?.("MESSAGE_CREATE", onCreate); } catch {}
        try { dispatcher.unsubscribe?.("MESSAGE_DELETE", onDelete); } catch {}
      }
    }
    hooks = null;
    state.ready = false;
    state.enabled = false;
    state.cacheSeen.clear();
    pickerKind = null;
    renderPicker();
    clearPending();
  }
  function connect() {
    disconnect();
    state.error = "";
    try {
      const discovered = discover();
      hooks = discovered;
      state.accountId = discovered.accountId;
      discovered.activeDispatchers = [];
      for (const dispatcher of discovered.dispatchers) {
        try {
          dispatcher.subscribe("MESSAGE_CREATE", onCreate);
          dispatcher.subscribe("MESSAGE_DELETE", onDelete);
          discovered.activeDispatchers.push(dispatcher);
        } catch {
          try { dispatcher.unsubscribe?.("MESSAGE_CREATE", onCreate); } catch {}
        }
      }
      const usingCache = !!(discovered.messageStore && discovered.selectedChannel);
      if (!discovered.activeDispatchers.length && !usingCache)
        throw new Error("No active message-event source was found.");
      state.monitor = discovered.activeDispatchers.length ?
        "Flux (" + discovered.activeDispatchers.length + ")" + (usingCache ? " + open-channel cache" : "") :
        "Open-channel cache only";
      state.ready = true;
      state.enabled = false;
      notify("Module candidates resolved: " + state.monitor + ". Not live-verified. Enable to test.", "good");
      notify("Filtered " + discovered.ignoredProxies + " synthetic/i18n export candidates.");
      if (!discovered.activeDispatchers.length)
        notify("Limited coverage: only the open channel is monitored.", "bad");
    } catch (err) {
      disconnect();
      state.error = String(err?.message ?? err);
      notify("Connection error: " + state.error, "bad");
    }
    render();
    if (pickerKind) renderPicker();
    return state.ready;
  }
  function pause() { state.enabled = false; clearPending(); notify("Paused — scheduled deletions cancelled."); render(); }
  function resume() {
    if (!state.ready || !hooks) return false;
    if (String(hooks.users.getCurrentUser()?.id ?? "") !== state.accountId) {
      state.error = "Account changed. Reconnect first.";
      pause();
      render();
      return false;
    }
    primeCache();
    state.enabled = true;
    notify("Auto-delete enabled.", "good");
    render();
    return true;
  }
  function updateDelay(kind, value) {
    if (!validDelay(value)) throw new RangeError("Delay must be an integer from 1 to 86400 seconds.");
    const seconds = Number(value);
    if (kind === "servers") config.serverDelay = seconds;
    else if (kind === "dm") config.dmDelay = seconds;
    else throw new RangeError("Delay category must be 'servers' or 'dm'.");
    save();
    render();
    notify((kind === "dm" ? "DM" : "Server") + " delay set to " + seconds + "s (new messages only).");
    return seconds;
  }
  // Exclusions affect only the selected locations; existing queued jobs there
  // are cancelled immediately. No user token or message content is read.
  function exclude(kind, value, selected = true) {
    if (kind !== "dm" && kind !== "servers") throw new RangeError("Exclusion kind: dm | servers");
    const id = String(value ?? "");
    if (!validId(id)) throw new RangeError("Enter a valid Discord channel or server ID.");
    const key = kind === "dm" ? "excludedDms" : "excludedGuilds";
    const next = new Set(config[key]);
    if (selected) next.add(id); else next.delete(id);
    if (next.size > 300) throw new RangeError("Up to 300 excluded locations per category.");
    config[key] = [...next];
    if (selected) {
      for (const [messageId, job] of [...state.pending.entries()]) {
        if ((kind === "dm" && job.kind === "dm" && job.channelId === id) ||
            (kind === "servers" && job.kind === "servers" && job.guildId === id))
          cancel(messageId);
      }
    }
    save(); render(); if (pickerKind) renderPicker();
    notify((selected ? "Excluded " : "Restored ") + (kind === "dm" ? "DM channel" : "server") + " from auto-delete.");
    return config[key].length;
  }
  function getChoices(kind) {
    const found = new Map();
    let scanned = 0; // A large Discord module tree must not freeze the picker.
    const add = (id, name) => {
      if (!validId(id)) return;
      const key = String(id);
      if (!found.has(key)) found.set(key, String(name || (kind === "dm" ? "DM" : "Server") + " · " + key.slice(-5)).slice(0, 90));
    };
    const visit = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 3 || found.size >= 300 || ++scanned > 2000) return;
      if (Array.isArray(value)) { value.slice(0, 350).forEach(v => visit(v, depth + 1)); return; }
      const id = value.id;
      if (kind === "dm" && (value.type === 1 || value.type === 3) && validId(id)) {
        const recipients = value.recipients ?? value.recipientIds ?? [];
        let title = value.name;
        if (!title && Array.isArray(recipients)) {
          const names = recipients.map(u => typeof u === "string" ? hooks?.users?.getUser?.(u)?.username : u?.username).filter(Boolean);
          if (names.length) title = names.join(", ");
        }
        add(id, title);
        return;
      }
      if (kind === "servers" && validId(id) && typeof value.name === "string" &&
          (value.ownerId != null || value.owner_id != null || value.roles != null || value.afk_channel_id !== undefined)) {
        add(id, value.name);
        return;
      }
      if (depth >= 3) return;
      try { for (const child of Object.values(value).slice(0, 350)) visit(child, depth + 1); } catch {}
    };
    if (kind === "dm") {
      for (const method of ["getPrivateChannels", "getSortedPrivateChannels", "getChannels"]) {
        try { visit(hooks?.channelStore?.[method]?.()); } catch {}
      }
    } else {
      try { visit(hooks?.guildStore?.getGuilds?.()); } catch {}
      try { visit(hooks?.channelStore?.getChannels?.()); } catch {}
    }
    const current = String(hooks?.selectedChannel?.getChannelId?.() ?? "");
    const channel = hooks?.channelStore?.getChannel?.(current);
    if (kind === "dm" && (channel?.type === 1 || channel?.type === 3)) add(current, channel.name ?? "Current DM · " + current.slice(-5));
    if (kind === "servers" && validId(channel?.guild_id ?? channel?.guildId))
      add(channel.guild_id ?? channel.guildId, hooks?.guildStore?.getGuild?.(channel.guild_id ?? channel.guildId)?.name ?? "Current server");
    return [...found.entries()].sort((a,b) => a[1].localeCompare(b[1])).slice(0, 200);
  }
  function renderPicker() {
    const panel = el("ad-picker");
    panel.hidden = !pickerKind;
    panel.style.display = pickerKind ? "" : "none";
    if (!pickerKind) return;
    const kind = pickerKind;
    el("ad-picker-title").textContent = kind === "dm" ? "DMs to keep" : "Servers to keep";
    el("ad-exclude-id").value = "";
    const list = el("ad-picker-list");
    list.replaceChildren();
    const key = kind === "dm" ? "excludedDms" : "excludedGuilds";
    const choices = getChoices(kind);
    for (const id of config[key]) if (!choices.some(([choice]) => choice === id))
      choices.push([id, "Saved ID · " + id.slice(-5)]);
    if (!choices.length) {
      const empty = document.createElement("div");
      empty.className = "picker-note";
      empty.textContent = "No locations available to list. Open a conversation/server or enter an ID below.";
      list.appendChild(empty);
    }
    for (const [id, name] of choices) {
      const row = document.createElement("label");
      row.className = "picker-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = config[key].includes(id);
      input.addEventListener("change", () => exclude(kind, id, input.checked));
      const title = document.createElement("span");
      title.textContent = name;
      row.append(input, title);
      list.appendChild(row);
    }
    const current = String(hooks?.selectedChannel?.getChannelId?.() ?? "");
    const channel = hooks?.channelStore?.getChannel?.(current);
    const possible = kind === "dm" ? (channel?.type === 1 || channel?.type === 3) :
      validId(channel?.guild_id ?? channel?.guildId);
    el("ad-exclude-current").disabled = !possible;
    el("ad-exclude-current").textContent = kind === "dm" ? "Exclude currently open DM" : "Exclude currently open server";
  }
  function togglePicker(kind) {
    pickerKind = pickerKind === kind ? null : kind;
    renderPicker(); render();
  }
  el("ad-exclude-dm").addEventListener("click", () => togglePicker("dm"));
  el("ad-exclude-servers").addEventListener("click", () => togglePicker("servers"));
  el("ad-exclude-current").addEventListener("click", () => {
    if (!pickerKind) return;
    const channelId = String(hooks?.selectedChannel?.getChannelId?.() ?? "");
    const channel = hooks?.channelStore?.getChannel?.(channelId);
    if (pickerKind === "dm" && (channel?.type === 1 || channel?.type === 3))
      exclude("dm", channelId);
    else if (pickerKind === "servers" && validId(channel?.guild_id ?? channel?.guildId))
      exclude("servers", channel.guild_id ?? channel.guildId);
  });
  el("ad-add-exclude").addEventListener("click", () => {
    if (!pickerKind) return;
    try { exclude(pickerKind, el("ad-exclude-id").value.trim()); }
    catch (e) { notify(String(e.message), "bad"); }
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

  el("ad-toggle").addEventListener("click", () => state.enabled ? pause() : resume());
  el("ad-retry").addEventListener("click", connect);
  el("ad-retry-foot").addEventListener("click", connect);
  // Preserve manual edits until Enter or blur, with explicit input locks
  // so the half-second render never resets keystrokes while editing.
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
  shadow.querySelectorAll("[data-delay-for]").forEach(btn =>
    btn.addEventListener("click", () => updateDelay(btn.dataset.delayFor, Number(btn.dataset.delay))));
  shadow.querySelectorAll("[data-scope]").forEach(btn =>
    btn.addEventListener("click", () => setScope(btn.dataset.scope)));
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
    host.remove();
    try { delete window[NAME]; } catch { window[NAME] = undefined; }
    console.info("[AutoDelete] Stopped. Dashboard removed.");
  }
  el("ad-close").addEventListener("click", stop);
  const controller = {
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
})();