// 연습 모드 저장소. 이 브라우저(localStorage)에만 저장한다.
// Supabase 모드는 store-supabase.js. 둘 다 같은 모양(모두 async)이라 화면 코드는 어느 쪽인지 모른다.
//
// 글:   list('works' | 'opinions'), addWork, addOpinion, toggleLike(id, liked), remove(kind, id)
// 안건: agendas(), addAgenda({ title, body }), comments(agendaId), addComment(agendaId, text)
// 일정: events(), addEvent({ title, startsAt, place }), setRsvp(eventId, status | null, hadOne)
// 잔디: visits(sinceDay) → [{ userId, day }], markVisit()
// 설정: settings() → { dday: { title, date }, links: { site, github } }, saveSetting(key, value)
// 사람: members() → [{ id, name, look, room }]
// 미니룸: decor() → { [room]: { items, rug } }, saveDecor(room, { items, rug })
// 이미지: addWork({ ..., image: { blob, ext } }), imageUrls(works) → { [workId]: url }
// 별: starCaught(slot) → userId | null, catchStar(slot) → true(내가 주움) | false(이미 누가), starRanking(sinceIso) → [{ userId, count }]
// remove의 kind: works, opinions, agendas, agenda_comments, events

const now = () => new Date().toISOString();
const KEY = (k) => `plaza.${k}.v1`;
const DEFAULT_SETTINGS = {
  dday: { title: '두레 런칭', date: '2026-12-31T00:00:00+09:00' },
  links: { site: '', github: '' },
};

const SEED = {
  works: [{ id: 'seed-w1', title: '(예시) 동아리 로고 시안', author: '예시', authorId: '', desc: '광장 간판에 쓸 로고 시안이에요. 이런 식으로 작업을 올리면 돼요.', link: '', date: now() }],
  opinions: [{ id: 'seed-o1', author: '예시', authorId: '', text: '(예시) 다음 모임은 금요일 저녁 어때요?', date: now(), likes: [] }],
  agendas: [{ id: 'seed-a1', author: '예시', authorId: '', title: '(예시) 두레 첫 화면 디자인 정하기', body: 'A안과 B안 중 어떤 게 좋을까요?', date: now() }],
};

function load(kind, fallback = []) {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(kind)));
    if (v != null) return v;
  } catch { /* 저장소를 못 쓰면 기본값 */ }
  return structuredClone(SEED[kind] || fallback);
}
function save(kind, v) {
  try { localStorage.setItem(KEY(kind), JSON.stringify(v)); } catch { /* 무시 */ }
}
const newest = (a, b) => (a.date < b.date ? 1 : -1);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const blobToDataUrl = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(new Error('그림을 읽지 못했어요.'));
  r.readAsDataURL(blob);
});
export const kstDay =(d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);

export function createLocalStore(me) {
  const mine = () => ({ id: uid(), author: me.name, authorId: me.uid, date: now() });
  const push = (kind, item) => { const list = load(kind); list.push(item); save(kind, list); };

  return {
    async list(kind) { return load(kind).sort(newest); },
    async addWork({ title, desc, link, image }) {
      // 연습 모드는 그림을 작게 줄인 data URL로 이 브라우저에 저장 (용량 한도가 작아서)
      const dataUrl = image ? await blobToDataUrl(image.small || image.blob) : '';
      const item = { ...mine(), title, desc, link, image: dataUrl };
      const list = load('works');
      list.push(item);
      try { localStorage.setItem(KEY('works'), JSON.stringify(list)); } catch { throw new Error('이 브라우저 저장 공간이 꽉 찼어요. 연습 모드에서는 그림을 몇 장만 올릴 수 있어요.'); }
    },
    async imageUrls(works) {
      return Object.fromEntries(works.filter((w) => w.image).map((w) => [w.id, w.image]));
    },
    async addOpinion({ text }) { push('opinions', { ...mine(), text, likes: [] }); },
    async toggleLike(id, liked) {
      const list = load('opinions');
      const item = list.find((o) => o.id === id);
      if (!item) return;
      const likes = (item.likes || []).filter((w) => w !== me.uid);
      item.likes = liked ? likes : [...likes, me.uid];
      save('opinions', list);
    },
    async remove(kind, id) {
      save(kind, load(kind).filter((x) => x.id !== id));
      if (kind === 'agendas') save('agenda_comments', load('agenda_comments').filter((c) => c.agendaId !== id));
    },

    async agendas() {
      const comments = load('agenda_comments');
      return load('agendas').sort(newest).map((a) => ({ ...a, commentCount: comments.filter((c) => c.agendaId === a.id).length }));
    },
    async addAgenda({ title, body }) { push('agendas', { ...mine(), title, body }); },
    async comments(agendaId) {
      return load('agenda_comments').filter((c) => c.agendaId === agendaId).sort((a, b) => (a.date < b.date ? -1 : 1));
    },
    async addComment(agendaId, text) { push('agenda_comments', { ...mine(), agendaId, text }); },

    async events() {
      return load('events').sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
    },
    async addEvent({ title, startsAt, place }) { push('events', { ...mine(), title, startsAt, place, rsvps: [] }); },
    async setRsvp(eventId, status) {
      const list = load('events');
      const ev = list.find((e) => e.id === eventId);
      if (!ev) return;
      ev.rsvps = (ev.rsvps || []).filter((r) => r.userId !== me.uid);
      if (status) ev.rsvps.push({ userId: me.uid, status });
      save('events', list);
    },

    async visits(sinceDay) { return load('visits').filter((v) => v.day >= sinceDay); },
    async markVisit() {
      const list = load('visits');
      const day = kstDay();
      if (!list.some((v) => v.userId === me.uid && v.day === day)) { list.push({ userId: me.uid, day }); save('visits', list); }
    },

    async settings() {
      const s = load('settings', {});
      return { dday: { ...DEFAULT_SETTINGS.dday, ...s.dday }, links: { ...DEFAULT_SETTINGS.links, ...s.links } };
    },
    async saveSetting(key, value) { const s = load('settings', {}); s[key] = value; save('settings', s); },

    async members() {
      return [{ id: me.uid, name: me.name, look: me.look, room: me.room ?? null }];
    },

    async decor() { return load('decor', {}); },
    async saveDecor(room, value) { const d = load('decor', {}); d[room] = value; save('decor', d); },

    async starCaught(slot) { return load('stars').find((s) => s.slot === slot)?.userId || null; },
    async catchStar(slot) {
      const list = load('stars');
      if (list.some((s) => s.slot === slot)) return false;
      list.push({ slot, userId: me.uid, at: now() });
      save('stars', list.slice(-2000));
      return true;
    },
    async starRanking(sinceIso) {
      const counts = {};
      for (const s of load('stars')) if (s.at >= sinceIso) counts[s.userId] = (counts[s.userId] || 0) + 1;
      return Object.entries(counts).map(([userId, count]) => ({ userId, count })).sort((a, b) => b.count - a.count);
    },

    onChange(fn) {
      window.addEventListener('storage', (e) => {
        const m = /^plaza\.(\w+)\.v1$/.exec(e.key || '');
        if (m) fn(m[1]);
      });
    },
  };
}
