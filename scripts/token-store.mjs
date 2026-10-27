import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LOCAL_TOKEN_PATH = path.join(ROOT_DIR, 'contra_token.json');

export function resolveTokenPath() {
  if (process.env.CONTRA_TOKEN_PATH) return path.resolve(process.env.CONTRA_TOKEN_PATH);
  if (fs.existsSync(LOCAL_TOKEN_PATH)) return LOCAL_TOKEN_PATH;
  const legacy = path.join(os.homedir(), '.gemini/config/contra_token.json');
  if (fs.existsSync(legacy)) return legacy;
  throw new Error('Contra token not found. Run npm run auth for the SDK, or connect your AI client directly with OAuth.');
}

export function readToken(tokenPath) {
  let data;
  try { data = JSON.parse(fs.readFileSync(tokenPath, 'utf8')); }
  catch { throw new Error('Cannot read Contra token file. Reconnect or check CONTRA_TOKEN_PATH.'); }
  if (typeof data?.access_token !== 'string' || !data.access_token) throw new Error('Contra token file has no access token.');
  return data;
}

export function writeToken(tokenPath, data) {
  const target = path.resolve(tokenPath);
  if (fs.existsSync(target) && !fs.lstatSync(target).isFile()) throw new Error('Token destination must be a regular file.');
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
