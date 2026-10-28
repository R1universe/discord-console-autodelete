"use strict";
// Build the console script and BetterDiscord plugin from one ordered source.
// Uses only Node built-ins; distributed scripts remain standalone.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const fragments = ["src/runtime/01-bootstrap.js","src/runtime/02-styles.js","src/runtime/03-ui.js","src/runtime/04-discovery.js","src/runtime/05-scheduler.js","src/runtime/06-exclusions.js","src/runtime/07-controls.js"];
const marker = "/*__AUTODELETE_CORE__*/";
const core = fragments.map(file => fs.readFileSync(path.join(root, file), "utf8")).join("");
const targets = [
  ["src/entry/console.template.js", "autodelete.js"],
  ["src/entry/betterdiscord.template.js", "AutoDelete.plugin.js"]
];
let stale = false;
for (const [template, output] of targets) {
  const original = fs.readFileSync(path.join(root, template), "utf8");
  if (original.split(marker).length !== 2) throw new Error("Core marker missing or duplicated in " + template);
  const expected = original.replace(marker, core);
  const destination = path.join(root, output);
  const actual = fs.existsSync(destination) ? fs.readFileSync(destination, "utf8") : "";
  if (actual === expected) console.info("OK", output, "matches source");
  else if (process.argv.includes("--check")) {
    stale = true;
    console.error("OUT OF DATE", output, "— run node scripts/build.js");
  } else {
    fs.writeFileSync(destination, expected);
    console.info("BUILT", output);
  }
}
if (stale) process.exitCode = 1;
