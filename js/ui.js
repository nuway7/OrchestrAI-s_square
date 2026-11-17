// 전시관, 의견 게시판, 안내 창. 사용자 글은 모두 textContent로만 넣는다(HTML로 해석하지 않음).

const modal = document.getElementById('modal');
const body = document.getElementById('modal-body');
let ctx = null;      // { store, me, mode, onPosted }
let current = null;  // 'gallery' | 'board' | 'sign'
let seq = 0;         // 늦게 도착한 옛 응답이 새 화면을 덮지 않게

export function setupUI(options) { ctx = options; }

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

const fmtDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const safeUrl = (s) => {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch { return null; }
};

const canDelete = (item) => item.authorId && (item.authorId === ctx.me.uid || ctx.me.role === 'admin');

// 버튼을 누르는 동안 막고, 실패하면 창 안에 알려 준다
async function act(button, fn) {
  if (button) button.disabled = true;
  try {
    await fn();
    return true;
  } catch (e) {
    showError(e);
    return false;
  } finally {
    if (button) button.disabled = false;
  }
}

function showError(e) {
  const box = body.querySelector('.error');
  const msg = `잠깐 문제가 생겼어요: ${e?.message || e}`;
  if (box) { box.textContent = msg; box.hidden = false; } else alert(msg);
}

function deleteButton(kind, item) {
  if (!canDelete(item)) return null;
  return el('button', {
    class: 'del', type: 'button', 'aria-label': '지우기',
    onclick: async (e) => {
      if (!confirm('이 글을 지울까요? 지운 글은 되돌릴 수 없어요.')) return;
      if (await act(e.currentTarget, () => ctx.store.remove(kind, item.id))) { ctx.onPosted(kind); render(); }
    },
  }, '지우기');
}

async function renderGallery() {
  const form = el('form', { class: 'form', hidden: true },
    el('input', { name: 'title', maxlength: '40', placeholder: '작업 제목', required: true }),
    el('textarea', { name: 'desc', maxlength: '400', rows: '3', placeholder: '어떤 작업인지 짧게 소개해 주세요' }),
    el('input', { name: 'link', maxlength: '300', placeholder: '링크 (선택, https://...)' }),
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
    const ok = await act(e.submitter || form.querySelector('[type=submit]'), () => ctx.store.addWork({ title, desc: String(f.get('desc') || '').trim(), link }));
    if (ok) { ctx.onPosted('works'); render(); }
  });
  const toggle = el('button', { class: 'primary', type: 'button', onclick: () => { form.hidden = !form.hidden; if (!form.hidden) form.querySelector('input').focus(); } }, '+ 작업 올리기');

  const works = await ctx.store.list('works');
  const list = el('div', { class: 'cards' });
  for (const w of works) {
    const link = w.link && safeUrl(w.link);
    list.append(el('article', { class: 'card' },
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
  return [el('div', { class: 'head' }, el('h2', {}, '전시관'), toggle), el('p', { class: 'sub' }, '동아리원들이 지금까지 해 온 작업이에요.'), el('p', { class: 'error', hidden: true }), form, list];
}

async function renderBoard() {
  const form = el('form', { class: 'form' },
    el('textarea', { name: 'text', maxlength: '300', rows: '3', placeholder: '하고 싶은 말, 제안, 아이디어를 자유롭게 남겨 주세요', required: true }),
    el('div', { class: 'row' }, el('button', { type: 'submit', class: 'primary' }, '남기기')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = String(new FormData(form).get('text') || '').trim();
    if (!text) return;
    if (await act(e.submitter || form.querySelector('[type=submit]'), () => ctx.store.addOpinion({ text }))) { ctx.onPosted('opinions'); render(); }
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
  return [el('div', { class: 'head' }, el('h2', {}, '의견 게시판')), el('p', { class: 'sub' }, '광장의 자유 발언대예요. 공감하는 의견에는 ♥를 눌러 주세요.'), el('p', { class: 'error', hidden: true }), form, list];
}

async function renderSign() {
  const rows = [
    ['이동', '방향키 / WASD, 또는 가고 싶은 곳을 클릭·터치'],
    ['말하기', 'Enter를 누르고 입력 → 머리 위에 말풍선이 떠요'],
    ['들어가기', '건물·게시판 앞에서 E 키 또는 화면 아래 버튼'],
    ['닫기', 'Esc'],
  ];
  const note = ctx.mode === 'supabase'
    ? '로그인한 동아리원만 이 광장과 글을 볼 수 있어요.'
    : '연습 모드: 실시간 접속은 같은 브라우저의 다른 탭끼리만 보이고, 글은 이 브라우저에만 저장돼요.';
  return [
    el('div', { class: 'head' }, el('h2', {}, '광장 안내')),
    el('p', { class: 'sub' }, '우리 동아리원들이 모이는 광장이에요. 작업은 전시관에, 의견은 게시판에 남겨 주세요.'),
    el('dl', { class: 'help' }, ...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
    el('p', { class: 'meta' }, note),
  ];
}

const RENDER = { gallery: renderGallery, board: renderBoard, sign: renderSign };

async function render() {
  if (!current) return;
  const my = ++seq;
  const scroll = body.scrollTop;
  let parts;
  try {
    parts = await RENDER[current]();
  } catch (e) {
    parts = [el('div', { class: 'head' }, el('h2', {}, '불러오지 못했어요')), el('p', { class: 'error' }, String(e?.message || e)),
      el('button', { class: 'primary', type: 'button', onclick: () => render() }, '다시 시도')];
  }
  if (my !== seq || !current) return;
  body.replaceChildren(...parts);
  body.scrollTop = scroll;
}

export function openModal(kind) {
  current = kind;
  modal.hidden = false;
  body.scrollTop = 0;
  body.replaceChildren(el('p', { class: 'sub' }, '불러오는 중…'));
  render();
}

// 다른 사람이 글을 올렸다는 신호가 오면, 그 글이 보이는 창이 열려 있고 입력 중이 아닐 때만 새로고침
export function refreshModal(kind) {
  const shows = { gallery: 'works', board: 'opinions' }[current];
  if (shows && shows === kind && !body.contains(document.activeElement)) render();
}

export function closeModal() {
  current = null;
  seq++;
  modal.hidden = true;
  document.getElementById('game').focus();
}

export const isModalOpen = () => !modal.hidden;

modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('.close')) closeModal(); });
