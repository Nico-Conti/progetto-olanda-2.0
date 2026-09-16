// Translation coverage: every t('...') in src must have an Italian entry in it.js.
// Also lists entries nothing uses any more. Exit code 1 when anything is missing.
//   node src/i18n/check.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import it from './it.js';

const src = fileURLToPath(new URL('..', import.meta.url));
const files = (dir) => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__experiments__' ? [] : files(path);
    return ['.js', '.jsx'].includes(extname(name)) && !path.includes('i18n') ? [path] : [];
});

// t('..') / tk('..') / tx('..') with a plain string literal; escaped quotes allowed.
const CALL = /\bt[kx]?\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
const used = new Map();
for (const file of files(src)) {
    for (const [, quote, raw] of readFileSync(file, 'utf8').matchAll(CALL)) {
        const text = raw.replace(new RegExp(`\\\\${quote}`, 'g'), quote).replace(/\\\\/g, '\\');
        if (!used.has(text)) used.set(text, file.replace(src, ''));
    }
}

const missing = [...used].filter(([text]) => !(text in it));
const unused = Object.keys(it).filter(text => !used.has(text));
console.log(`${used.size} strings, ${missing.length} missing, ${unused.length} unused`);
for (const [text, file] of missing) console.log(`  missing  ${JSON.stringify(text)}  (${file})`);
for (const text of unused) console.log(`  unused   ${JSON.stringify(text)}`);
process.exit(missing.length ? 1 : 0);
