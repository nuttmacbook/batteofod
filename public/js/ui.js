// Tiny shared UI helpers: modals, toasts, escaping
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const stack = [];

export function openModal({ title = '', body = '', className = '', dismissible = true, onClose } = {}) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal ${className}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${title}</h3>${dismissible ? '<button class="modal-x" aria-label="Close">✕</button>' : ''}</div>
      <div class="modal-body"></div>
    </div>`;
  const bodyEl = ov.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.append(body);

  const m = {
    el: ov,
    body: bodyEl,
    dismissible,
    closed: false,
    close() {
      if (m.closed) return;
      m.closed = true;
      const i = stack.indexOf(m);
      if (i >= 0) stack.splice(i, 1);
      ov.classList.add('closing');
      setTimeout(() => ov.remove(), 160);
      onClose && onClose();
    },
  };
  if (dismissible) {
    ov.querySelector('.modal-x').onclick = () => m.close();
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) m.close(); });
  }
  document.getElementById('modal-root').append(ov);
  stack.push(m);
  return m;
}

export const isModalOpen = () => stack.length > 0;
export const closeAllModals = () => [...stack].forEach((m) => m.close());

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const top = stack[stack.length - 1];
  if (top && top.dismissible) top.close();
});

export function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = msg;
  document.getElementById('toast-root').append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

export function confirmBox(title, text, okLabel = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title,
      className: 'modal-sm',
      body: `<p class="confirm-text">${text}</p>
        <div class="modal-actions"><button class="btn btn-ghost" data-no>Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-gold'}" data-yes>${okLabel}</button></div>`,
      onClose: () => { if (!done) resolve(false); },
    });
    m.body.querySelector('[data-no]').onclick = () => m.close();
    m.body.querySelector('[data-yes]').onclick = () => { done = true; resolve(true); m.close(); };
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    return ok;
  }
}
