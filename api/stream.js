// Realtime stream for the Guild: POST /api/stream (Authorization: Bearer <token>)
// Keeps a Server-Sent Events response open and forwards events published to the
// user's Upstash Pub/Sub channel (new messages, friend requests, …).
// The connection is closed after LIFETIME and the browser reconnects automatically.
import { db, K, authenticate, HttpError } from './_lib.js';

const LIFETIME_MS = 270_000; // a bit under maxDuration (300s, see vercel.json)
const HEARTBEAT_MS = 15_000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let me;
  try {
    me = await authenticate(req);
  } catch (e) {
    return res.status(e instanceof HttpError ? e.status : 500).json({ error: e.message });
  }
  if (!me) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบใหม่' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  let closed = false;
  let done;
  const finished = new Promise((r) => (done = r));
  const write = (s) => { if (!closed) { try { res.write(s); } catch { finish(); } } };

  const sub = db().subscribe([K.ch(me.id)]);
  // "ready" only after Upstash confirms the subscription, so the client's catch-up sync can't miss anything
  sub.on('subscribe', () => write('data: {"t":"ready"}\n\n'));
  sub.on('message', ({ message }) => write(`data: ${typeof message === 'string' ? message : JSON.stringify(message)}\n\n`));
  sub.on('error', () => finish());

  const hb = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);
  const life = setTimeout(() => { write('data: {"t":"bye"}\n\n'); finish(); }, LIFETIME_MS);

  async function finish() {
    if (closed) return;
    closed = true;
    clearInterval(hb);
    clearTimeout(life);
    try { await sub.unsubscribe(); } catch {}
    try { res.end(); } catch {}
    done();
  }
  res.on('close', finish); // client went away (tab closed / went back to the game)
  await finished;
}
