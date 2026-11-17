// 창(모달)들: 전시관, 의견 게시판, 안내, 작업실 노트북, 일정 게시판, D-day.
// 사용자 글은 모두 textContent로만 넣는다(HTML로 해석하지 않음).
import { kstDay } from './store.js';
import { DECOR_ITEMS, DECOR_GRID, DECOR_MAX, RUG_COLORS, decorSprite, occupancy, fits, cleanDecor } from './decor.js';

const modal = document.getElementById('modal');
const body = document.getElementById('modal-body');
// ctx: { store, me, mode, onPosted(kind), members(), settings(), onSettings(s), visitProgress() }
let ctx = null;
let current = null;   // { kind, arg }
let seq = 0;          // 늦게 도착한 옛 응답이 새 화면을 덮지 않게
let ticker = null;    // D-day 창의 1초 타이머
const laptop = { tab: 'agendas', agendaId: null };

export function setupUI(options) { ctx = options; }

// ---------- 작은 도구 ----------
function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
}

const KST = { timeZone: 'Asia/Seoul' };
const fmtDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', { ...KST, month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
};
const fmtEvent = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', { ...KST, month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
};
// <input type="datetime-local"> 값(내 컴퓨터 시각) ↔ ISO
const toLocalInput = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

const safeUrl = (s) => {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch { return null; }
};

const isAdmin = () => ctx.me.role === 'admin';
const canDelete = (item) => item.authorId && (item.authorId === ctx.me.uid || isAdmin());
const memberName = (id) => ctx.members().find((m) => m.id === id)?.name || (id === ctx.me.uid ? ctx.me.name : '동아리원');

async function act(button, fn) {
  if (button) button.disabled = true;
  try { await fn(); return true; } catch (e) { showError(e); return false; } finally { if (button) button.disabled = false; }
}
function showError(e) {
  const box = body.querySelector('.error');
  const msg = `잠깐 문제가 생겼어요: ${e?.message || e}`;
  if (box) { box.textContent = msg; box.hidden = false; } else alert(msg);
}
const submitBtn = (form) => form.querySelector('[type=submit]');
const errorBox = () => el('p', { class: 'error', hidden: true });

function deleteButton(kind, item, after) {
  if (!canDelete(item)) return null;
  return el('button', {
    class: 'del', type: 'button',
    onclick: async (e) => {
      if (!confirm('지울까요? 지운 것은 되돌릴 수 없어요.')) return;
      if (await act(e.currentTarget, () => ctx.store.remove(kind, item.id))) { ctx.onPosted(kind); after ? after() : render(); }
    },
  }, '지우기');
}

// ---------- 그림 준비: 크기를 줄여 webp(안 되면 jpg)로 ----------
const MAX_UPLOAD = 2 * 1024 * 1024;
async function encode(bmp, max, quality) {
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(bmp.width * scale));
  cv.height = Math.max(1, Math.round(bmp.height * scale));
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(bmp, 0, 0, cv.width, cv.height);
  let blob = await new Promise((r) => cv.toBlob(r, 'image/webp', quality));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', quality));
  if (!blob) throw new Error('그림을 바꾸지 못했어요.');
  return blob;
}
async function prepareImage(file) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('PNG, JPG, WEBP, GIF 그림만 올릴 수 있어요.');
  if (file.size > 20 * 1024 * 1024) throw new Error('그림이 너무 커요. 20MB 이하로 골라 주세요.');
  const bmp = await createImageBitmap(file);
  let blob = await encode(bmp, 1280, 0.85);
  if (blob.size > MAX_UPLOAD) blob = await encode(bmp, 900, 0.72);
  if (blob.size > MAX_UPLOAD) throw new Error('그림을 2MB 이하로 줄이지 못했어요. 더 작은 그림을 골라 주세요.');
  const small = ctx.mode === 'local' ? await encode(bmp, 480, 0.7) : null;
  bmp.close?.();
  return { blob, small, type: blob.type, ext: blob.type === 'image/webp' ? 'webp' : 'jpg' };
}

function openLightbox(src, alt) {
  const box = el('div', { class: 'lightbox', role: 'dialog', 'aria-label': alt, onclick: () => box.remove() },
    el('img', { src, alt }), el('p', {}, '아무 데나 누르면 닫혀요'));
  const onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); box.remove(); } };
  const obs = new MutationObserver(() => { if (!box.isConnected) { window.removeEventListener('keydown', onKey, true); obs.disconnect(); } });
  window.addEventListener('keydown', onKey, true);
  document.body.append(box);
  obs.observe(document.body, { childList: true });
}

// ---------- 전시관 ----------
async function renderGallery() {
  const preview = el('img', { class: 'upload-preview', alt: '', hidden: true });
  let picked = null;
  const fileInput = el('input', { name: 'image', type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
  fileInput.addEventListener('change', () => {
    picked = fileInput.files?.[0] || null;
    if (preview.src) URL.revokeObjectURL(preview.src);
    preview.hidden = !picked;
    if (picked) preview.src = URL.createObjectURL(picked);
  });
  const form = el('form', { class: 'form', hidden: true },
    el('input', { name: 'title', maxlength: '40', placeholder: '작업 제목', required: true }),
    el('textarea', { name: 'desc', maxlength: '400', rows: '3', placeholder: '어떤 작업인지 짧게 소개해 주세요' }),
    el('input', { name: 'link', maxlength: '300', placeholder: '링크 (선택, https://...)' }),
    el('label', { class: 'file-field' }, el('span', {}, '🖼️ 작업 이미지 (선택, 자동으로 줄여서 올려요)'), fileInput),
    preview,
    el('div', { class: 'row' }, el('button', { type: 'submit', class: 'primary' }, '올리기')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const title = String(f.get('title') || '').trim();
    if (!title) return;
    const rawLink = String(f.get('link') || '').trim();
    const link = rawLink ? safeUrl(rawLink) : '';
    if (rawLink && !link) { showError('링크는 https:// 로 시작하는 주소만 넣을 수 있어요.'); return; }
    const ok = await act(submitBtn(form), async () => {
      const image = picked ? await prepareImage(picked) : null;
      await ctx.store.addWork({ title, desc: String(f.get('desc') || '').trim(), link, image });
    });
    if (ok) { ctx.onPosted('works'); render(); }
  });
  const toggle = el('button', { class: 'primary', type: 'button', onclick: () => { form.hidden = !form.hidden; if (!form.hidden) form.querySelector('input').focus(); } }, '+ 작업 올리기');

  const works = await ctx.store.list('works');
  let urls = {};
  try { urls = await ctx.store.imageUrls(works); } catch { /* 그림 없이 보여 준다 */ }
  const list = el('div', { class: 'cards' });
  for (const w of works) {
    const link = w.link && safeUrl(w.link);
    const src = urls[w.id];
    list.append(el('article', { class: `card${src ? ' framed' : ''}` },
      src ? el('button', { type: 'button', class: 'frame', 'aria-label': `${w.title} 크게 보기`, onclick: () => openLightbox(src, w.title) },
        el('img', { src, alt: w.title, loading: 'lazy' })) : null,
      el('h3', {}, w.title),
      el('p', { class: 'meta' }, `${w.author} · ${fmtDate(w.date)}`),
      w.desc ? el('p', {}, w.desc) : null,
      el('div', { class: 'card-foot' },
        link ? el('a', { href: link, target: '_blank', rel: 'noopener noreferrer' }, '작업 보러 가기 ↗') : el('span'),
        deleteButton('works', w),
      ),
    ));
  }
  if (!works.length) list.append(el('p', { class: 'empty' }, '아직 올라온 작업이 없어요. 첫 작업을 올려 주세요!'));
  return [el('div', { class: 'head' }, el('h2', {}, '전시관'), toggle), el('p', { class: 'sub' }, '동아리원들이 지금까지 해 온 작업이에요.'), errorBox(), form, list];
}

// ---------- 의견 게시판 ----------
async function renderBoard() {
  const form = el('form', { class: 'form' },
    el('textarea', { name: 'text', maxlength: '300', rows: '3', placeholder: '하고 싶은 말, 제안, 아이디어를 자유롭게 남겨 주세요', required: true }),
    el('div', { class: 'row' }, el('button', { type: 'submit', class: 'primary' }, '남기기')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = String(new FormData(form).get('text') || '').trim();
    if (!text) return;
    if (await act(submitBtn(form), () => ctx.store.addOpinion({ text }))) { ctx.onPosted('opinions'); render(); }
  });
  const opinions = await ctx.store.list('opinions');
  const list = el('div', { class: 'notes' });
  for (const o of opinions) {
    const likes = o.likes || [];
    const mine = likes.includes(ctx.me.uid);
    list.append(el('article', { class: 'note' },
      el('p', {}, o.text),
      el('div', { class: 'note-foot' },
        el('span', { class: 'meta' }, `${o.author} · ${fmtDate(o.date)}`),
        el('span', { class: 'actions' },
          deleteButton('opinions', o),
          el('button', {
            class: `like${mine ? ' on' : ''}`, type: 'button', 'aria-pressed': String(mine),
            onclick: async (e) => { if (await act(e.currentTarget, () => ctx.store.toggleLike(o.id, mine))) { ctx.onPosted('opinions'); render(); } },
          }, `♥ ${likes.length}`),
        ),
      ),
    ));
  }
  if (!opinions.length) list.append(el('p', { class: 'empty' }, '아직 의견이 없어요. 첫 의견을 남겨 주세요!'));
  return [el('div', { class: 'head' }, el('h2', {}, '의견 게시판')), el('p', { class: 'sub' }, '광장의 자유 발언대예요. 공감하는 의견에는 ♥를 눌러 주세요.'), errorBox(), form, list];
}

// ---------- 안내 ----------
async function renderSign() {
  const rows = [
    ['이동', '방향키 / WASD, 또는 가고 싶은 곳을 클릭·터치'],
    ['말하기', 'Enter를 누르고 입력 → 머리 위에 말풍선'],
    ['감정 표현', '숫자 1~5 키, 또는 채팅창 옆 😊 버튼'],
    ['들어가기', '건물·게시판·노트북 앞에서 E 키 또는 화면 아래 버튼'],
    ['방문 잔디', '하루에 광장에 10분 이상 있으면 그날 잔디가 심어져요'],
    ['별 줍기', '30초마다 광장 어딘가에 별이 떨어져요. 먼저 닿으면 내 것! (위쪽 ⭐ 버튼에서 순위)'],
    ['방 꾸미기', '내 방 노트북의 "방 꾸미기" 탭에서 가구를 놓아요'],
    ['닫기', 'Esc'],
  ];
  const note = ctx.mode === 'supabase'
    ? '로그인한 동아리원만 이 광장과 글을 볼 수 있어요.'
    : '연습 모드: 실시간 접속은 같은 브라우저의 다른 탭끼리만 보이고, 글은 이 브라우저에만 저장돼요.';
  return [
    el('div', { class: 'head' }, el('h2', {}, '광장 안내')),
    el('p', { class: 'sub' }, '작업은 전시관에, 의견은 게시판에, 안건 토론은 작업실 노트북에 남겨 주세요.'),
    el('dl', { class: 'help' }, ...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
    el('p', { class: 'meta' }, note),
  ];
}

// ---------- 작업실 노트북 ----------
async function renderLaptop(room) {
  const owner = ctx.members().find((m) => m.room === room);
  const title = owner ? `${owner.name}의 노트북` : `${room}번 방 노트북`;
  const mine = ctx.me.room === room;
  const tabs = [['agendas', '안건 의견'], ['grass', '방문 잔디'], ['dure', '두레 바로가기'], ...(mine ? [['decor', '🛋️ 방 꾸미기']] : [])];
  if (!tabs.some(([id]) => id === laptop.tab)) laptop.tab = 'agendas';
  const tabBar = el('div', { class: 'tabs', role: 'tablist' }, ...tabs.map(([id, label]) => el('button', {
    type: 'button', role: 'tab', class: `tab${laptop.tab === id ? ' on' : ''}`, 'aria-selected': String(laptop.tab === id),
    onclick: () => { laptop.tab = id; laptop.agendaId = null; render(); },
  }, label)));
  const content = laptop.tab === 'grass' ? await laptopGrass() : laptop.tab === 'dure' ? await laptopDure()
    : laptop.tab === 'decor' ? laptopDecor(room) : await laptopAgendas();
  return [el('div', { class: 'head laptop-head' }, el('span', { class: 'screen-dot' }), el('h2', {}, title)), tabBar, errorBox(), ...content];
}

async function laptopAgendas() {
  if (laptop.agendaId) return laptopAgendaDetail(laptop.agendaId);
  const form = el('form', { class: 'form', hidden: true },
    el('input', { name: 'title', maxlength: '60', placeholder: '안건 제목 (예: 두레 로그인 방식 정하기)', required: true }),
    el('textarea', { name: 'body', maxlength: '500', rows: '3', placeholder: '배경이나 선택지를 적어 주세요 (선택)' }),
    el('div', { class: 'row' }, el('button', { type: 'submit', class: 'primary' }, '안건 올리기')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const title = String(f.get('title') || '').trim();
    if (!title) return;
    if (await act(submitBtn(form), () => ctx.store.addAgenda({ title, body: String(f.get('body') || '').trim() }))) { ctx.onPosted('agendas'); render(); }
  });
  const agendas = await ctx.store.agendas();
  const list = el('div', { class: 'agenda-list' });
  for (const a of agendas) {
    list.append(el('button', { type: 'button', class: 'agenda', onclick: () => { laptop.agendaId = a.id; render(); } },
      el('span', { class: 'agenda-title' }, a.title),
      el('span', { class: 'meta' }, `${a.author} · ${fmtDate(a.date)}`),
      el('span', { class: 'badge' }, `의견 ${a.commentCount}`),
    ));
  }
  if (!agendas.length) list.append(el('p', { class: 'empty' }, '아직 안건이 없어요. 함께 정할 일을 올려 주세요!'));
  return [
    el('div', { class: 'row between' }, el('p', { class: 'sub' }, '함께 정해야 할 안건에 의견을 남겨요.'),
      el('button', { type: 'button', class: 'primary', onclick: () => { form.hidden = !form.hidden; if (!form.hidden) form.querySelector('input').focus(); } }, '+ 새 안건')),
    form, list,
  ];
}

async function laptopAgendaDetail(id) {
  const [agendas, comments] = await Promise.all([ctx.store.agendas(), ctx.store.comments(id)]);
  const a = agendas.find((x) => x.id === id);
  const back = el('button', { type: 'button', class: 'link', onclick: () => { laptop.agendaId = null; render(); } }, '← 안건 목록');
  if (!a) return [back, el('p', { class: 'empty' }, '지워진 안건이에요.')];
  const form = el('form', { class: 'form' },
    el('textarea', { name: 'text', maxlength: '300', rows: '2', placeholder: '이 안건에 대한 내 의견', required: true }),
    el('div', { class: 'row' }, el('button', { type: 'submit', class: 'primary' }, '의견 남기기')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = String(new FormData(form).get('text') || '').trim();
    if (!text) return;
    if (await act(submitBtn(form), () => ctx.store.addComment(id, text))) { ctx.onPosted('agenda_comments'); render(); }
  });
  const list = el('div', { class: 'notes' }, ...comments.map((c) => el('article', { class: 'note' },
    el('p', {}, c.text),
    el('div', { class: 'note-foot' }, el('span', { class: 'meta' }, `${c.author} · ${fmtDate(c.date)}`), deleteButton('agenda_comments', c)),
  )));
  if (!comments.length) list.append(el('p', { class: 'empty' }, '첫 의견을 남겨 주세요.'));
  return [
    back,
    el('article', { class: 'agenda-detail' },
      el('h3', {}, a.title),
      el('p', { class: 'meta' }, `${a.author} · ${fmtDate(a.date)}`),
      a.body ? el('p', {}, a.body) : null,
      el('div', { class: 'row' }, deleteButton('agendas', a, () => { laptop.agendaId = null; render(); })),
    ),
    list, form,
  ];
}

const GRASS_WEEKS = 18;
const addDays = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function laptopGrass() {
  const today = kstDay();
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const start = addDays(today, -(GRASS_WEEKS - 1) * 7 - dow); // 일요일부터
  const visits = await ctx.store.visits(start);
  const people = ctx.members().slice();
  if (!people.some((m) => m.id === ctx.me.uid)) people.push({ id: ctx.me.uid, name: ctx.me.name, room: ctx.me.room });
  people.sort((a, b) => (a.room ?? 99) - (b.room ?? 99));

  const progress = ctx.visitProgress();
  const rows = people.map((m) => {
    const days = new Set(visits.filter((v) => v.userId === m.id).map((v) => v.day));
    const grid = el('div', { class: 'grass', role: 'img', 'aria-label': `${m.name} 방문 ${days.size}일` });
    for (let i = 0; i < GRASS_WEEKS * 7; i++) {
      const day = addDays(start, i);
      if (day > today) { grid.append(el('span', { class: 'cell future' })); continue; }
      grid.append(el('span', { class: `cell${days.has(day) ? ' on' : ''}${day === today ? ' today' : ''}`, title: `${day}${days.has(day) ? ' 방문' : ''}` }));
    }
    return el('div', { class: 'grass-row' },
      el('div', { class: 'grass-name' }, el('b', {}, m.name), el('span', { class: 'meta' }, `${m.room ? `${m.room}번 방 · ` : ''}${days.size}일`)),
      grid,
    );
  });
  return [
    el('p', { class: 'sub' }, `하루에 광장에 10분 이상 머물면 그날 칸이 초록색이 돼요. 최근 ${GRASS_WEEKS}주.`),
    el('p', { class: 'progress' }, progress.done ? '🌱 오늘 잔디는 이미 심었어요!' : `오늘 머문 시간 ${progress.minutes}분 / 10분`),
    el('div', { class: 'grass-list' }, ...rows),
  ];
}

async function laptopDure() {
  const { links } = await ctx.settings();
  const site = safeUrl(links.site || ''), github = safeUrl(links.github || '');
  const parts = [
    el('p', { class: 'sub' }, '우리가 개발 중인 두레로 바로 가요.'),
    el('div', { class: 'dure-links' },
      site ? el('a', { class: 'dure-btn', href: site, target: '_blank', rel: 'noopener noreferrer' }, '🌐 두레 사이트 열기') : el('span', { class: 'dure-btn off' }, '🌐 두레 사이트 (링크 없음)'),
      github ? el('a', { class: 'dure-btn', href: github, target: '_blank', rel: 'noopener noreferrer' }, '🐙 두레 GitHub 열기') : el('span', { class: 'dure-btn off' }, '🐙 두레 GitHub (링크 없음)'),
    ),
  ];
  if (!site || !github) parts.push(el('p', { class: 'meta' }, isAdmin() ? '아래에서 링크를 넣어 주세요.' : '운영진(관리자)이 링크를 넣으면 버튼이 켜져요.'));
  if (isAdmin()) {
    const form = el('form', { class: 'form' },
      el('p', { class: 'meta' }, '관리자 전용: 링크 바꾸기'),
      el('input', { name: 'site', maxlength: '300', placeholder: '두레 사이트 주소 https://...', value: links.site || '' }),
      el('input', { name: 'github', maxlength: '300', placeholder: '두레 GitHub 주소 https://github.com/...', value: links.github || '' }),
      el('div', { class: 'row' }, el('button', { type: 'submit', class: 'primary' }, '저장')),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const s = String(f.get('site') || '').trim(), g = String(f.get('github') || '').trim();
      if ((s && !safeUrl(s)) || (g && !safeUrl(g))) { showError('https:// 로 시작하는 주소만 넣을 수 있어요.'); return; }
      const value = { site: s, github: g };
      if (await act(submitBtn(form), () => ctx.store.saveSetting('links', value))) { ctx.onPosted('settings'); await ctx.reloadSettings(); render(); }
    });
    parts.push(form);
  }
  return parts;
}

// ---------- 방 꾸미기 (노트북, 내 방일 때만) ----------
let draft = null; // { room, items, rug, tool }
const PREVIEW_SCALE = 6;

function laptopDecor(room) {
  if (!draft || draft.room !== room) {
    const saved = cleanDecor(ctx.decor()[room]);
    draft = { room, items: saved.items, rug: saved.rug, tool: 'plant' };
  }
  const size = DECOR_GRID.cols * DECOR_GRID.cell;
  const cv = el('canvas', { class: 'decor-canvas', width: String(size * PREVIEW_SCALE), height: String(size * PREVIEW_SCALE), role: 'img', 'aria-label': '내 방 미리보기' });
  const count = el('span', { class: 'meta' });
  const g = cv.getContext('2d');

  const draw = () => {
    g.imageSmoothingEnabled = false;
    g.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
    // 나무 바닥
    for (let y = 0; y < size; y++) { g.fillStyle = y % 4 === 0 ? '#cfa874' : '#e3c08f'; g.fillRect(0, y, size, 1); }
    // 러그 (월드와 같은 자리: 방 안쪽 x 7~41, 바닥 기준 y 7~35)
    g.fillStyle = '#8a6a55'; g.fillRect(6, 6, 36, 30);
    g.fillStyle = draft.rug || ['#cfe3ef', '#f6d6de', '#d6ecd9', '#f4e5bf', '#e3dcf3'][room - 1]; g.fillRect(7, 7, 34, 28);
    // 칸 선
    g.fillStyle = 'rgba(74,52,44,0.12)';
    for (let i = 1; i < DECOR_GRID.cols; i++) { g.fillRect(i * DECOR_GRID.cell, 0, 0.25, size); g.fillRect(0, i * DECOR_GRID.cell, size, 0.25); }
    for (const it of [...draft.items].sort((a, b) => (a.y + DECOR_ITEMS[a.t].h) - (b.y + DECOR_ITEMS[b.t].h))) {
      g.drawImage(decorSprite(it.t), it.x * DECOR_GRID.cell, it.y * DECOR_GRID.cell);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    count.textContent = `가구 ${draft.items.length} / ${DECOR_MAX}`;
  };

  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * DECOR_GRID.cols);
    const y = Math.floor(((e.clientY - r.top) / r.height) * DECOR_GRID.rows);
    const hit = occupancy(draft.items).get(`${x},${y}`);
    if (hit !== undefined) draft.items.splice(hit, 1); // 놓인 가구를 누르면 치운다
    else if (draft.tool !== 'erase' && draft.items.length < DECOR_MAX) {
      // 누른 칸이 가구의 왼쪽 위가 되도록, 넘치면 안쪽으로 당긴다
      const d = DECOR_ITEMS[draft.tool];
      const px = Math.min(x, DECOR_GRID.cols - d.w), py = Math.min(y, DECOR_GRID.rows - d.h);
      if (fits(draft.items, draft.tool, px, py)) draft.items.push({ t: draft.tool, x: px, y: py });
    }
    draw();
  });

  const palette = el('div', { class: 'decor-palette' }, ...Object.entries(DECOR_ITEMS).map(([id, item]) => {
    const icon = el('canvas', { width: String(item.w * 8), height: String(item.h * 8), class: 'decor-icon' });
    icon.getContext('2d').drawImage(decorSprite(id), 0, 0);
    return el('button', {
      type: 'button', class: `decor-pick${draft.tool === id ? ' on' : ''}`, 'aria-pressed': String(draft.tool === id),
      onclick: (e) => { draft.tool = id; palette.querySelectorAll('.decor-pick').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }); e.currentTarget.classList.add('on'); e.currentTarget.setAttribute('aria-pressed', 'true'); },
    }, icon, el('span', {}, item.label));
  }));
  const rugs = el('div', { class: 'rug-row' }, el('span', { class: 'meta' }, '러그'), ...RUG_COLORS.map((c) => el('button', {
    type: 'button', class: `swatch${draft.rug === c ? ' on' : ''}`, style: `background:${c}`, 'aria-label': '러그 색',
    onclick: (e) => { draft.rug = draft.rug === c ? '' : c; rugs.querySelectorAll('.swatch').forEach((s) => s.classList.remove('on')); if (draft.rug) e.currentTarget.classList.add('on'); draw(); },
  })));
  const save = el('button', {
    type: 'button', class: 'primary',
    onclick: async (e) => {
      const btn = e.currentTarget; // await 뒤에는 e.currentTarget이 비므로 미리 잡아 둔다
      const value = { items: draft.items, rug: draft.rug };
      if (await act(btn, () => ctx.store.saveDecor(room, value))) {
        await ctx.reloadDecor();
        ctx.onPosted('decor');
        btn.textContent = '저장했어요 ✓';
      }
    },
  }, '저장하고 광장에 반영');
  const reset = el('button', { type: 'button', class: 'ghost', onclick: () => { draft.items = []; draw(); } }, '모두 치우기');
  draw();
  return [
    el('p', { class: 'sub' }, '가구를 고르고 바닥을 누르면 놓여요. 놓인 가구를 다시 누르면 치워져요. 저장하면 모두에게 보여요.'),
    el('div', { class: 'decor-wrap' }, cv, el('div', { class: 'decor-side' }, palette, rugs, el('div', { class: 'row between' }, count, el('span', { class: 'actions' }, reset, save)))),
  ];
}

// ---------- 별 줍기 순위 ----------
async function renderStars() {
  const today = kstDay();
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = addDays(today, -((dow + 6) % 7));
  const [week, day] = await Promise.all([ctx.store.starRanking(`${monday}T00:00:00+09:00`), ctx.store.starRanking(`${today}T00:00:00+09:00`)]);
  const table = (rows) => rows.length
    ? el('ol', { class: 'rank' }, ...rows.slice(0, 10).map((r, i) => el('li', { class: r.userId === ctx.me.uid ? 'me' : '' },
      el('span', { class: 'medal' }, ['🥇', '🥈', '🥉'][i] || `${i + 1}`), el('b', {}, memberName(r.userId)), el('span', {}, `⭐ ${r.count}`))))
    : el('p', { class: 'empty' }, '아직 아무도 별을 줍지 않았어요.');
  return [
    el('div', { class: 'head' }, el('h2', {}, '⭐ 별 줍기')),
    el('p', { class: 'sub' }, '광장 어딘가에 30초마다 별이 하나 떨어져요. 가장 먼저 걸어가서 닿은 사람이 주워요. 별은 모두에게 같은 자리에 보여요.'),
    el('div', { class: 'rank-grid' },
      el('section', {}, el('h3', {}, '이번 주'), table(week)),
      el('section', {}, el('h3', {}, '오늘'), table(day)),
    ),
  ];
}

// ---------- 일정 게시판 ----------
const RSVP = [['going', '참석'], ['maybe', '고민 중'], ['no', '불참']];

async function renderSchedule() {
  const form = el('form', { class: 'form', hidden: true },
    el('input', { name: 'title', maxlength: '60', placeholder: '일정 이름 (예: 두레 중간 점검 회의)', required: true }),
    el('input', { name: 'when', type: 'datetime-local', required: true }),
    el('input', { name: 'place', maxlength: '60', placeholder: '장소 (선택, 예: 디스코드 / 3층 세미나실)' }),
    el('div', { class: 'row' }, el('button', { type: 'submit', class: 'primary' }, '일정 올리기')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const title = String(f.get('title') || '').trim();
    const startsAt = fromLocalInput(String(f.get('when') || ''));
    if (!title || !startsAt) return;
    if (await act(submitBtn(form), () => ctx.store.addEvent({ title, startsAt, place: String(f.get('place') || '').trim() }))) { ctx.onPosted('events'); render(); }
  });
  const events = await ctx.store.events();
  const nowIso = new Date().toISOString();
  const list = el('div', { class: 'events' });
  for (const ev of events) {
    const mine = ev.rsvps.find((r) => r.userId === ctx.me.uid);
    const past = ev.startsAt < nowIso;
    const who = (status) => ev.rsvps.filter((r) => r.status === status).map((r) => memberName(r.userId));
    list.append(el('article', { class: `event${past ? ' past' : ''}` },
      el('div', { class: 'event-when' }, fmtEvent(ev.startsAt)),
      el('h3', {}, ev.title),
      el('p', { class: 'meta' }, `${ev.place ? `📍 ${ev.place} · ` : ''}올린 사람 ${ev.author}`),
      el('div', { class: 'rsvp' }, ...RSVP.map(([status, label]) => {
        const on = mine?.status === status;
        const names = who(status);
        return el('button', {
          type: 'button', class: `rsvp-btn${on ? ' on' : ''}`, 'aria-pressed': String(on), disabled: past,
          title: names.join(', ') || undefined,
          onclick: async (e) => { if (await act(e.currentTarget, () => ctx.store.setRsvp(ev.id, on ? null : status, !!mine))) { ctx.onPosted('events'); render(); } },
        }, `${label} ${names.length}`);
      })),
      who('going').length ? el('p', { class: 'meta' }, `참석: ${who('going').join(', ')}`) : null,
      el('div', { class: 'row' }, deleteButton('events', ev)),
    ));
  }
  if (!events.length) list.append(el('p', { class: 'empty' }, '다가오는 일정이 없어요.'));
  return [
    el('div', { class: 'head' }, el('h2', {}, '일정 게시판'),
      el('button', { class: 'primary', type: 'button', onclick: () => { form.hidden = !form.hidden; if (!form.hidden) form.querySelector('input').focus(); } }, '+ 일정 추가')),
    el('p', { class: 'sub' }, '모임과 마감 일정이에요. 참석 여부를 눌러 주세요.'),
    errorBox(), form, list,
  ];
}

// ---------- D-day ----------
export function ddayParts(dateIso, now = Date.now()) {
  const target = new Date(dateIso).getTime();
  if (!Number.isFinite(target)) return { label: 'D-?', clock: '--:--:--', ms: 0 };
  const ms = target - now;
  const dayMs = 864e5;
  // 날짜 차이는 한국 날짜 기준
  const dTarget = new Date(`${kstDay(new Date(target))}T00:00:00Z`).getTime();
  const dToday = new Date(`${kstDay(new Date(now))}T00:00:00Z`).getTime();
  const days = Math.round((dTarget - dToday) / dayMs);
  const label = days > 0 ? `D-${Math.min(days, 9999)}` : days === 0 ? 'D-DAY' : `D+${Math.min(-days, 9999)}`;
  const abs = Math.abs(ms) % dayMs;
  const p = (n) => String(Math.floor(n)).padStart(2, '0');
  const clock = `${p(abs / 36e5)}:${p((abs % 36e5) / 6e4)}:${p((abs % 6e4) / 1e3)}`;
  return { label, clock, ms };
}

async function renderDday() {
  const { dday } = await ctx.settings();
  const big = el('div', { class: 'dday-big' });
  const clock = el('div', { class: 'dday-clock' });
  const tick = () => { const d = ddayParts(dday.date); big.textContent = d.label; clock.textContent = `${d.ms >= 0 ? '남은 시간' : '지난 시간'} ${d.clock}`; };
  tick();
  clearInterval(ticker);
  ticker = setInterval(tick, 1000);
  const parts = [
    el('div', { class: 'head' }, el('h2', {}, dday.title || 'D-day')),
    el('div', { class: 'dday-card' }, big, clock, el('p', { class: 'meta' }, `목표: ${fmtEvent(dday.date)}`)),
  ];
  if (isAdmin()) {
    const form = el('form', { class: 'form' },
      el('p', { class: 'meta' }, '관리자 전용: D-day 바꾸기'),
      el('input', { name: 'title', maxlength: '20', placeholder: '이름 (예: 두레 런칭)', value: dday.title || '', required: true }),
      el('input', { name: 'when', type: 'datetime-local', value: toLocalInput(dday.date), required: true }),
      el('div', { class: 'row' }, el('button', { type: 'submit', class: 'primary' }, '저장')),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const title = String(f.get('title') || '').trim().slice(0, 20);
      const date = fromLocalInput(String(f.get('when') || ''));
      if (!title || !date) return;
      if (await act(submitBtn(form), () => ctx.store.saveSetting('dday', { title, date }))) { ctx.onPosted('settings'); await ctx.reloadSettings(); render(); }
    });
    parts.push(errorBox(), form);
  } else {
    parts.push(el('p', { class: 'meta' }, 'D-day는 운영진(관리자)이 바꿀 수 있어요.'));
  }
  return parts;
}

// ---------- 창 열고 닫기 ----------
const RENDER = { gallery: renderGallery, board: renderBoard, sign: renderSign, laptop: renderLaptop, schedule: renderSchedule, dday: renderDday, stars: renderStars };
// 어떤 데이터가 바뀌면 어떤 창을 새로 그릴지 (방 꾸미는 중에는 덮어쓰지 않도록 decor는 넣지 않음)
const SHOWS = {
  gallery: ['works'], board: ['opinions'], schedule: ['events', 'profiles'], dday: ['settings'],
  laptop: ['agendas', 'agenda_comments', 'visits', 'settings', 'profiles'], stars: ['stars', 'profiles'],
};

async function render() {
  if (!current) return;
  const my = ++seq;
  const scroll = body.scrollTop;
  let parts;
  try {
    parts = await RENDER[current.kind](current.arg);
  } catch (e) {
    parts = [el('div', { class: 'head' }, el('h2', {}, '불러오지 못했어요')), el('p', { class: 'error' }, String(e?.message || e)),
      el('p', { class: 'meta' }, ctx.mode === 'supabase' ? 'supabase/schema.sql을 다시 실행했는지 확인해 주세요.' : ''),
      el('button', { class: 'primary', type: 'button', onclick: () => render() }, '다시 시도')];
  }
  if (my !== seq || !current) return;
  body.replaceChildren(...parts);
  body.scrollTop = scroll;
}

export function openModal(kind, arg) {
  if (kind === 'laptop' && (current?.kind !== 'laptop' || current.arg !== arg)) { laptop.tab = 'agendas'; laptop.agendaId = null; draft = null; }
  current = { kind, arg };
  modal.hidden = false;
  body.scrollTop = 0;
  body.replaceChildren(el('p', { class: 'sub' }, '불러오는 중…'));
  render();
}

export function refreshModal(kind) {
  if (!current || !(SHOWS[current.kind] || []).includes(kind)) return;
  if (body.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return; // 입력 중이면 그대로
  render();
}

export function closeModal() {
  current = null;
  seq++;
  clearInterval(ticker);
  modal.hidden = true;
  document.getElementById('game').focus();
}

export const isModalOpen = () => !modal.hidden;

modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('.close')) closeModal(); });
