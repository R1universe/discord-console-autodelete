// Purely local tests; no Discord connection and no network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'autodelete.js'), 'utf8');

async function main() {
  const handlers = new Map();
  const deletions = [];
  const accountId = '123456789012345678';
  const channelId = '323456789012345678';
  let currentUserId = accountId;
  let tick = 0;
  let nextTimer = 0;
  const timers = new Map();
  const dispatcher = {
    subscribe(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); },
    unsubscribe(type, fn) { handlers.get(type)?.delete(fn); },
    dispatch(event) { for (const fn of handlers.get(event.type) ?? []) fn(event); },
  };
  const userStore = { getCurrentUser() { return { id: currentUserId }; }, getUser() {}, initialize() {} };
  const messageActions = { deleteMessage(c, m) { deletions.push([c, m]); return Promise.resolve(); }, startEditMessage() {} };
  const cache = {
    one: { exports: { default: dispatcher } },
    two: { exports: userStore },
    three: { exports: { default: messageActions } },
  };
  const chunks = [];
  chunks.push = function (chunk) {
    Array.prototype.push.call(chunks, chunk);
    chunk[2]({ c: cache });
    return chunks.length;
  };
  const sandbox = {
    window: { webpackChunkdiscord_app: chunks },
    location: { hostname: 'discord.com' },
    console: { warn() {}, log() {}, info() {}, table() {}, error() {} },
    setTimeout(fn, time) {
      const id = ++nextTimer;
      timers.set(id, { fn, due: tick + time });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(source, sandbox, { timeout: 500 });
  const app = sandbox.window.DiscordAutoDelete;
  assert.ok(app && app.running, 'Script should start');
  assert.equal(app.status().pending, 0);
  const emit = (messageId, author = accountId) => dispatcher.dispatch({ type: 'MESSAGE_CREATE', message: { id: messageId, author: { id: author }, channel_id: channelId } });
  emit('423456789012345678', '923456789012345678');
  assert.equal(app.status().pending, 0, 'Other users ignored');
  emit('423456789012345678');
  emit('423456789012345678');
  assert.equal(app.status().pending, 1, 'Duplicate events deduplicated');
  assert.equal(deletions.length, 0, 'No early deletion');
  tick += 10000;
  for (const [id, task] of [...timers]) if (task.due <= tick) { timers.delete(id); task.fn(); }
  await Promise.resolve();
  assert.deepEqual(deletions[0], [channelId, '423456789012345678']);
  app.setDelay(30);
  emit('523456789012345678');
  assert.equal(app.status().pending, 1);
  app.stop();
  assert.equal(timers.size, 0, 'Stop should cancel pending timers');
  assert.equal(app.running, false);
  // A switch to another account must never trigger deletion.
  vm.runInNewContext(source, sandbox, { timeout: 500 });
  emit('623456789012345678');
  currentUserId = '823456789012345678';
  tick += 10000;
  for (const [id, task] of [...timers]) if (task.due <= tick) { timers.delete(id); task.fn(); }
  await Promise.resolve();
  assert.equal(deletions.length, 1, 'Account changes must skip deletion');
  sandbox.window.DiscordAutoDelete.stop();
  process.stdout.write('All local tests passed.\n');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
