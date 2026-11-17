// Supabase DB 저장소. 모양은 store.js(연습 모드)와 같다(설명은 store.js 맨 위).
// 누가 무엇을 할 수 있는지는 schema.sql의 RLS 규칙이 서버에서 정한다. 여기서 막는 것은 화면 편의일 뿐이다.

const LIMIT = 200;
const nameOf = (r) => r.profiles?.name || '알 수 없음';
const DEFAULT_SETTINGS = {
  dday: { title: '두레 런칭', date: '2026-12-31T00:00:00+09:00' },
  links: { site: '', github: '' },
};

function check(error) {
  if (error) throw new Error(error.message || '서버 요청에 실패했어요.');
}

export function createSupabaseStore(supabase, me) {
  const from = (t) => supabase.from(t);
  const bucket = () => supabase.storage.from('works');

  return {
    async list(kind) {
      if (kind === 'works') {
        const { data, error } = await from('works')
          .select('id, title, description, link, image_path, created_at, author_id, profiles!author_id(name)')
          .order('created_at', { ascending: false }).limit(LIMIT);
        check(error);
        return data.map((r) => ({ id: r.id, title: r.title, desc: r.description, link: r.link, imagePath: r.image_path, author: nameOf(r), authorId: r.author_id, date: r.created_at }));
      }
      const { data, error } = await from('opinions')
        .select('id, body, created_at, author_id, profiles!author_id(name), opinion_likes(user_id)')
        .order('created_at', { ascending: false }).limit(LIMIT);
      check(error);
      return data.map((r) => ({ id: r.id, text: r.body, author: nameOf(r), authorId: r.author_id, date: r.created_at, likes: (r.opinion_likes || []).map((l) => l.user_id) }));
    },
    async addWork({ title, desc, link, image }) {
      let imagePath = null;
      if (image) {
        imagePath = `${me.uid}/${crypto.randomUUID()}.${image.ext}`;
        const up = await bucket().upload(imagePath, image.blob, { contentType: image.type, upsert: false });
        check(up.error);
      }
      const { error } = await from('works').insert({ title, description: desc, link, image_path: imagePath });
      if (error && imagePath) await bucket().remove([imagePath]); // 글이 안 올라갔으면 그림도 치운다
      check(error);
    },
    async imageUrls(works) {
      const paths = works.map((w) => w.imagePath).filter(Boolean);
      if (!paths.length) return {};
      const { data, error } = await bucket().createSignedUrls(paths, 3600);
      check(error);
      const byPath = Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
      return Object.fromEntries(works.filter((w) => byPath[w.imagePath]).map((w) => [w.id, byPath[w.imagePath]]));
    },
    async addOpinion({ text }) { check((await from('opinions').insert({ body: text })).error); },
    async toggleLike(id, liked) {
      const { error } = liked
        ? await from('opinion_likes').delete().eq('opinion_id', id).eq('user_id', me.uid)
        : await from('opinion_likes').insert({ opinion_id: id });
      check(error);
    },
    async remove(kind, id) {
      if (kind === 'works') {
        const { data, error } = await from('works').delete().eq('id', id).select('image_path');
        check(error);
        const paths = (data || []).map((r) => r.image_path).filter(Boolean);
        if (paths.length) await bucket().remove(paths); // 실패해도 글은 이미 지워졌으니 넘어간다
        return;
      }
      check((await from(kind).delete().eq('id', id)).error);
    },

    async agendas() {
      const { data, error } = await from('agendas')
        .select('id, title, body, created_at, author_id, profiles!author_id(name), agenda_comments(count)')
        .order('created_at', { ascending: false }).limit(LIMIT);
      check(error);
      return data.map((r) => ({ id: r.id, title: r.title, body: r.body, author: nameOf(r), authorId: r.author_id, date: r.created_at, commentCount: r.agenda_comments?.[0]?.count ?? 0 }));
    },
    async addAgenda({ title, body }) { check((await from('agendas').insert({ title, body })).error); },
    async comments(agendaId) {
      const { data, error } = await from('agenda_comments')
        .select('id, body, created_at, author_id, profiles!author_id(name)')
        .eq('agenda_id', agendaId).order('created_at', { ascending: true }).limit(LIMIT);
      check(error);
      return data.map((r) => ({ id: r.id, text: r.body, author: nameOf(r), authorId: r.author_id, date: r.created_at }));
    },
    async addComment(agendaId, text) { check((await from('agenda_comments').insert({ agenda_id: agendaId, body: text })).error); },

    async events() {
      const since = new Date(Date.now() - 7 * 864e5).toISOString(); // 지난 일주일 것까지
      const { data, error } = await from('events')
        .select('id, title, starts_at, place, author_id, profiles!author_id(name), event_rsvps(user_id, status)')
        .gte('starts_at', since).order('starts_at', { ascending: true }).limit(LIMIT);
      check(error);
      return data.map((r) => ({ id: r.id, title: r.title, startsAt: r.starts_at, place: r.place, author: nameOf(r), authorId: r.author_id, rsvps: (r.event_rsvps || []).map((x) => ({ userId: x.user_id, status: x.status })) }));
    },
    async addEvent({ title, startsAt, place }) { check((await from('events').insert({ title, starts_at: startsAt, place })).error); },
    async setRsvp(eventId, status, hadOne) {
      let res;
      if (!status) res = await from('event_rsvps').delete().eq('event_id', eventId).eq('user_id', me.uid);
      else if (hadOne) res = await from('event_rsvps').update({ status }).eq('event_id', eventId).eq('user_id', me.uid);
      else res = await from('event_rsvps').insert({ event_id: eventId, status });
      check(res.error);
    },

    async visits(sinceDay) {
      const { data, error } = await from('visits').select('user_id, day').gte('day', sinceDay).limit(5000);
      check(error);
      return data.map((r) => ({ userId: r.user_id, day: r.day }));
    },
    async markVisit() { check((await supabase.rpc('mark_visit')).error); },

    async settings() {
      const { data, error } = await from('club_settings').select('key, value');
      check(error);
      const s = Object.fromEntries(data.map((r) => [r.key, r.value]));
      return { dday: { ...DEFAULT_SETTINGS.dday, ...s.dday }, links: { ...DEFAULT_SETTINGS.links, ...s.links } };
    },
    async saveSetting(key, value) {
      const { data, error } = await from('club_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key).select('key');
      check(error);
      if (!data?.length) throw new Error('관리자만 바꿀 수 있어요.');
    },

    async members() {
      const { data, error } = await from('profiles').select('id, name, look, room').order('room', { ascending: true, nullsFirst: false });
      check(error);
      return data;
    },

    async decor() {
      const { data, error } = await from('room_decor').select('room, items, rug');
      check(error);
      return Object.fromEntries(data.map((r) => [r.room, { items: r.items, rug: r.rug }]));
    },
    async saveDecor(room, { items, rug }) {
      const upd = await from('room_decor').update({ owner_id: me.uid, items, rug, updated_at: new Date().toISOString() }).eq('room', room).select('room');
      check(upd.error);
      if (upd.data?.length) return;
      check((await from('room_decor').insert({ room, items, rug })).error);
    },

    async starCaught(slot) {
      const { data, error } = await from('star_catches').select('user_id').eq('slot', slot).maybeSingle();
      check(error);
      return data?.user_id || null;
    },
    async catchStar(slot) {
      const { error } = await from('star_catches').insert({ slot });
      if (!error) return true;
      if (error.code === '23505' || error.code === '42501') return false; // 이미 누가 주웠거나 시간이 지남
      check(error);
      return false;
    },
    async starRanking(sinceIso) {
      const { data, error } = await from('star_catches').select('user_id').gte('caught_at', sinceIso).limit(10000);
      check(error);
      const counts = {};
      for (const r of data) counts[r.user_id] = (counts[r.user_id] || 0) + 1;
      return Object.entries(counts).map(([userId, count]) => ({ userId, count })).sort((a, b) => b.count - a.count);
    },

    onChange() { /* 다른 사람이 바꾸면 net-supabase의 'posted' 신호로 새로고침한다 */ },
  };
}
