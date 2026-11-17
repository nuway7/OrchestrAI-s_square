// 연습 모드 실시간 연결. 같은 브라우저의 다른 탭끼리만 주고받는다(BroadcastChannel).
// Supabase 모드는 net-supabase.js. 둘 다 바깥에서 쓰는 모양이 같다:
//   const net = createLocalNet(me, { join, state, chat, leave, posted });
//   net.hello(state); net.move(state); net.chat(text); net.posted(kind); net.close();

const CHANNEL = 'club-plaza-v1';
const MAX_CHAT = 120;

const clean = (m) => {
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  const c = (v) => Math.max(-1, Math.min(1, n(v) || 0));
  return {
    name: String(m.name || '익명').slice(0, 12),
    look: m.look,
    x: n(m.x), y: n(m.y),
    dir: m.dir, moving: !!m.moving, vx: c(m.vx), vy: c(m.vy),
  };
};

export function createLocalNet(me, on) {
  const base = { heartbeatMs: 2000, peerTimeout: 7000, posted() {} };
  if (!('BroadcastChannel' in window)) {
    return { ...base, online: false, hello() {}, move() {}, chat() {}, emote() {}, star() {}, close() {} };
  }
  const ch = new BroadcastChannel(CHANNEL);
  let last = {};

  const post = (type, data = {}) => ch.postMessage({ type, id: me.id, name: me.name, look: me.look, ...data });

  ch.onmessage = (ev) => {
    const m = ev.data;
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || m.id === me.id) return;
    const p = { id: m.id, ...clean(m) };
    switch (m.type) {
      case 'hello':
        on.join(p, true);
        post('here', last); // 새로 온 사람에게 내 위치 알려 주기
        break;
      case 'here':
        on.join(p, false);
        break;
      case 'state':
        on.state(p);
        break;
      case 'chat':
        on.chat({ id: m.id, name: p.name, text: String(m.text || '').slice(0, MAX_CHAT) });
        break;
      case 'star': {
        const slot = Number(m.slot);
        if (Number.isSafeInteger(slot)) on.star?.({ id: m.id, name: p.name, slot });
        break;
      }
      case 'emote': {
        const n = Number(m.emote);
        if (Number.isInteger(n) && n >= 1 && n <= 9) on.emote?.({ id: m.id, emote: n });
        break;
      }
      case 'bye':
        on.leave(m.id);
        break;
    }
  };

  const bye = () => post('bye');
  window.addEventListener('pagehide', bye);

  return {
    ...base,
    online: true,
    hello(state) { last = state; post('hello', state); },
    move(state) { last = state; post('state', state); },
    chat(text) { post('chat', { text: String(text).slice(0, MAX_CHAT) }); },
    emote(n) { post('emote', { emote: n }); },
    star(slot) { post('star', { slot }); },
    close() { bye(); window.removeEventListener('pagehide', bye); ch.close(); },
  };
}
