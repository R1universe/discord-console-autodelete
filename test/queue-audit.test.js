"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "diagnostics", "queue-audit.js"), "utf8");

for (const forbidden of [
  /\bgetToken\s*\(/, /\bfetch\s*\(/, /\bXMLHttpRequest\s*\(/,
  /\bdeleteMessage\s*\(/, /\.del\s*\(/, /\beditMessage\s*\(/,
  /\blocalStorage\s*\./, /\bAuthorization\b/
]) assert.doesNotMatch(source, forbidden, "Read-only scanner must not invoke private actions");

const listeners = new Map();
const dispatcher = {
  _subscriptions: {},
  flushWaitQueue() {},
  subscribe(topic, fn) { listeners.set(topic, fn); },
  unsubscribe(topic, fn) { if (listeners.get(topic) === fn) listeners.delete(topic); },
  dispatch(topic, payload) { listeners.get(topic)?.(payload); }
};
const accountId = "111111111111111111";
const channelId = "222222222222222222";
const firstId = "333333333333333333";
const secondId = "444444444444444444";
const sameNonce = "555555555555555555";
const users = {
  getCurrentUser() { return { id: accountId }; },
  getUser() {}
};
Object.setPrototypeOf(users, { constructor: { displayName: "UserStore" } });
const messages = [];
const store = {
  getMessage(c,id) { return messages.find(m => m.id === id); },
  getMessages(c) { return { _array: messages }; }
};
Object.setPrototypeOf(store, { constructor: { displayName: "MessageStore" } });
const selected = { getChannelId() { return channelId; } };
Object.setPrototypeOf(selected, { constructor: { displayName: "SelectedChannelStore" } });
const channel = { getChannel() {}, getChannels() {} };
Object.setPrototypeOf(channel, { constructor: { displayName: "ChannelStore" } });
const cache = {
  1: { exports: { users } },
  2: { exports: { store } },
  3: { exports: { selected } },
  4: { exports: { dispatcher } },
  5: { exports: { channel } }
};
const webpack = [];
webpack.push = function(e) { Array.prototype.push.call(this,e); e[2]({ c: cache }); return this.length; };
const timers = {};
const window = { webpackChunkdiscord_app: webpack };
const logs = [];
const context = vm.createContext({
  window,
  location: { hostname: "discord.com" },
  console: { warn(...a) { logs.push(a.join(" ")); }, info(...a) { logs.push(a.join(" ")); }, log(...a) { logs.push(a.join(" ")); } },
  setInterval(fn) { timers.fn = fn; return 1; },
  clearInterval() { timers.fn = null; },
  Date, String, Symbol, Object, Array, Set, Map, WeakSet, Reflect
});
vm.runInContext(source, context, { timeout: 5000 });
assert.ok(window.DiscordQueueAudit?.running, "Watcher starts with mocked named exports");
const mk = (id, nonce, optimistic = false) => ({
  id, nonce, channel_id: channelId, author: { id: accountId },
  optimistic, state: "SENT", content: "SECRET PRIVATE CONTENT NOT FOR LOGGING"
});
const temp = mk(firstId, sameNonce, true);
const permanent = mk(secondId, sameNonce, false);
dispatcher.dispatch("MESSAGE_CREATE", { message: temp });
dispatcher.dispatch("MESSAGE_CREATE", { message: permanent });
messages.push(permanent);
timers.fn();
const report = window.DiscordQueueAudit.report();
const text = JSON.stringify(report);
assert.equal(report.auditVersion,"1.0");
assert.equal(report.readOnly,true);
assert.equal(report.distinctMessageAliases,2);
assert.equal(report.matchingEvents.flux,2);
assert.equal(report.matchingEvents.cache,1);
assert.equal(report.eventSequence.length,3);
assert.equal(report.eventSequence[0].message,"M1");
assert.equal(report.eventSequence[1].message,"M2");
assert.equal(report.eventSequence[0].nonce,"N1");
assert.equal(report.eventSequence[1].nonce,"N1");
assert.equal(report.eventSequence[0].optimistic,true);
assert.equal(report.eventSequence[1].optimistic,false);
assert.equal(report.eventSequence[2].seenBefore,true);
for(const forbidden of [accountId,channelId,firstId,secondId,sameNonce,"SECRET PRIVATE CONTENT"]) {
  assert.ok(!text.includes(forbidden), "No raw identifier or private text in report: "+forbidden);
  assert.ok(!logs.join(" ").includes(forbidden), "No raw identifiers or private text logged");
}
window.DiscordQueueAudit.stop();
assert.equal(window.DiscordQueueAudit.running,false);
assert.equal(listeners.size,0);
console.log("PASS: read-only event audit correlates optimistic/confirmed IDs by nonce without leaking account data");
