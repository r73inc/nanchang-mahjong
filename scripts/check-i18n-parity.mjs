#!/usr/bin/env node
/**
 * CI check: verify that every key in en.json is also present in zh.json,
 * and vice versa, for both the web and API locale files.
 *
 * Exit code 0 = parity OK.  Exit code 1 = mismatch found (fails CI).
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');

/** @param {string} a @param {string} b */
function checkPair(a, b) {
  const aKeys = new Set(Object.keys(JSON.parse(readFileSync(a, 'utf8'))));
  const bKeys = new Set(Object.keys(JSON.parse(readFileSync(b, 'utf8'))));

  const onlyInA = [...aKeys].filter((k) => !bKeys.has(k));
  const onlyInB = [...bKeys].filter((k) => !aKeys.has(k));

  return { onlyInA, onlyInB };
}

let hasErrors = false;

const PAIRS = [
  {
    label: 'apps/web (FE)',
    en: resolve(root, 'apps/web/src/i18n/en.json'),
    zh: resolve(root, 'apps/web/src/i18n/zh.json'),
  },
  {
    label: 'apps/api (BE)',
    en: resolve(root, 'apps/api/src/i18n/locales/en.json'),
    zh: resolve(root, 'apps/api/src/i18n/locales/zh.json'),
  },
];

for (const { label, en, zh } of PAIRS) {
  const { onlyInA, onlyInB } = checkPair(en, zh);

  if (onlyInA.length === 0 && onlyInB.length === 0) {
    console.log(`✓  ${label}: key parity OK`);
  } else {
    hasErrors = true;
    console.error(`✗  ${label}: key mismatch`);
    if (onlyInA.length > 0) {
      console.error(`   Keys in en.json but missing from zh.json:\n   ${onlyInA.join(', ')}`);
    }
    if (onlyInB.length > 0) {
      console.error(`   Keys in zh.json but missing from en.json:\n   ${onlyInB.join(', ')}`);
    }
  }
}

if (hasErrors) {
  console.error('\nFix the mismatch above and re-run.');
  process.exit(1);
}
