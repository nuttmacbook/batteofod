// Single endpoint for the hidden guild chat: POST /api/guild  { action, ...params }
import {
  db, K, dmKey, HttpError, hashPassword, verifyPassword, randomToken,
  makeInviteCode, randomId, clientIp, rateLimit, getUser, authenticate, publish,
} from './_lib.js';

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
const INVITE_TTL = 60 * 60 * 24 * 7; // 7 days
const MAX_ACTIVE_INVITES = 5; // per normal user (admin = unlimited)
const MAX_PENDING_REQUESTS = 100;
const MAX_MSG_LEN = 2000;
const KEEP_MSGS = 3000; // per conversation (oldest are trimmed beyond this)
const PAGE_SIZE = 60;
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

const pub = (u) => ({ id: u.id, username: u.username, role: u.role || 'user' });
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const bad = (msg, status = 400) => new HttpError(status, msg);

async function getUsers(ids) {
  if (!ids.length) return [];
  const p = db().pipeline();
  ids.forEach((id) => p.hgetall(K.user(id)));
  const rows = await p.exec();
  return rows.filter((u) => u && u.id);
}

async function createSession(uid) {
  const r = db();
  const token = randomToken();
  await r.set(K.sess(token), uid, { ex: SESSION_TTL });
  await r.sadd(K.sessions(uid), token);
  return token;
}

async function isFriend(a, b) {
  return (await db().sismember(K.friends(a), b)) === 1;
}

async function requireFriend(me, id) {
  if (!(await isFriend(me.id, id))) throw bad('ยังไม่ได้เป็นเพื่อนกัน', 403);
}

async function aliveInvites(uid) {
  const r = db();
  const codes = await r.smembers(K.invites(uid));
  if (!codes.length) return [];
  const p = r.pipeline();
  codes.forEach((c) => p.ttl(K.invite(c)));
  const ttls = await p.exec();
  const alive = [];
  for (let i = 0; i < codes.length; i++) {
    if (ttls[i] > 0) alive.push({ code: codes[i], ttl: ttls[i] });
    else await r.srem(K.invites(uid), codes[i]);
  }
  return alive;
}

const parseMsgs = (rows) =>
  rows.map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);

// ---------------- public actions ----------------
const PUBLIC = {
  async register(b, req) {
    await rateLimit('reg', clientIp(req), 10, 3600);
    const username = str(b.username, 40);
    const password = typeof b.password === 'string' ? b.password : '';
    const invite = str(b.invite, 100);
    if (!USERNAME_RE.test(username)) throw bad('ชื่อผู้ใช้ต้องเป็น a-z, 0-9 หรือ _ ยาว 3–20 ตัว');
    if (password.length < 6 || password.length > 200) throw bad('รหัสผ่านต้องยาวอย่างน้อย 6 ตัว');
    if (!invite) throw bad('ต้องใช้รหัสเชิญจากสมาชิกเท่านั้น');

    const r = db();
    const rootKey = process.env.ROOT_KEY || '';
    const wantsRoot = rootKey.length >= 8 && invite === rootKey;
    const code = invite.toUpperCase();
    const badInvite = bad('รหัสเชิญไม่ถูกต้อง หมดอายุ หรือถูกใช้ไปแล้ว');

    if (!wantsRoot) {
      if (!/^[A-Z0-9]{8}$/.test(code)) throw badInvite;
      const creator = await r.get(K.invite(code));
      const cu = creator && (await getUser(creator));
      if (!cu || cu.banned === '1') throw badInvite;
    }

    const unameKey = K.uname(username.toLowerCase());
    if (!(await r.set(unameKey, 'pending', { nx: true }))) throw bad('ชื่อผู้ใช้นี้ถูกใช้แล้ว', 409);

    let id;
    let role = 'user';
    let invitedBy = '';
    try {
      if (wantsRoot) {
        if (!(await r.set(K.rootLock, '1', { nx: true }))) throw badInvite;
        id = 'root';
        role = 'admin';
      } else {
        invitedBy = await r.getdel(K.invite(code)); // single use
        if (!invitedBy) throw badInvite;
        await r.srem(K.invites(invitedBy), code);
        id = String(100000 + (await r.incr(K.seq)));
      }
      const { salt, hash } = hashPassword(password);
      await r.hset(K.user(id), {
        id, username, salt, hash, role, invitedBy, createdAt: String(Date.now()), banned: '0',
      });
      await r.set(unameKey, id);
      await r.sadd(K.users, id);
    } catch (e) {
      await r.del(unameKey);
      throw e;
    }
    return { token: await createSession(id), user: pub({ id, username, role }) };
  },

  async login(b, req) {
    await rateLimit('login', clientIp(req), 20, 900);
    const username = str(b.username, 40).toLowerCase();
    const password = typeof b.password === 'string' ? b.password : '';
    const id = username && (await db().get(K.uname(username)));
    const u = id && (await getUser(id));
    if (!u || !verifyPassword(password, u.salt, u.hash)) throw bad('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 401);
    if (u.banned === '1') throw bad('บัญชีนี้ถูกระงับ', 403);
    return { token: await createSession(u.id), user: pub(u) };
  },
};

// ---------------- signed-in actions ----------------
const PRIVATE = {
  async me(b, me) {
    return { user: pub(me) };
  },

  async logout(b, me) {
    await db().del(K.sess(me._token));
    await db().srem(K.sessions(me.id), me._token);
    return { ok: true };
  },

  async change_password(b, me) {
    const oldPw = typeof b.oldPassword === 'string' ? b.oldPassword : '';
    const newPw = typeof b.newPassword === 'string' ? b.newPassword : '';
    if (!verifyPassword(oldPw, me.salt, me.hash)) throw bad('รหัสผ่านเดิมไม่ถูกต้อง');
    if (newPw.length < 6 || newPw.length > 200) throw bad('รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัว');
    const { salt, hash } = hashPassword(newPw);
    await db().hset(K.user(me.id), { salt, hash });
    return { ok: true };
  },

  // ----- invites -----
  async invite_list(b, me) {
    return { invites: await aliveInvites(me.id), limit: me.role === 'admin' ? null : MAX_ACTIVE_INVITES };
  },

  async invite_create(b, me) {
    const alive = await aliveInvites(me.id);
    if (me.role !== 'admin' && alive.length >= MAX_ACTIVE_INVITES) {
      throw bad(`มีรหัสเชิญที่ยังไม่ถูกใช้ครบ ${MAX_ACTIVE_INVITES} รหัสแล้ว`);
    }
    const r = db();
    for (let i = 0; i < 5; i++) {
      const code = makeInviteCode();
      if (await r.set(K.invite(code), me.id, { nx: true, ex: INVITE_TTL })) {
        await r.sadd(K.invites(me.id), code);
        return { invite: { code, ttl: INVITE_TTL } };
      }
    }
    throw bad('สร้างรหัสไม่สำเร็จ ลองใหม่อีกครั้ง', 500);
  },

  async invite_revoke(b, me) {
    const code = str(b.code, 20).toUpperCase();
    const r = db();
    if ((await r.sismember(K.invites(me.id), code)) !== 1) throw bad('ไม่พบรหัสนี้', 404);
    await r.del(K.invite(code));
    await r.srem(K.invites(me.id), code);
    return { ok: true };
  },

  // ----- friends -----
  async user_search(b, me) {
    const id = str(b.id, 40);
    const u = await getUser(id);
    if (!u || u.banned === '1') throw bad('ไม่พบผู้ใช้ ID นี้', 404);
    const r = db();
    const [friend, sent, incoming] = await Promise.all([
      r.sismember(K.friends(me.id), u.id),
      r.sismember(K.freq(u.id), me.id),
      r.sismember(K.freq(me.id), u.id),
    ]);
    return {
      user: pub(u),
      self: u.id === me.id,
      isFriend: friend === 1,
      requested: sent === 1,
      incoming: incoming === 1,
    };
  },

  async friend_request(b, me) {
    const id = str(b.id, 40);
    if (id === me.id) throw bad('เพิ่มตัวเองไม่ได้');
    const u = await getUser(id);
    if (!u || u.banned === '1') throw bad('ไม่พบผู้ใช้ ID นี้', 404);
    const r = db();
    if (await isFriend(me.id, id)) throw bad('เป็นเพื่อนกันอยู่แล้ว');
    if ((await r.sismember(K.freq(me.id), id)) === 1) {
      // they already asked me -> accept immediately
      await r.srem(K.freq(me.id), id);
      await r.sadd(K.friends(me.id), id);
      await r.sadd(K.friends(id), me.id);
      await publish(r, id, { t: 'friend' });
      return { status: 'accepted' };
    }
    if ((await r.scard(K.freq(id))) >= MAX_PENDING_REQUESTS) throw bad('ผู้ใช้นี้มีคำขอค้างอยู่มากเกินไป');
    await r.sadd(K.freq(id), me.id);
    await publish(r, id, { t: 'freq' });
    return { status: 'sent' };
  },

  async friend_requests(b, me) {
    const ids = await db().smembers(K.freq(me.id));
    return { requests: (await getUsers(ids)).filter((u) => u.banned !== '1').map(pub) };
  },

  async friend_respond(b, me) {
    const id = str(b.id, 40);
    const r = db();
    if ((await r.sismember(K.freq(me.id), id)) !== 1) throw bad('ไม่พบคำขอนี้', 404);
    await r.srem(K.freq(me.id), id);
    if (b.accept && (await getUser(id))) {
      await r.sadd(K.friends(me.id), id);
      await r.sadd(K.friends(id), me.id);
      await r.srem(K.freq(id), me.id);
      await publish(r, id, { t: 'friend' });
    }
    return { ok: true };
  },

  async friend_remove(b, me) {
    const id = str(b.id, 40);
    const r = db();
    const p = r.pipeline();
    p.srem(K.friends(me.id), id);
    p.srem(K.friends(id), me.id);
    for (const [x, y] of [[me.id, id], [id, me.id]]) {
      p.hdel(K.conv(x), y);
      p.hdel(K.unread(x), y);
      p.hdel(K.read(x), y);
    }
    await p.exec();
    await publish(r, id, { t: 'friend' });
    return { ok: true };
  },

  async friends(b, me) {
    const r = db();
    const ids = await r.smembers(K.friends(me.id));
    const p = r.pipeline();
    p.hgetall(K.conv(me.id));
    p.hgetall(K.unread(me.id));
    ids.forEach((id) => p.hget(K.read(id), me.id)); // how far each friend has read my messages
    const [conv, unread, ...theirRead] = await p.exec();
    const readBy = Object.fromEntries(ids.map((id, i) => [id, Number(theirRead[i] || 0)]));
    const users = await getUsers(ids);
    return {
      friends: users.map((u) => ({
        ...pub(u),
        lastTs: Number(conv?.[u.id] || 0),
        unread: Number(unread?.[u.id] || 0),
        theirRead: readBy[u.id] || 0,
      })),
    };
  },

  // ----- messages -----
  // Latest page of a chat, or an older page with `before` (ts). Messages are kept on the server,
  // so anything sent while the other person was offline is waiting here.
  async history(b, me) {
    const id = str(b.with, 40);
    await requireFriend(me, id);
    const r = db();
    const key = dmKey(me.id, id);
    const before = Number(b.before) || 0;
    const rows = before
      ? (await r.zrange(key, before, '-inf', { byScore: true, rev: true, offset: 0, count: PAGE_SIZE })).reverse()
      : await r.zrange(key, -PAGE_SIZE, -1);
    const theirRead = Number((await r.hget(K.read(id), me.id)) || 0);
    return { messages: parseMsgs(rows), hasMore: rows.length >= PAGE_SIZE, theirRead };
  },

  async mark_read(b, me) {
    const id = str(b.with, 40);
    await requireFriend(me, id);
    const ts = Math.min(Number(b.ts) || Date.now(), Date.now());
    const r = db();
    const p = r.pipeline();
    p.hdel(K.unread(me.id), id);
    p.hset(K.read(me.id), { [id]: String(ts) });
    publish(p, id, { t: 'read', by: me.id, ts }); // read receipt for the sender
    publish(p, me.id, { t: 'seen', with: id }); // clear the badge on my other devices
    await p.exec();
    return { ok: true };
  },

  async send(b, me) {
    const to = str(b.to, 40);
    const text = typeof b.text === 'string' ? b.text.replace(/\r\n/g, '\n').trim() : '';
    if (!text) throw bad('ข้อความว่าง');
    if (text.length > MAX_MSG_LEN) throw bad(`ข้อความยาวเกิน ${MAX_MSG_LEN} ตัวอักษร`);
    await requireFriend(me, to);
    await rateLimit('msg', me.id, 60, 60);
    const ts = Date.now();
    const msg = { id: `${ts}-${randomId()}`, from: me.id, to, text, ts };
    const key = dmKey(me.id, to);
    const p = db().pipeline();
    p.zadd(key, { score: ts, member: JSON.stringify(msg) });
    p.zremrangebyrank(key, 0, -(KEEP_MSGS + 1));
    p.hset(K.conv(me.id), { [to]: String(ts) });
    p.hset(K.conv(to), { [me.id]: String(ts) });
    p.hincrby(K.unread(to), me.id, 1); // waits as "unread" until the friend opens the chat
    p.hset(K.read(me.id), { [to]: String(ts) }); // I've obviously seen my own message
    publish(p, to, { t: 'msg', m: msg }); // instant delivery if the friend is online
    publish(p, me.id, { t: 'msg', m: msg }); // and to my other devices
    await p.exec();
    return { message: msg };
  },

  // Cheap sync: conversation activity, unread counts, request count (+ new messages of the open chat)
  async poll(b, me) {
    const withId = str(b.with, 40);
    const since = Math.max(0, Number(b.since) || 0);
    const p = db().pipeline();
    p.hgetall(K.conv(me.id));
    p.scard(K.freq(me.id));
    p.hgetall(K.unread(me.id));
    if (withId) {
      p.sismember(K.friends(me.id), withId);
      p.zrange(dmKey(me.id, withId), since, '+inf', { byScore: true, offset: 0, count: 200 });
      p.hget(K.read(withId), me.id);
    }
    const [conv, reqCount, unread, friend, rows, theirRead] = await p.exec();
    const out = { conv: conv || {}, reqCount: Number(reqCount) || 0, unread: unread || {} };
    if (withId && friend === 1) {
      out.messages = parseMsgs(rows || []);
      out.theirRead = Number(theirRead || 0);
    } else if (withId) out.messages = [];
    return out;
  },

  // ----- admin (root) -----
  async admin_users(b, me) {
    if (me.role !== 'admin') throw bad('เฉพาะแอดมิน', 403);
    const ids = await db().smembers(K.users);
    const users = await getUsers(ids);
    return {
      users: users
        .map((u) => ({ ...pub(u), invitedBy: u.invitedBy || '', createdAt: Number(u.createdAt || 0), banned: u.banned === '1' }))
        .sort((a, b2) => a.createdAt - b2.createdAt),
    };
  },

  async admin_ban(b, me) {
    if (me.role !== 'admin') throw bad('เฉพาะแอดมิน', 403);
    const id = str(b.id, 40);
    if (id === me.id) throw bad('ระงับตัวเองไม่ได้');
    const u = await getUser(id);
    if (!u) throw bad('ไม่พบผู้ใช้', 404);
    const r = db();
    await r.hset(K.user(id), { banned: b.banned ? '1' : '0' });
    if (b.banned) {
      const tokens = await r.smembers(K.sessions(id));
      for (const t of tokens) await r.del(K.sess(t));
      await r.del(K.sessions(id));
      await publish(r, id, { t: 'logout' });
    }
    return { ok: true };
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    body = body && typeof body === 'object' ? body : {};
    const action = String(body.action || '');

    if (Object.hasOwn(PUBLIC, action)) return res.status(200).json(await PUBLIC[action](body, req));
    if (!Object.hasOwn(PRIVATE, action)) return res.status(400).json({ error: 'Unknown action' });

    const me = await authenticate(req);
    if (!me) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบใหม่' });
    return res.status(200).json(await PRIVATE[action](body, me, req));
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    if (e instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON' });
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
