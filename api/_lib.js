// Shared helpers for the guild API (files starting with "_" are not deployed as routes on Vercel)
import { Redis } from '@upstash/redis';
import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let client;
export function db() {
  if (client) return client;
  if (globalThis.__DRO_REDIS__) return (client = globalThis.__DRO_REDIS__); // used by local tests
  // Works with both a manual Upstash setup and the Vercel Marketplace (KV_*) integration
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new HttpError(500, 'Server is missing Upstash Redis settings');
  client = new Redis({ url, token, automaticDeserialization: false });
  return client;
}

// All keys are prefixed so the database can be shared safely
const P = 'dro:';
export const K = {
  user: (id) => `${P}user:${id}`, // hash
  uname: (name) => `${P}uname:${name}`, // username(lowercase) -> id
  users: `${P}users`, // set of all ids
  seq: `${P}seq:user`, // counter for numeric ids
  rootLock: `${P}rootlock`,
  sess: (t) => `${P}sess:${t}`, // token -> uid
  sessions: (uid) => `${P}sessions:${uid}`, // set of tokens
  invite: (code) => `${P}invite:${code}`, // code -> creator uid
  invites: (uid) => `${P}invites:${uid}`, // set of codes
  friends: (uid) => `${P}friends:${uid}`, // set
  freq: (uid) => `${P}freq:${uid}`, // set of uids who requested me
  conv: (uid) => `${P}conv:${uid}`, // hash friendId -> last message ts
  unread: (uid) => `${P}unread:${uid}`, // hash friendId -> number of unread messages from that friend
  read: (uid) => `${P}read:${uid}`, // hash friendId -> ts up to which uid has read that chat
  dm: (a, b) => `${P}dm:${a}:${b}`, // zset of messages (score = ts)
  rl: (kind, who) => `${P}rl:${kind}:${who}`,
  ch: (uid) => `${P}ch:${uid}`, // pub/sub channel for realtime events to a user
};

export async function getUser(id) {
  if (!id || typeof id !== 'string' || id.length > 40) return null;
  const u = await db().hgetall(K.user(id));
  return u && u.id ? u : null;
}

export async function authenticate(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+([\w-]{20,100})$/);
  if (!m) return null;
  const uid = await db().get(K.sess(m[1]));
  if (!uid) return null;
  const u = await getUser(uid);
  if (!u || u.banned === '1') return null;
  u._token = m[1];
  return u;
}

// Realtime push to a user's open Guild tabs (no-op cost if nobody is listening)
export function publish(target, uid, event) {
  return target.publish(K.ch(uid), JSON.stringify(event));
}

export function dmKey(a, b) {
  return a < b ? K.dm(a, b) : K.dm(b, a);
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return stored.length === calc.length && crypto.timingSafeEqual(calc, stored);
}

export const randomToken = () => crypto.randomBytes(32).toString('base64url');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars, no 0/O/1/I
export function makeInviteCode() {
  let s = '';
  for (const b of crypto.randomBytes(8)) s += ALPHABET[b % 32];
  return s;
}

export const randomId = (n = 4) => crypto.randomBytes(n).toString('hex');

export function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf) return xf.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

export async function rateLimit(kind, who, limit, windowSec) {
  const key = K.rl(kind, who);
  const n = await db().incr(key);
  if (n === 1) await db().expire(key, windowSec);
  if (n > limit) throw new HttpError(429, 'ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่');
}
