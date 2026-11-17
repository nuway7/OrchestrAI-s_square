// Supabase DB 저장소. 모양은 store.js(연습 모드)와 같다.
// 누가 무엇을 할 수 있는지는 schema.sql의 RLS 규칙이 서버에서 정한다. 여기서 막는 것은 화면 편의일 뿐이다.

const LIMIT = 200;
const nameOf = (r) => r.profiles?.name || '알 수 없음';

function check(error) {
  if (error) throw new Error(error.message || '서버 요청에 실패했어요.');
}

export function createSupabaseStore(supabase, me) {
  return {
    async list(kind) {
      if (kind === 'works') {
        const { data, error } = await supabase
          .from('works')
          .select('id, title, description, link, created_at, author_id, profiles(name)')
          .order('created_at', { ascending: false })
          .limit(LIMIT);
        check(error);
        return data.map((r) => ({ id: r.id, title: r.title, desc: r.description, link: r.link, author: nameOf(r), authorId: r.author_id, date: r.created_at }));
      }
      const { data, error } = await supabase
        .from('opinions')
        .select('id, body, created_at, author_id, profiles(name), opinion_likes(user_id)')
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      check(error);
      return data.map((r) => ({ id: r.id, text: r.body, author: nameOf(r), authorId: r.author_id, date: r.created_at, likes: (r.opinion_likes || []).map((l) => l.user_id) }));
    },
    async addWork({ title, desc, link }) {
      const { error } = await supabase.from('works').insert({ title, description: desc, link });
      check(error);
    },
    async addOpinion({ text }) {
      const { error } = await supabase.from('opinions').insert({ body: text });
      check(error);
    },
    async toggleLike(id, liked) {
      const { error } = liked
        ? await supabase.from('opinion_likes').delete().eq('opinion_id', id).eq('user_id', me.uid)
        : await supabase.from('opinion_likes').insert({ opinion_id: id });
      check(error);
    },
    async remove(kind, id) {
      const { error } = await supabase.from(kind).delete().eq('id', id);
      check(error);
    },
    onChange() { /* 다른 사람이 글을 올리면 net-supabase의 'posted' 신호로 새로고침한다 */ },
  };
}
