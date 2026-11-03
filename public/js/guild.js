// Guild Hall — the hidden chat. Only reachable from Settings → "Login Guild".
import { openModal, toast, esc, confirmBox, copyText } from './ui.js';

const TOKEN_KEY = 'dro_gt';
const POLL_MS = 3000; // sync interval while the realtime stream is down
const FALLBACK_SYNC_MS = 30000; // safety-net sync while realtime is up

const root = document.getElementById('guild');
const G = {
  token: null, me: null, friends: [], active: null, msgs: [], ids: new Set(), lastTs: 0,
  readSent: {}, hasMore: false, theirRead: 0,
  timer: null, polling: false, ticks: 0, reqCount: 0, open: false, chatSeq: 0, filter: '',
};
try { G.token = localStorage.getItem(TOKEN_KEY); } catch {}

function setToken(t) {
  G.token = t;
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {}
}

class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

async function api(action, data = {}) {
  let res;
  try {
    res = await fetch('/api/guild', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(G.token ? { Authorization: `Bearer ${G.token}` } : {}) },
      body: JSON.stringify({ action, ...data }),
    });
  } catch {
    throw new ApiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 0);
  }
  let j = {};
  try { j = await res.json(); } catch {}
  if (res.status === 401 && G.token && action !== 'login' && action !== 'register') {
    sessionExpired();
    throw new ApiError(j.error || 'กรุณาเข้าสู่ระบบใหม่', 401);
  }
  if (!res.ok) throw new ApiError(j.error || `เกิดข้อผิดพลาด (${res.status})`, res.status);
  return j;
}

function sessionExpired() {
  G.greeted = false;
  setToken(null);
  G.me = null;
  stopPoll();
  if (G.open) renderAuth('login', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
}

/* ----------------- open / close ----------------- */
export function openGuild() {
  G.open = true;
  window.__guildOpen = true;
  document.body.classList.add('guild-open');
  root.hidden = false;
  if (G.token && G.me) { renderMain(); loadFriends(); startPoll(); }
  else if (G.token) boot();
  else renderAuth('login');
}

function closeGuild() {
  G.open = false;
  window.__guildOpen = false;
  document.body.classList.remove('guild-open');
  root.hidden = true;
  root.innerHTML = ''; // leave nothing on screen / in DOM
  stopPoll();
  window.dispatchEvent(new Event('guild:closed'));
}

// quick escape back to the game
document.addEventListener('keydown', (e) => {
  if (G.open && e.key === 'Escape' && e.shiftKey) closeGuild();
});

/* ----------------- helpers ----------------- */
function hue(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
const avatar = (u, cls = '') =>
  `<div class="g-avatar ${cls}" style="--h:${hue(u.id)}">${esc((u.username || '?')[0].toUpperCase())}</div>`;
const timeOf = (ts) => new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
const dayOf = (ts) => new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
function shortWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts), n = new Date();
  return d.toDateString() === n.toDateString() ? timeOf(ts) : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}
// unread counts live on the server, so they're right on every device and after being offline
const unread = (f) => (G.active && G.active.id === f.id && !document.hidden ? 0 : f.unread || 0);
const totalUnread = () => G.friends.reduce((a, f) => a + unread(f), 0);

/* ----------------- auth screen ----------------- */
function renderAuth(mode = 'login', notice = '') {
  const reg = mode === 'register';
  root.innerHTML = `
    <div class="g-auth">
      <div class="g-auth-card">
        <button class="g-link" data-act="game">← กลับไปเล่นเกม</button>
        <div class="g-auth-logo">🏰</div>
        <h2>Guild Hall</h2>
        <p class="g-sub">${reg ? 'สมัครสมาชิกด้วยรหัสเชิญจากสมาชิกเดิม' : 'เข้าสู่ระบบเพื่อคุยกับเพื่อนในกิลด์'}</p>
        <div class="g-tabs">
          <button data-mode="login" class="${!reg ? 'on' : ''}">เข้าสู่ระบบ</button>
          <button data-mode="register" class="${reg ? 'on' : ''}">สมัครสมาชิก</button>
        </div>
        <form class="g-form" novalidate>
          <label>ชื่อผู้ใช้<input name="username" autocomplete="username" maxlength="20" required autocapitalize="off" spellcheck="false"></label>
          <label>รหัสผ่าน<input name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required></label>
          ${reg ? `
            <label>ยืนยันรหัสผ่าน<input name="password2" type="password" autocomplete="new-password" required></label>
            <label>รหัสเชิญ<input name="invite" required autocapitalize="characters" spellcheck="false" placeholder="เช่น K7QH2MZP"></label>
            <p class="g-hint">ชื่อผู้ใช้ใช้ได้ a–z, 0–9, _ ยาว 3–20 ตัว · รหัสผ่านอย่างน้อย 6 ตัว</p>` : ''}
          <div class="g-err" ${notice ? '' : 'hidden'}>${esc(notice)}</div>
          <button class="g-btn g-primary" type="submit">${reg ? 'สมัครและเข้าสู่ระบบ' : 'เข้าสู่ระบบ'}</button>
        </form>
      </div>
    </div>`;
  root.querySelector('[data-act="game"]').onclick = closeGuild;
  root.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => renderAuth(b.dataset.mode)));
  const form = root.querySelector('form');
  const err = root.querySelector('.g-err');
  form.querySelector('input').focus();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    const showErr = (m) => { err.textContent = m; err.hidden = false; };
    if (!fd.username || !fd.password) return showErr('กรอกชื่อผู้ใช้และรหัสผ่าน');
    if (reg && fd.password !== fd.password2) return showErr('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const j = await api(reg ? 'register' : 'login', { username: fd.username, password: fd.password, invite: fd.invite });
      setToken(j.token);
      G.me = j.user;
      renderMain();
      loadFriends();
      startPoll();
      if (reg) {
        const m = openModal({
          title: '🎉 สมัครสำเร็จ', className: 'modal-sm g-modal',
          body: `<p class="center">ยินดีต้อนรับสู่กิลด์ <b>${esc(j.user.username)}</b></p>
            <div class="g-bigid">${esc(j.user.id)}</div>
            <p class="center g-muted">นี่คือ User ID ของคุณ ให้เพื่อนค้นหาด้วย ID นี้</p>
            <div class="modal-actions"><button class="g-btn g-primary" data-copy>คัดลอก ID</button></div>`,
        });
        m.body.querySelector('[data-copy]').onclick = async () => { await copyText(j.user.id); toast('คัดลอกแล้ว'); m.close(); };
      }
    } catch (ex) {
      showErr(ex.message);
      btn.disabled = false;
    }
  };
}

async function boot() {
  root.innerHTML = '<div class="g-loading"><div class="g-spin"></div></div>';
  try {
    const j = await api('me');
    G.me = j.user;
    renderMain();
    await loadFriends();
    startPoll();
  } catch (e) {
    if (e.status === 401) return; // sessionExpired already rendered login
    root.innerHTML = `<div class="g-auth"><div class="g-auth-card"><div class="g-auth-logo">⚠️</div>
      <p class="center">${esc(e.message)}</p>
      <div class="modal-actions"><button class="g-btn" data-act="game">กลับไปเกม</button><button class="g-btn g-primary" data-act="retry">ลองใหม่</button></div></div></div>`;
    root.querySelector('[data-act="game"]').onclick = closeGuild;
    root.querySelector('[data-act="retry"]').onclick = boot;
  }
}

/* ----------------- main layout ----------------- */
function renderMain() {
  const me = G.me;
  root.innerHTML = `
    <div class="g-app ${G.active ? 'show-chat' : ''}">
      <aside class="g-side">
        <div class="g-side-head">
          <div class="g-me">${avatar(me)}<div class="g-me-txt"><b>${esc(me.username)} <i class="g-live ${G.live ? 'on' : ''}" id="g-live"></i></b>
            <button class="g-id" data-act="copyid" title="คัดลอก ID">ID: ${esc(me.id)} ⧉</button></div></div>
          <button class="g-icon" data-act="game" title="กลับไปเกม (Shift+Esc)">⚔️</button>
        </div>
        <div class="g-tools">
          <button data-act="add"><i>➕</i><span>เพิ่มเพื่อน</span></button>
          <button data-act="requests"><i>📨</i><span>คำขอ</span><em class="g-badge" id="g-req" hidden></em></button>
          <button data-act="invite"><i>🎟️</i><span>รหัสเชิญ</span></button>
          ${me.role === 'admin' ? '<button data-act="admin"><i>🛡️</i><span>แอดมิน</span></button>' : ''}
          <button data-act="account"><i>👤</i><span>บัญชี</span></button>
        </div>
        <div class="g-filter"><input id="g-filter" placeholder="ค้นหาในรายชื่อเพื่อน" value="${esc(G.filter)}"></div>
        <ul class="g-friends" id="g-friends"></ul>
      </aside>
      <section class="g-chat" id="g-chat"></section>
    </div>`;
  const on = (act, fn) => { const b = root.querySelector(`[data-act="${act}"]`); if (b) b.onclick = fn; };
  on('game', closeGuild);
  on('copyid', async () => { await copyText(me.id); toast('คัดลอก ID แล้ว'); });
  on('add', openAddFriend);
  on('requests', openRequests);
  on('invite', openInvites);
  on('admin', openAdmin);
  on('account', openAccount);
  root.querySelector('#g-filter').oninput = (e) => { G.filter = e.target.value; renderFriends(); };
  renderFriends();
  renderChat();
  updateReqBadge();
}

function renderFriends() {
  const ul = root.querySelector('#g-friends');
  if (!ul) return;
  const q = G.filter.trim().toLowerCase();
  const list = G.friends
    .filter((f) => !q || f.username.toLowerCase().includes(q) || f.id.includes(q))
    .sort((a, b) => b.lastTs - a.lastTs || a.username.localeCompare(b.username));
  if (!G.friends.length) {
    ul.innerHTML = `<li class="g-empty">ยังไม่มีเพื่อน<br><small>กด ➕ แล้วค้นหาด้วย User ID</small></li>`;
    return;
  }
  ul.innerHTML = list.map((f) => `
    <li class="g-friend ${G.active?.id === f.id ? 'on' : ''} ${unread(f) ? 'unread' : ''}" data-id="${esc(f.id)}">
      ${avatar(f)}
      <div class="g-f-txt"><b>${esc(f.username)}</b><small>ID ${esc(f.id)}</small></div>
      <div class="g-f-meta"><small>${shortWhen(f.lastTs)}</small>${unread(f) ? `<em class="g-count">${unread(f) > 99 ? '99+' : unread(f)}</em>` : ''}</div>
    </li>`).join('') || '<li class="g-empty">ไม่พบ</li>';
  ul.querySelectorAll('.g-friend').forEach((li) => (li.onclick = () => openChat(G.friends.find((f) => f.id === li.dataset.id))));
}

function updateReqBadge() {
  const b = root.querySelector('#g-req');
  if (!b) return;
  b.hidden = !G.reqCount;
  b.textContent = G.reqCount > 99 ? '99+' : G.reqCount;
}

async function loadFriends() {
  try {
    const j = await api('friends');
    G.friends = j.friends;
    if (G.active) {
      const cur = G.friends.find((f) => f.id === G.active.id);
      if (!cur) { G.active = null; renderChat(); } else G.active = cur;
    }
    renderFriends();
    // messages that arrived while I was offline
    if (!G.greeted) {
      G.greeted = true;
      const n = totalUnread();
      if (n) toast(`💬 มีข้อความใหม่ ${n} ข้อความ ระหว่างที่คุณไม่อยู่`);
    }
  } catch {}
}

/* ----------------- chat pane ----------------- */
function renderChat() {
  const pane = root.querySelector('#g-chat');
  if (!pane) return;
  root.querySelector('.g-app')?.classList.toggle('show-chat', !!G.active);
  if (!G.active) {
    pane.innerHTML = `<div class="g-chat-empty"><div class="g-auth-logo">💬</div>
      <h3>Guild Hall</h3><p>เลือกเพื่อนทางซ้ายเพื่อเริ่มคุย</p>
      <p class="g-muted">ID ของคุณ: <b>${esc(G.me.id)}</b></p></div>`;
    return;
  }
  const f = G.active;
  pane.innerHTML = `
    <header class="g-chat-head">
      <button class="g-icon g-back" data-act="back" title="กลับ">←</button>
      ${avatar(f, 'sm')}
      <div class="g-f-txt"><b>${esc(f.username)}</b><small>ID ${esc(f.id)}</small></div>
      <button class="g-icon" data-act="friendmenu" title="ตัวเลือก">⋯</button>
    </header>
    <div class="g-msgs" id="g-msgs"><div class="g-loading"><div class="g-spin"></div></div></div>
    <form class="g-composer" id="g-composer">
      <textarea rows="1" maxlength="2000" placeholder="พิมพ์ข้อความ…" enterkeyhint="send"></textarea>
      <button class="g-send" type="submit" title="ส่ง">➤</button>
    </form>`;
  pane.querySelector('[data-act="back"]').onclick = () => { G.active = null; G.chatSeq++; renderChat(); renderFriends(); };
  pane.querySelector('[data-act="friendmenu"]').onclick = () => openFriendMenu(f);
  const form = pane.querySelector('#g-composer');
  const ta = form.querySelector('textarea');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(140, ta.scrollHeight)}px`; };
  ta.oninput = grow;
  ta.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(pointer:fine)').matches) {
      e.preventDefault();
      form.requestSubmit();
    }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text || form.dataset.busy) return;
    form.dataset.busy = '1';
    const seq = G.chatSeq;
    try {
      const j = await api('send', { to: f.id, text });
      ta.value = '';
      grow();
      if (seq === G.chatSeq) addMessages([j.message], true);
      f.lastTs = j.message.ts;
      renderFriends();
    } catch (ex) { toast(esc(ex.message), 'bad'); }
    delete form.dataset.busy;
    ta.focus();
  };
  if (window.matchMedia('(pointer:fine)').matches) ta.focus();
}

async function openChat(f) {
  if (!f) return;
  G.active = f;
  G.chatSeq++;
  G.msgs = [];
  G.ids = new Set();
  G.lastTs = 0;
  G.hasMore = false;
  G.theirRead = f.theirRead || 0;
  const seq = G.chatSeq;
  renderChat();
  renderFriends();
  try {
    const j = await api('history', { with: f.id });
    if (seq !== G.chatSeq) return;
    G.hasMore = j.hasMore;
    G.theirRead = Math.max(G.theirRead, j.theirRead || 0);
    addMessages(j.messages, true);
    if (!j.messages.length) renderMessages(true);
    markRead(true);
  } catch (e) {
    const box = root.querySelector('#g-msgs');
    if (box && seq === G.chatSeq) box.innerHTML = `<p class="g-empty">${esc(e.message)}</p>`;
  }
}

async function loadOlder() {
  if (!G.active || !G.msgs.length || G.loadingOlder) return;
  G.loadingOlder = true;
  const seq = G.chatSeq;
  const box = root.querySelector('#g-msgs');
  const prevH = box ? box.scrollHeight - box.scrollTop : 0;
  try {
    const j = await api('history', { with: G.active.id, before: G.msgs[0].ts });
    if (seq !== G.chatSeq) return;
    G.hasMore = j.hasMore;
    addMessages(j.messages, false, true);
    if (!j.messages.length) renderMessages(false, true);
    if (box) box.scrollTop = box.scrollHeight - prevH; // keep the view where it was
  } catch (e) { toast(esc(e.message), 'bad'); }
  G.loadingOlder = false;
}

// Tell the server (and the sender) that I've read this chat. Debounced; only while actually looking at it.
let readTimer = null;
function markRead(now = false) {
  const f = G.active;
  if (!f || document.hidden || !G.open) return;
  clearTimeout(readTimer);
  readTimer = setTimeout(() => {
    if (!G.active || G.active.id !== f.id) return;
    const cur = G.active;
    const hadUnread = cur.unread > 0;
    cur.unread = 0;
    renderFriends();
    if (hadUnread || G.lastTs > (G.readSent[cur.id] || 0)) {
      G.readSent[cur.id] = G.lastTs;
      api('mark_read', { with: cur.id, ts: G.lastTs || Date.now() }).catch(() => {});
    }
  }, now ? 0 : 400);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && G.open) markRead(true); });

function addMessages(list, forceBottom = false, older = false) {
  let added = false;
  for (const m of list) {
    if (!m || G.ids.has(m.id)) continue;
    G.ids.add(m.id);
    G.msgs.push(m);
    added = true;
    if (m.ts > G.lastTs) G.lastTs = m.ts;
  }
  if (!added) return;
  G.msgs.sort((a, b) => a.ts - b.ts);
  renderMessages(forceBottom, older);
  if (!older && G.active && list.some((m) => m && m.from !== G.me.id)) markRead();
}

function renderMessages(forceBottom, keepScroll = false) {
  const box = root.querySelector('#g-msgs');
  if (!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  if (!G.msgs.length) {
    box.innerHTML = `<div class="g-empty">ยังไม่มีข้อความ<br><small>ทักทาย ${esc(G.active.username)} เลย 👋<br>ส่งทิ้งไว้ได้ แม้เพื่อนจะออฟไลน์อยู่</small></div>`;
    return;
  }
  // receipt goes under my latest message
  let lastMine = null;
  for (let i = G.msgs.length - 1; i >= 0; i--) if (G.msgs[i].from === G.me.id) { lastMine = G.msgs[i]; break; }
  let html = G.hasMore ? '<div class="g-older"><button class="g-btn g-sm" data-older>โหลดข้อความก่อนหน้า</button></div>' : '';
  let lastDay = '';
  let prev = null;
  for (const m of G.msgs) {
    const day = dayOf(m.ts);
    if (day !== lastDay) { html += `<div class="g-day"><span>${day}</span></div>`; lastDay = day; prev = null; }
    const mine = m.from === G.me.id;
    const cont = prev && prev.from === m.from && m.ts - prev.ts < 120000;
    html += `<div class="g-msg ${mine ? 'mine' : 'theirs'} ${cont ? 'cont' : ''}">
      <div class="g-bubble">${esc(m.text)}</div><span class="g-time">${timeOf(m.ts)}</span></div>`;
    if (m === lastMine) html += `<div class="g-receipt" id="g-receipt">${G.theirRead >= m.ts ? 'อ่านแล้ว' : 'ส่งแล้ว'}</div>`;
    prev = m;
  }
  box.innerHTML = html;
  const ob = box.querySelector('[data-older]');
  if (ob) ob.onclick = loadOlder;
  if (!keepScroll && (forceBottom || nearBottom)) box.scrollTop = box.scrollHeight;
}

function updateReceipt() {
  const el = root.querySelector('#g-receipt');
  if (!el) return;
  const lastMine = [...G.msgs].reverse().find((m) => m.from === G.me.id);
  if (lastMine) el.textContent = G.theirRead >= lastMine.ts ? 'อ่านแล้ว' : 'ส่งแล้ว';
}

/* ----------------- realtime + sync ----------------- */
// Realtime comes from /api/stream (Upstash Pub/Sub → SSE). A light sync poll runs every 30s as a
// safety net, and every 3s only while the stream is down.
function startPoll() {
  stopPoll();
  G.ticks = 0;
  G.lastPoll = 0;
  G.timer = setInterval(() => {
    if (document.hidden) return;
    const gap = G.live ? FALLBACK_SYNC_MS : POLL_MS;
    if (Date.now() - G.lastPoll >= gap) poll();
  }, 1000);
  startStream();
}
function stopPoll() {
  if (G.timer) clearInterval(G.timer);
  G.timer = null;
  stopStream();
}

function setLive(v) {
  G.live = v;
  const el = root.querySelector('#g-live');
  if (el) { el.classList.toggle('on', v); el.title = v ? 'เชื่อมต่อแบบเรียลไทม์' : 'กำลังเชื่อมต่อ…'; }
}

function stopStream() {
  if (G.stream) G.stream.abort();
  G.stream = null;
  setLive(false);
}

async function startStream() {
  stopStream();
  const ctrl = new AbortController();
  G.stream = ctrl;
  let backoff = 1000;
  while (G.stream === ctrl) {
    try {
      const res = await fetch('/api/stream', {
        method: 'POST', headers: { Authorization: `Bearer ${G.token}` }, signal: ctrl.signal, cache: 'no-store',
      });
      if (res.status === 401) { sessionExpired(); return; }
      if (!res.ok || !res.body) throw new Error('stream ' + res.status);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
          if (!data) continue;
          try { onEvent(JSON.parse(data)); } catch {}
          backoff = 1000;
        }
      }
    } catch {
      if (ctrl.signal.aborted) return;
    }
    if (G.stream !== ctrl) return;
    setLive(false);
    await new Promise((r) => setTimeout(r, backoff));
    backoff = Math.min(backoff * 2, 15000);
  }
}

function onEvent(ev) {
  switch (ev.t) {
    case 'ready': setLive(true); poll(); break; // catch up on anything sent while reconnecting
    case 'msg': onIncoming(ev.m); break;
    case 'freq': G.reqCount++; updateReqBadge(); toast('📨 มีคำขอเป็นเพื่อนใหม่'); break;
    case 'friend': loadFriends(); break;
    case 'logout': sessionExpired(); break;
    case 'read': // the friend read my messages
      { const f = G.friends.find((x) => x.id === ev.by); if (f) f.theirRead = Math.max(f.theirRead || 0, ev.ts); }
      if (G.active && G.active.id === ev.by) { G.theirRead = Math.max(G.theirRead, ev.ts); updateReceipt(); }
      break;
    case 'seen': // I read this chat on another device
      { const f = G.friends.find((x) => x.id === ev.with); if (f) { f.unread = 0; renderFriends(); } }
      break;
  }
}

function onIncoming(m) {
  if (!m || !G.me) return;
  const other = m.from === G.me.id ? m.to : m.from;
  const f = G.friends.find((x) => x.id === other);
  if (!f) { loadFriends(); return; }
  f.lastTs = Math.max(f.lastTs || 0, m.ts);
  if (m.from !== G.me.id && !(G.active && G.active.id === other && !document.hidden)) f.unread = (f.unread || 0) + 1;
  if (G.active && G.active.id === other) addMessages([m]);
  else if (m.from !== G.me.id) toast(`💬 <b>${esc(f.username)}</b>: ${esc(m.text.slice(0, 60))}`);
  renderFriends();
}
async function poll() {
  if (G.polling || !G.token || !G.me) return;
  G.polling = true;
  G.lastPoll = Date.now();
  const activeId = G.active?.id;
  const seq = G.chatSeq;
  try {
    const j = await api('poll', activeId ? { with: activeId, since: G.lastTs } : {});
    G.reqCount = j.reqCount;
    updateReqBadge();
    let unknown = false;
    for (const [fid, ts] of Object.entries(j.conv || {})) {
      const f = G.friends.find((x) => x.id === fid);
      if (f) f.lastTs = Number(ts);
      else unknown = true;
    }
    for (const f of G.friends) f.unread = Number(j.unread?.[f.id] || 0);
    if (activeId && seq === G.chatSeq && j.theirRead) { G.theirRead = Math.max(G.theirRead, j.theirRead); updateReceipt(); }
    if (activeId && seq === G.chatSeq && j.messages) addMessages(j.messages);
    G.ticks++;
    if (unknown || G.ticks % 4 === 0) await loadFriends();
    else renderFriends();
  } catch {} finally {
    G.polling = false;
  }
}

/* ----------------- modals ----------------- */
function openAddFriend() {
  const m = openModal({
    title: '➕ เพิ่มเพื่อน', className: 'modal-sm g-modal',
    body: `<form class="g-row" data-form><input name="id" placeholder="ใส่ User ID เช่น 100001" autocomplete="off" required>
      <button class="g-btn g-primary">ค้นหา</button></form><div data-out></div>`,
  });
  const form = m.body.querySelector('[data-form]');
  const out = m.body.querySelector('[data-out]');
  form.querySelector('input').focus();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const id = form.querySelector('input').value.trim();
    if (!id) return;
    out.innerHTML = '<div class="g-loading sm"><div class="g-spin"></div></div>';
    try {
      const j = await api('user_search', { id });
      const u = j.user;
      let action = '<button class="g-btn g-primary" data-req>ส่งคำขอเป็นเพื่อน</button>';
      if (j.self) action = '<span class="g-muted">นี่คือคุณเอง</span>';
      else if (j.isFriend) action = '<button class="g-btn" data-chat>เป็นเพื่อนกันแล้ว · แชทเลย</button>';
      else if (j.requested) action = '<span class="g-muted">ส่งคำขอแล้ว รอการตอบรับ</span>';
      else if (j.incoming) action = '<button class="g-btn g-primary" data-req>ตอบรับคำขอ</button>';
      out.innerHTML = `<div class="g-user-card">${avatar(u)}<div class="g-f-txt"><b>${esc(u.username)}</b><small>ID ${esc(u.id)}</small></div></div>
        <div class="modal-actions">${action}</div>`;
      const rb = out.querySelector('[data-req]');
      if (rb) rb.onclick = async () => {
        rb.disabled = true;
        try {
          const r = await api('friend_request', { id: u.id });
          toast(r.status === 'accepted' ? `เป็นเพื่อนกับ ${esc(u.username)} แล้ว` : 'ส่งคำขอแล้ว');
          m.close();
          if (r.status === 'accepted') loadFriends();
        } catch (ex) { toast(esc(ex.message), 'bad'); rb.disabled = false; }
      };
      const cb = out.querySelector('[data-chat]');
      if (cb) cb.onclick = () => { m.close(); openChat(G.friends.find((f) => f.id === u.id)); };
    } catch (ex) {
      out.innerHTML = `<p class="g-err">${esc(ex.message)}</p>`;
    }
  };
}

async function openRequests() {
  const m = openModal({ title: '📨 คำขอเป็นเพื่อน', className: 'modal-sm g-modal', body: '<div class="g-loading sm"><div class="g-spin"></div></div>' });
  const draw = async () => {
    try {
      const j = await api('friend_requests');
      G.reqCount = j.requests.length;
      updateReqBadge();
      if (!j.requests.length) { m.body.innerHTML = '<p class="g-empty">ไม่มีคำขอใหม่</p>'; return; }
      m.body.innerHTML = `<ul class="g-list">${j.requests.map((u) => `
        <li>${avatar(u, 'sm')}<div class="g-f-txt"><b>${esc(u.username)}</b><small>ID ${esc(u.id)}</small></div>
          <button class="g-btn g-primary g-sm" data-acc="${esc(u.id)}">ตอบรับ</button>
          <button class="g-btn g-sm" data-dec="${esc(u.id)}">ปฏิเสธ</button></li>`).join('')}</ul>`;
      m.body.querySelectorAll('[data-acc],[data-dec]').forEach((b) => (b.onclick = async () => {
        b.disabled = true;
        const accept = b.hasAttribute('data-acc');
        try {
          await api('friend_respond', { id: b.dataset.acc || b.dataset.dec, accept });
          if (accept) { toast('เพิ่มเพื่อนแล้ว'); loadFriends(); }
          draw();
        } catch (ex) { toast(esc(ex.message), 'bad'); b.disabled = false; }
      }));
    } catch (ex) { m.body.innerHTML = `<p class="g-err">${esc(ex.message)}</p>`; }
  };
  draw();
}

async function openInvites() {
  const m = openModal({ title: '🎟️ รหัสเชิญ', className: 'modal-sm g-modal', body: '<div class="g-loading sm"><div class="g-spin"></div></div>' });
  const left = (s) => (s > 86400 ? `${Math.floor(s / 86400)} วัน` : s > 3600 ? `${Math.floor(s / 3600)} ชม.` : `${Math.max(1, Math.floor(s / 60))} นาที`);
  const draw = async () => {
    try {
      const j = await api('invite_list');
      const full = j.limit != null && j.invites.length >= j.limit;
      m.body.innerHTML = `
        <p class="g-muted">ให้รหัสนี้กับคนที่อยากชวนเข้ากิลด์ ใช้ได้ครั้งเดียว อายุ 7 วัน${j.limit != null ? ` · สร้างได้พร้อมกันสูงสุด ${j.limit} รหัส` : ''}</p>
        <ul class="g-list">${j.invites.map((i) => `
          <li><code class="g-code">${esc(i.code)}</code><small class="g-muted">เหลือ ${left(i.ttl)}</small>
            <button class="g-btn g-sm" data-copy="${esc(i.code)}">คัดลอก</button>
            <button class="g-btn g-sm g-danger" data-rev="${esc(i.code)}">ยกเลิก</button></li>`).join('') || '<li class="g-empty">ยังไม่มีรหัสที่ใช้งานได้</li>'}</ul>
        <div class="modal-actions"><button class="g-btn g-primary" data-new ${full ? 'disabled' : ''}>＋ สร้างรหัสใหม่</button></div>`;
      m.body.querySelector('[data-new]').onclick = async (e) => {
        e.target.disabled = true;
        try {
          const r = await api('invite_create');
          await copyText(r.invite.code);
          toast(`สร้างและคัดลอก ${r.invite.code} แล้ว`);
        } catch (ex) { toast(esc(ex.message), 'bad'); }
        draw();
      };
      m.body.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = async () => { await copyText(b.dataset.copy); toast('คัดลอกแล้ว'); }));
      m.body.querySelectorAll('[data-rev]').forEach((b) => (b.onclick = async () => {
        try { await api('invite_revoke', { code: b.dataset.rev }); draw(); } catch (ex) { toast(esc(ex.message), 'bad'); }
      }));
    } catch (ex) { m.body.innerHTML = `<p class="g-err">${esc(ex.message)}</p>`; }
  };
  draw();
}

async function openAdmin() {
  const m = openModal({ title: '🛡️ แอดมิน · สมาชิกทั้งหมด', className: 'modal-wide g-modal', body: '<div class="g-loading sm"><div class="g-spin"></div></div>' });
  const draw = async () => {
    try {
      const j = await api('admin_users');
      const byId = Object.fromEntries(j.users.map((u) => [u.id, u]));
      m.body.innerHTML = `<p class="g-muted">สมาชิก ${j.users.length} คน</p>
        <div class="g-table-wrap"><table class="g-table"><thead><tr><th>ID</th><th>ชื่อ</th><th>เชิญโดย</th><th>สมัครเมื่อ</th><th></th></tr></thead><tbody>
        ${j.users.map((u) => `<tr class="${u.banned ? 'banned' : ''}">
          <td><code>${esc(u.id)}</code></td><td>${esc(u.username)}${u.role === 'admin' ? ' 👑' : ''}</td>
          <td>${u.invitedBy ? esc(byId[u.invitedBy]?.username || u.invitedBy) : '—'}</td>
          <td>${u.createdAt ? dayOf(u.createdAt) : ''}</td>
          <td>${u.id === G.me.id ? '' : `<button class="g-btn g-sm ${u.banned ? '' : 'g-danger'}" data-ban="${esc(u.id)}" data-v="${u.banned ? 0 : 1}">${u.banned ? 'ปลดระงับ' : 'ระงับ'}</button>`}</td>
        </tr>`).join('')}</tbody></table></div>`;
      m.body.querySelectorAll('[data-ban]').forEach((b) => (b.onclick = async () => {
        const banned = b.dataset.v === '1';
        if (banned && !(await confirmBox('ระงับบัญชี', `ระงับผู้ใช้ ID <b>${esc(b.dataset.ban)}</b>? ผู้ใช้จะถูกออกจากระบบทันที`, 'ระงับ', true))) return;
        try { await api('admin_ban', { id: b.dataset.ban, banned }); draw(); } catch (ex) { toast(esc(ex.message), 'bad'); }
      }));
    } catch (ex) { m.body.innerHTML = `<p class="g-err">${esc(ex.message)}</p>`; }
  };
  draw();
}

function openAccount() {
  const me = G.me;
  const m = openModal({
    title: '👤 บัญชี', className: 'modal-sm g-modal',
    body: `<div class="g-user-card">${avatar(me)}<div class="g-f-txt"><b>${esc(me.username)}</b><small>ID ${esc(me.id)}${me.role === 'admin' ? ' · 👑 Admin' : ''}</small></div></div>
      <details class="g-details"><summary>เปลี่ยนรหัสผ่าน</summary>
        <form data-pw class="g-form">
          <label>รหัสผ่านเดิม<input type="password" name="old" autocomplete="current-password" required></label>
          <label>รหัสผ่านใหม่<input type="password" name="new" autocomplete="new-password" required minlength="6"></label>
          <button class="g-btn g-primary">บันทึก</button>
        </form></details>
      <div class="modal-actions"><button class="g-btn g-danger" data-logout>ออกจากระบบ</button></div>`,
  });
  m.body.querySelector('[data-pw]').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('change_password', { oldPassword: f.old.value, newPassword: f.new.value });
      toast('เปลี่ยนรหัสผ่านแล้ว');
      m.close();
    } catch (ex) { toast(esc(ex.message), 'bad'); }
  };
  m.body.querySelector('[data-logout]').onclick = async () => {
    try { await api('logout'); } catch {}
    setToken(null);
    G.me = null;
    G.active = null;
    G.friends = [];
    G.greeted = false;
    stopPoll();
    m.close();
    renderAuth('login');
  };
}

function openFriendMenu(f) {
  const m = openModal({
    title: esc(f.username), className: 'modal-sm g-modal',
    body: `<div class="g-user-card">${avatar(f)}<div class="g-f-txt"><b>${esc(f.username)}</b><small>ID ${esc(f.id)}</small></div></div>
      <div class="modal-actions"><button class="g-btn" data-copy>คัดลอก ID</button><button class="g-btn g-danger" data-rm>ลบเพื่อน</button></div>`,
  });
  m.body.querySelector('[data-copy]').onclick = async () => { await copyText(f.id); toast('คัดลอกแล้ว'); };
  m.body.querySelector('[data-rm]').onclick = async () => {
    if (!(await confirmBox('ลบเพื่อน', `ลบ <b>${esc(f.username)}</b> ออกจากรายชื่อเพื่อน?`, 'ลบ', true))) return;
    try {
      await api('friend_remove', { id: f.id });
      m.close();
      G.active = null;
      G.chatSeq++;
      G.friends = G.friends.filter((x) => x.id !== f.id);
      renderChat();
      renderFriends();
    } catch (ex) { toast(esc(ex.message), 'bad'); }
  };
}
