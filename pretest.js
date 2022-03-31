/**
 * We have to patch @emurgo/cardano-serialization-lib-browser
 * module to support ESM wasm import in NodeJS.
 */
import fs from 'fs/promises';

const FILE = './node_modules/@emurgo/cardano-serialization-lib-browser/package.json';

const json = JSON.parse(await fs.readFile(FILE));

json.type = 'module';
json.main = json.module;

await fs.writeFile(FILE, JSON.stringify(json, null, '  '));

console.log(`File patched: '${FILE}'`);
