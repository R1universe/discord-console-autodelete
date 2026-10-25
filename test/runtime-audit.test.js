"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const file = path.join(__dirname, "..", "diagnostics", "runtime-audit.js");
const code = fs.readFileSync(file, "utf8");
const unwanted = [
  /\.deleteMessage\s*\(/, /\.editMessage\s*\(/, /\.del\s*\(/,
  /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\s*\(/,
  /\bgetToken\s*\(/, /\bAuthorization\b/
];
for (const pattern of unwanted) {
  assert.doesNotMatch(code, pattern, "Audit must never call client APIs: " + pattern);
}

const functions = new Set([
  "getCurrentUser", "getUser", "deleteMessage", "editMessage",
  "startEditMessage", "get", "del", "getAPIBaseURL",
  "getMessages", "getMessage", "getChannelId", "getChannel",
  "subscribe", "dispatch", "HTTP"
]);

function makeFakeRuntime() {
  let latestReport = null;
  const methods = {};
  const genericProxy = new Proxy({}, {
    get(_target, prop) {
      // Simulates dynamically synthesized method wrappers, which can
      // match many unrelated predicates without owning any such property.
      return functions.has(prop) ? function wrapped() {} : undefined;
    }
  });
  const msg = { getMessages() {}, getMessage() {} };
  const users = { getCurrentUser() {}, getUser() {} };
  const cache = {
    10: { exports: { genericProxy } },
    20: { exports: { users } },
    30: { exports: { messages: msg } },
    40: { exports: { transport: {
      HTTP: { get() {}, post() {}, put() {}, del() {} }
    } } }
  };
  const req = { c: cache, m: { ...cache, 1000: function lazyFactory() {} } };
  const chunk = [];
  chunk.push = function(item) {
    Array.prototype.push.call(this, item);
    item[2](req);
  };
  const logged = [];
  const window = { webpackChunkdiscord_app: chunk };
  const sandbox = vm.createContext({
    window,
    location: { hostname: "discord.com" },
    console: {
      log(value) { logged.push(value); },
      info(value) { logged.push(value); },
      error(value) { throw Error(String(value)); }
    },
    Symbol, Object, String, Function, WeakSet, Set, Map, Date
  });
  vm.runInContext(code, sandbox, { timeout: 5000 });
  latestReport = window.AutoDeleteAuditReport;
  return { latestReport, logged };
}
const { latestReport: report, logged } = makeFakeRuntime();
assert.ok(report);
assert.equal(report.browserRuntimeCount, 1);
assert.equal(report.runtimes[0].initialized, 4);
assert.equal(report.runtimes[0].availableFactories, 5);
assert.equal(report.signatures.improbableCrossFamily, 1);
assert.equal(report.auditVersion, "1.1");
assert.ok(report.httpPropertyTypes.object >= 1);
assert.equal(report.httpPropertyTypes.nestedObjectsWithGetPostPutDel, 1);
assert.ok(report.httpPropertyTypes.function >= 0);
assert.equal(report.crossFamily.threeOrMoreFamilies, 1);
assert.equal(report.crossFamily.fiveOrMoreFamilies, 1);
assert.ok(report.methods.deleteMessage.unstableOnRepeatedRead >= 1);
assert.equal(report.methods.deleteMessage.ownProperties, 0);
assert.ok(report.methods.getCurrentUser.ownProperties >= 1);
assert.equal(typeof report.accountId, "undefined");
assert.equal(typeof report.token, "undefined");
assert.ok(logged.some(value => String(value).includes("READ ONLY")));
console.log("PASS: read-only diagnostics detect synthesized function wrappers without reading personal data");
