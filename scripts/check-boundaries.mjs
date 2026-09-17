import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve("src");
const allowed = {
  domain: ["domain"],
  storage: ["storage"],
  google: ["google", "domain"],
  sync: ["sync", "domain"],
  app: ["app", "domain"],
  ui: ["ui", "domain"],
};
async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(file)));
    else if (file.endsWith(".js")) result.push(file);
  }
  return result;
}
const files = await walk(root),
  failures = [];
for (const file of files) {
  const relative = path.relative(root, file),
    layer = relative.split(path.sep)[0],
    source = await readFile(file, "utf8");
  if (!allowed[layer]) continue;
  for (const match of source.matchAll(
    /(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g,
  )) {
    const dependency = match[1];
    if (!dependency.startsWith(".")) {
      failures.push(`${relative}: external dependency ${dependency}`);
      continue;
    }
    const target = path
      .relative(root, path.resolve(path.dirname(file), dependency))
      .split(path.sep)[0];
    if (!allowed[layer].includes(target))
      failures.push(`${relative}: forbidden ${layer} -> ${target}`);
  }
  if (
    ["domain", "storage", "sync"].includes(layer) &&
    /\b(?:document|window|fetch)\b/.test(source.replace(/\/\/[^\n]*/g, ""))
  )
    failures.push(`${relative}: forbidden browser UI/network global`);
  if (layer === "ui" && /\b(?:indexedDB|fetch|localStorage)\b/.test(source))
    failures.push(`${relative}: direct storage/network access`);
}
assert.deepEqual(failures, [], "Module boundaries violated");
console.log(`Module boundaries verified: ${files.length} modules.`);
