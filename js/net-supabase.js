// Supabase Realtime으로 광장 실시간 연결. 바깥에서 쓰는 모양은 net.js(연습 모드)와 같다.
// - Presence: 누가 접속해 있는지 (들어오고 나가는 것은 서버가 알려 줌)
// - Broadcast: 움직임(state), 채팅(chat), 새 글 알림(posted)
// 'plaza'는 비공개 채널이라 로그인한 동아리원만 들어올 수 있다(schema.sql의 realtime.messages 규칙).
//
// 메시지 아끼기: 위치를 매 순간 보내지 않고 "어디서 어느 방향으로 걷기 시작했는지"만 보낸다.
// 받는 쪽은 같은 속도로 걸려 보면서(예측) 다음 메시지가 오면 살짝 보정한다.

const MAX_CHAT = 120;
export const POSTED_KINDS = ['works', 'opinions', 'agendas', 'agenda_comments', 'events', 'settings', 'profiles', 'visits'];
const clean = (m) => {
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  const c = (v) => Math.max(-1, Math.min(1, n(v) || 0));
  return {
    name: String(m?.name || '익명').slice(0, 12),
    look: m?.look,
    x: n(m?.x), y: n(m?.y),
    dir: m?.dir, moving: !!m?.moving, vx: c(m?.vx), vy: c(m?.vy),
  };
};

export function createSupabaseNet(supabase, me, on) {
  const ch = supabase.channel('plaza', {
    config: { private: true, broadcast: { self: false }, presence: { key: me.id } },
  });
  let last = {};
  let ready = false;
  let synced = false;
  let known = new Set();

  const send = (event, payload) => {
    if (!ready) return;
    ch.send({ type: 'broadcast', event, payload: { id: me.id, name: me.name, look: me.look, ...payload } });
  };

  ch.on('presence', { event: 'sync' }, () => {
    const state = ch.presenceState();
    const now = new Set();
    let someoneNew = false;
    for (const [key, metas] of Object.entries(state)) {
      if (key === me.id || !metas.length) continue;
      now.add(key);
      if (!known.has(key)) {
        someoneNew = true;
        on.join({ id: key, ...clean(metas[metas.length - 1]) }, synced);
      }
    }
    for (const key of known) if (!now.has(key)) on.leave(key);
    known = now;
    synced = true;
    if (someoneNew) send('state', last); // 새로 온 사람이 내 지금 위치를 알 수 있게
  });

  ch.on('broadcast', { event: 'state' }, ({ payload }) => {
    if (!payload || typeof payload.id !== 'string' || payload.id === me.id) return;
    on.state({ id: payload.id, ...clean(payload) });
  });
  ch.on('broadcast', { event: 'chat' }, ({ payload }) => {
    if (!payload || typeof payload.id !== 'string' || payload.id === me.id) return;
    on.chat({ id: payload.id, name: clean(payload).name, text: String(payload.text || '').slice(0, MAX_CHAT) });
  });
  ch.on('broadcast', { event: 'posted' }, ({ payload }) => {
    if (payload && POSTED_KINDS.includes(payload.kind)) on.posted?.(payload.kind);
  });
  ch.on('broadcast', { event: 'emote' }, ({ payload }) => {
    if (!payload || typeof payload.id !== 'string' || payload.id === me.id) return;
    const n = Number(payload.emote);
    if (Number.isInteger(n) && n >= 1 && n <= 9) on.emote?.({ id: payload.id, emote: n });
  });

  (async () => {
    await supabase.realtime.setAuth();
    ch.subscribe(async (status, err) => {
      if (status === 'SUBSCRIBED') {
        ready = true;
        await ch.track({ name: me.name, look: me.look, ...last });
        on.status?.('online');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        ready = false;
        on.status?.('error', err);
      } else if (status === 'CLOSED') {
        ready = false;
      }
    });
  })();

  return {
    online: true,
    heartbeatMs: 0,      // 접속 여부는 Presence가 알려 주므로 따로 안 보냄
    peerTimeout: 0,
    hello(state) { last = state; },
    move(state) { last = state; send('state', state); },
    chat(text) { send('chat', { text: String(text).slice(0, MAX_CHAT) }); },
    posted(kind) { send('posted', { kind }); },
    emote(n) { send('emote', { emote: n }); },
    close() { supabase.removeChannel(ch); },
  };
}
