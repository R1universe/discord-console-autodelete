// Lightweight public landing-page regression checks. No network or dependencies.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const en = fs.readFileSync(path.join(root, "README.md"), "utf8");
const imagePath = path.join(root, "assets", "autodelete-active.webp");
const screenshot = fs.readFileSync(imagePath);

assert.ok(en.startsWith("# Discord AutoDelete"), "English landing page title");
assert.match(en, /Discord AutoDelete.*Self-Destructing Messages/i, "Title describes the new-message expiration concept");
assert.match(en, /Your newly sent messages|your newly sent messages/i, "Explain new-message monitoring");
assert.match(en, /No token extraction/i, "Explain no explicit token extraction");
assert.match(en, /not a bulk message deleter/i, "Distinguish history cleanup");
assert.match(en, /Undiscord/i, "Document the history-cleaner distinction");
assert.match(en, /not server-confirmed successful deletions/i, "Never overstate completion counts");
assert.match(en, /assets\/autodelete-active\.webp/, "English landing page shows UI screenshot");
assert.ok(screenshot.length > 2000, "Screenshot is nonempty and more than a placeholder");
assert.equal(screenshot.subarray(0, 4).toString("ascii"), "RIFF", "Valid WebP RIFF signature");
assert.equal(screenshot.subarray(8, 12).toString("ascii"), "WEBP", "Valid WebP format");
for (const item of ["autodelete.js", "QA_TEST_PLAN.md", "docs/RELEASE_HISTORY.md",
  "test/test.js"]) {
  assert.ok(fs.existsSync(path.join(root, item)), "Linked documentation exists: " + item);
}
assert.match(en, /Discord prohibits/i, "Self-bot risk visible in current README");
assert.match(en, /not server-confirmed successful deletions/i, "Counters do not overstate deletion success");
console.log("PASS: public README screenshot, discoverability and documentation checks");
