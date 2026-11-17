// 연습 모드 저장소. 이 브라우저(localStorage)에만 저장한다.
// Supabase 모드는 store-supabase.js. 둘 다 같은 모양(모두 async):
//   list('works' | 'opinions'), addWork({ title, desc, link }), addOpinion({ text }),
//   toggleLike(id, liked), remove(kind, id), onChange(fn)
// 돌려주는 글 모양: { id, title, desc, link, author, authorId, date } / { id, text, author, authorId, date, likes: [uid] }

const KEYS = { works: 'plaza.works.v1', opinions: 'plaza.opinions.v1' };
const now = () => new Date().toISOString();

const SEED = {
  works: [
    { id: 'seed-w1', title: '(예시) 동아리 로고 시안', author: '예시', authorId: '', desc: '광장 간판에 쓸 로고 시안이에요. 이런 식으로 작업을 올리면 돼요.', link: '', date: now() },
  ],
  opinions: [
    { id: 'seed-o1', author: '예시', authorId: '', text: '(예시) 다음 모임은 금요일 저녁 어때요?', date: now(), likes: [] },
  ],
};

function load(kind) {
  try {
    const v = JSON.parse(localStorage.getItem(KEYS[kind]));
    if (Array.isArray(v)) return v;
  } catch { /* 저장소를 못 쓰면 예시만 보여 준다 */ }
  return SEED[kind].map((x) => ({ ...x }));
}

function save(kind, list) {
  try { localStorage.setItem(KEYS[kind], JSON.stringify(list)); } catch { /* 무시 */ }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function createLocalStore(me) {
  return {
    async list(kind) {
      return load(kind).sort((a, b) => (a.date < b.date ? 1 : -1));
    },
    async addWork({ title, desc, link }) {
      const list = load('works');
      list.push({ id: uid(), title, desc, link, author: me.name, authorId: me.uid, date: now() });
      save('works', list);
    },
    async addOpinion({ text }) {
      const list = load('opinions');
      list.push({ id: uid(), text, author: me.name, authorId: me.uid, date: now(), likes: [] });
      save('opinions', list);
    },
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
    },
    onChange(fn) {
      window.addEventListener('storage', (e) => {
        if (e.key === KEYS.works) fn('works');
        if (e.key === KEYS.opinions) fn('opinions');
      });
    },
  };
}
