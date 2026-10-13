import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const urls = {
  remote: 'https://witch-hunt-rqg2.onrender.com/jev',
  local: 'http://127.0.0.1:8787/jev',
};

const mode = process.argv[2];
const url = urls[mode];
if (!url) {
  console.error('usage: set-jev-url.mjs remote|local');
  process.exit(1);
}

const file = join(dirname(fileURLToPath(import.meta.url)), '../ai/jev-config.ts');
writeFileSync(file, `export const JEV_URL = ${JSON.stringify(url)};\n`);
