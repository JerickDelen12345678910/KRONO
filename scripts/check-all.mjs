// Runs every scripts/check-*.mjs in order. Usage: npm run check   (or: node scripts/check-all.mjs)
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter((f) => /^check-.+\.mjs$/.test(f) && f !== 'check-all.mjs').sort();
for (const f of files) await import(pathToFileURL(path.join(dir, f)).href);   // each script prints its own "OK (N checks)" and throws on failure
console.log(`\nAll ${files.length} check scripts passed.`);
