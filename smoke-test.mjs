import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const api = await readFile(new URL('../cloud-functions/api/discord.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
for (const name of ['onRequestGet', 'onRequestOptions', 'onRequestPost']) {
  assert.match(api, new RegExp(`export async function ${name}`));
}
assert.doesNotMatch(api, /FIREBASE_PROJECT_ID|ADMIN_UIDS|STAFF_UIDS|Authorization.*Bearer/i);
assert.doesNotMatch(html, /Sign in through the Admin or Staff portal before using bot controls/);
assert.match(html, /botToken:\s*token/);
assert.match(html, /server,/);
assert.match(html, /staffAccess/);
assert.match(html, /adminAccess/);
console.log('EMPÍRE portal smoke checks passed.');
