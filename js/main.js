import { buildWorld, WORLD_W, WORLD_H, TILE } from './world.js';
import { charSprite, SPRITE_W, SPRITE_H, PALETTE, randomLook, safeLook } from './sprites.js';
import { supabase, mode, configError } from './backend.js';
import { createLocalNet } from './net.js';
import { createSupabaseNet } from './net-supabase.js';
import { createLocalStore } from './store.js';
import { createSupabaseStore } from './store-supabase.js';
import { setupUI, openModal, closeModal, isModalOpen, refreshModal } from './ui.js';

const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif';
const SPEED = 72;          // 월드 px / 초 (보내는 쪽과 받는 쪽이 같은 값을 써야 예측이 맞는다)
const BUBBLE_MS = 5500;
const MOVE_RESEND_MS = 1000; // 걷는 동안 위치 보정 신호 간격
const PREDICT_MAX_MS = 3000; // 신호가 끊기면 이만큼 지나 다른 사람 캐릭터를 멈춘다

const $ = (id) => document.getElementById(id);
const cv = $('game');
const ctx = cv.getContext('2d');
const world = buildWorld();

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const storage = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } },
};

// ---------- 입장 단계 ----------
const profile = { uid: '', name: '', look: randomLook(), role: 'member', exists: false };
const PART_NAMES = { hair: '머리', skin: '피부', shirt: '옷', pants: '바지' };
const pctx = $('preview').getContext('2d');

function showStep(id) {
  for (const s of ['entry-status', 'login-form', 'entry-form']) $(s).hidden = s !== id;
}
function showStatus(text) { $('entry-status-text').textContent = text; showStep('entry-status'); }
function showError(id, msg) { const e = $(id); e.textContent = msg; e.hidden = !msg; }

function buildPickers() {
  const box = $('pickers');
  box.replaceChildren();
  for (const part of Object.keys(PALETTE)) {
    const row = document.createElement('div');
    row.className = 'picker';
    const label = document.createElement('span');
    label.textContent = PART_NAMES[part];
    row.append(label);
    for (const color of PALETTE[part]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (profile.look[part] === color ? ' on' : '');
      b.style.background = color;
      b.setAttribute('aria-label', `${PART_NAMES[part]} 색`);
      b.addEventListener('click', () => { profile.look[part] = color; buildPickers(); });
      row.append(b);
    }
    box.append(row);
  }
}
$('shuffle').addEventListener('click', () => { profile.look = randomLook(); buildPickers(); });

function showProfileStep() {
  $('name').value = profile.name;
  buildPickers();
  $('entry-sub').textContent = profile.exists ? `${profile.name} 님, 다시 오신 걸 환영해요.` : '광장에서 쓸 이름과 캐릭터를 정해 주세요.';
  $('local-note').hidden = mode !== 'local';
  $('account').hidden = mode !== 'supabase';
  showStep('entry-form');
}

function drawPreview(t) {
  const frame = [1, 0, 2, 0][Math.floor(t / 180) % 4];
  pctx.imageSmoothingEnabled = false;
  pctx.clearRect(0, 0, 96, 128);
  pctx.drawImage(charSprite(profile.look, 'down', frame), 0, 0, 96, 128);
}

const LOGIN_ERRORS = {
  invalid_credentials: '이메일이나 비밀번호가 맞지 않아요.',
  email_not_confirmed: '아직 확인되지 않은 계정이에요. 운영진에게 문의해 주세요.',
  over_request_rate_limit: '시도가 너무 많아요. 잠시 뒤에 다시 해 주세요.',
};

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter || e.currentTarget.querySelector('[type=submit]');
  btn.disabled = true;
  showError('login-error', '');
  let data, error;
  try {
    ({ data, error } = await supabase.auth.signInWithPassword({ email: $('login-email').value.trim(), password: $('login-password').value }));
  } catch (err) {
    error = err;
  } finally {
    btn.disabled = false;
  }
  if (error) {
    const offline = error.name === 'AuthRetryableFetchError' || error.status === 0;
    showError('login-error', LOGIN_ERRORS[error.code] || (offline ? '서버에 연결하지 못했어요. 인터넷 연결이나 config.js의 주소를 확인해 주세요.' : `로그인하지 못했어요: ${error.message}`));
    return;
  }
  $('login-password').value = '';
  await afterLogin(data.user);
});

async function afterLogin(user) {
  showStatus('내 정보를 불러오는 중…');
  const { data, error } = await supabase.from('profiles').select('name, look, role').eq('id', user.id).maybeSingle();
  if (error) { showStatus(`정보를 불러오지 못했어요: ${error.message}. schema.sql을 실행했는지 확인해 주세요.`); return; }
  profile.uid = user.id;
  profile.exists = !!data;
  if (data) {
    profile.name = data.name;
    profile.look = safeLook(data.look);
    profile.role = data.role;
  } else {
    profile.name = (user.email || '').split('@')[0].slice(0, 12);
  }
  showProfileStep();
}

$('entry-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('name').value.trim().replace(/\s+/g, ' ').slice(0, 12);
  if (!name) { $('name').focus(); return; }
  profile.name = name;
  if (mode === 'supabase') {
    const btn = e.submitter || e.currentTarget.querySelector('[type=submit]');
    btn.disabled = true;
    showError('entry-error', '');
    const row = { name, look: profile.look };
    const { error } = profile.exists
      ? await supabase.from('profiles').update({ ...row, updated_at: new Date().toISOString() }).eq('id', profile.uid)
      : await supabase.from('profiles').insert({ id: profile.uid, ...row });
    btn.disabled = false;
    if (error) { showError('entry-error', `저장하지 못했어요: ${error.message}`); return; }
    profile.exists = true;
  } else {
    storage.set('plaza.profile', { uid: profile.uid, name, look: profile.look });
  }
  enter();
});

$('change-password').addEventListener('click', async (e) => {
  const pw = $('new-password').value;
  const msg = $('pw-msg');
  msg.hidden = false;
  if (pw.length < 8) { msg.textContent = '8자 이상으로 정해 주세요.'; return; }
  e.currentTarget.disabled = true;
  const { error } = await supabase.auth.updateUser({ password: pw });
  e.currentTarget.disabled = false;
  $('new-password').value = '';
  msg.textContent = error ? `바꾸지 못했어요: ${error.message}` : '비밀번호를 바꿨어요.';
});

async function logout() {
  try { net?.close(); } catch { /* 무시 */ }
  await supabase.auth.signOut();
  location.reload();
}
$('logout-entry').addEventListener('click', logout);
$('logout').addEventListener('click', logout);

async function boot() {
  if (configError) { showStatus(configError); return; }
  if (mode === 'local') {
    const saved = storage.get('plaza.profile') || {};
    profile.uid = typeof saved.uid === 'string' ? saved.uid : uid();
    profile.name = typeof saved.name === 'string' ? saved.name : '';
    profile.look = saved.look ? safeLook(saved.look) : randomLook();
    profile.exists = !!profile.name;
    showProfileStep();
    return;
  }
  supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT' && me) location.reload(); });
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) await afterLogin(session.user);
  else showStep('login-form');
}

// ---------- 광장 ----------
let me = null;
let net = null;
const peers = new Map();
const keys = new Set();
let target = null;
let stuck = 0;
let zone = null;
let dpr = 1, zoom = 3, camX = 0, camY = 0;
let lastSent = 0, lastSig = '';

function enter() {
  $('entry').hidden = true;
  for (const id of ['hud', 'chat', 'log']) $(id).hidden = false;
  $('logout').hidden = mode !== 'supabase';
  me = { id: uid(), uid: profile.uid, name: profile.name, look: profile.look, role: profile.role, ...world.spawn, dir: 'down', moving: false, vx: 0, vy: 0, anim: 0, bubble: null };

  const store = mode === 'supabase' ? createSupabaseStore(supabase, me) : createLocalStore(me);
  const handlers = {
    join(p, fresh) { upsertPeer(p); if (fresh) addLog(null, `${p.name} 님이 광장에 들어왔어요`); },
    state(p) { upsertPeer(p); },
    chat({ id, name, text }) {
      const p = peers.get(id);
      if (p) p.bubble = { text, until: performance.now() + BUBBLE_MS };
      addLog(name, text);
    },
    leave(id) {
      const p = peers.get(id);
      if (p) { addLog(null, `${p.name} 님이 나갔어요`); peers.delete(id); updateWho(); }
    },
    posted(kind) { refreshModal(kind); },
    status(s) {
      const chip = $('net-status');
      chip.hidden = s === 'online';
      if (s !== 'online') chip.textContent = '연결 끊김 · 다시 연결하는 중';
    },
  };
  net = mode === 'supabase' ? createSupabaseNet(supabase, me, handlers) : createLocalNet(me, handlers);
  store.onChange((kind) => refreshModal(kind));
  setupUI({ store, me, mode, onPosted: (kind) => net.posted(kind) });

  net.hello(stateOf(me));
  addLog(null, mode === 'supabase'
    ? '광장에 들어왔어요. 접속한 동아리원이 실시간으로 보여요.'
    : '연습 모드예요. 다른 탭을 하나 더 열면 실시간으로 같이 보여요.');
  updateWho();
  cv.focus();
}

const r1 = (v) => Math.round(v * 10) / 10;
const stateOf = (p) => ({ x: r1(p.x), y: r1(p.y), dir: p.dir, moving: p.moving, vx: Math.round(p.vx * 100) / 100, vy: Math.round(p.vy * 100) / 100 });

function upsertPeer(p) {
  let peer = peers.get(p.id);
  const has = Number.isFinite(p.x) && Number.isFinite(p.y);
  if (!peer) {
    peer = { id: p.id, x: has ? p.x : world.spawn.x, y: has ? p.y : world.spawn.y, dir: 'down', moving: false, vx: 0, vy: 0, anim: 0, bubble: null };
    peer.dx = peer.x; peer.dy = peer.y;
    peers.set(p.id, peer);
    updateWho();
  }
  peer.name = p.name;
  peer.look = safeLook(p.look);
  if (has) { peer.x = p.x; peer.y = p.y; }
  if (['up', 'down', 'left', 'right'].includes(p.dir)) peer.dir = p.dir;
  peer.moving = !!p.moving;
  peer.vx = p.vx || 0;
  peer.vy = p.vy || 0;
  peer.seen = performance.now();
}

function updateWho() {
  const names = [me.name + ' (나)', ...[...peers.values()].map((p) => p.name)];
  $('who').textContent = `접속 ${names.length}명`;
  $('who-list').replaceChildren(...names.map((n) => { const li = document.createElement('li'); li.textContent = n; return li; }));
}

function addLog(name, text) {
  const line = document.createElement('div');
  if (name) {
    const b = document.createElement('b');
    b.textContent = name;
    line.append(b, ' ', text);
  } else {
    line.className = 'sys';
    line.textContent = text;
  }
  const log = $('log');
  log.append(line);
  while (log.children.length > 30) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

// ---------- 입력 ----------
const typing = () => document.activeElement === $('chat-input') || !$('entry').hidden || isModalOpen();
const DIRS = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };

window.addEventListener('keydown', (e) => {
  if (!me) return;
  if (e.key === 'Escape') {
    if (isModalOpen()) closeModal();
    else if (document.activeElement === $('chat-input')) $('chat-input').blur();
    $('who-list').hidden = true;
    return;
  }
  if (typing()) return;
  if (e.key === 'Enter') { e.preventDefault(); $('chat-input').focus(); return; }
  if (e.code === 'KeyE' && zone) { e.preventDefault(); openZone(); return; }
  if (DIRS[e.code]) { e.preventDefault(); keys.add(e.code); target = null; }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

cv.addEventListener('pointerdown', (e) => {
  if (!me || isModalOpen()) return;
  $('chat-input').blur();
  $('who-list').hidden = true;
  const r = cv.getBoundingClientRect();
  target = { x: ((e.clientX - r.left) * dpr) / zoom + camX, y: ((e.clientY - r.top) * dpr) / zoom + camY + 2 };
  stuck = 0;
});

$('chat').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('chat-input');
  const text = input.value.trim().slice(0, 120);
  if (text) {
    me.bubble = { text, until: performance.now() + BUBBLE_MS };
    net.chat(text);
    addLog(me.name, text);
  }
  input.value = '';
  input.blur();
  cv.focus();
});

$('who').addEventListener('click', () => { $('who-list').hidden = !$('who-list').hidden; });
$('help').addEventListener('click', () => openModal('sign'));
$('prompt').addEventListener('click', () => openZone());

function openZone() {
  if (!zone) return;
  keys.clear();
  target = null;
  openModal(zone.id);
}

// ---------- 이동 ----------
const blocked = (x, y) => world.isSolid(x - 4, y - 3) || world.isSolid(x + 3, y - 3) || world.isSolid(x - 4, y) || world.isSolid(x + 3, y);

// 한 캐릭터를 (vx, vy) 방향으로 한 걸음. 나와 다른 사람 예측에 똑같이 쓴다.
function step(c, vx, vy, dt) {
  const d = SPEED * dt;
  if (!blocked(c.x + vx * d, c.y)) c.x += vx * d;
  if (!blocked(c.x, c.y + vy * d)) c.y += vy * d;
  c.x = Math.max(8, Math.min(WORLD_W - 8, c.x));
  c.y = Math.max(16, Math.min(WORLD_H - 2, c.y));
}

function update(dt, now) {
  let vx = 0, vy = 0;
  for (const k of keys) { vx += DIRS[k][0]; vy += DIRS[k][1]; }
  if (!vx && !vy && target) {
    const dx = target.x - me.x, dy = target.y - me.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) target = null;
    else { vx = dx / d; vy = dy / d; }
  }
  const len = Math.hypot(vx, vy);
  const wasMoving = me.moving;
  me.moving = len > 0;
  if (me.moving) {
    vx /= len; vy /= len;
    const ox = me.x, oy = me.y;
    step(me, vx, vy, dt);
    me.dir = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'left' : 'right') : (vy < 0 ? 'up' : 'down');
    const moved = Math.hypot(me.x - ox, me.y - oy);
    if (target) { stuck = moved < SPEED * dt * 0.2 ? stuck + dt : 0; if (stuck > 0.25) target = null; }
    me.anim += dt;
  } else me.anim = 0;
  me.vx = me.moving ? vx : 0;
  me.vy = me.moving ? vy : 0;

  // 보내기: 걷기 시작·방향 바뀜·멈춤일 때, 걷는 동안 1초마다 보정, (연습 모드) 가만히 있으면 2초마다 살아 있음
  const sig = me.moving ? `${Math.round(me.vx * 10)},${Math.round(me.vy * 10)}` : 'stop';
  if (sig !== lastSig || (me.moving && now - lastSent > MOVE_RESEND_MS) || (net.heartbeatMs && now - lastSent > net.heartbeatMs) || (wasMoving && !me.moving)) {
    net.move(stateOf(me));
    lastSent = now;
    lastSig = sig;
  }

  for (const p of peers.values()) {
    if (net.peerTimeout && now - p.seen > net.peerTimeout) { peers.delete(p.id); updateWho(); continue; }
    if (p.moving && now - p.seen > PREDICT_MAX_MS) p.moving = false;
    if (p.moving) step(p, p.vx, p.vy, dt);
    const k = Math.min(1, dt * 10);
    p.dx += (p.x - p.dx) * k;
    p.dy += (p.y - p.dy) * k;
    if (Math.hypot(p.x - p.dx, p.y - p.dy) > 64) { p.dx = p.x; p.dy = p.y; } // 너무 멀면 순간이동
    p.anim = p.moving || Math.hypot(p.x - p.dx, p.y - p.dy) > 0.5 ? p.anim + dt : 0;
  }

  const z = world.zones.find((zz) => me.x >= zz.x && me.x <= zz.x + zz.w && me.y >= zz.y && me.y <= zz.y + zz.h) || null;
  if (z !== zone) {
    zone = z;
    const btn = $('prompt');
    btn.hidden = !zone;
    if (zone) btn.textContent = `E · ${zone.label}`;
  }
}

// ---------- 그리기 ----------
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.width = Math.round(window.innerWidth * dpr);
  cv.height = Math.round(window.innerHeight * dpr);
  const fit = Math.min(cv.width / (TILE * 22), cv.height / (TILE * 14));
  zoom = Math.max(2, Math.round(fit));
}
window.addEventListener('resize', resize);
resize();

const frameOf = (anim) => (anim > 0 ? [1, 0, 2, 0][Math.floor(anim / 0.13) % 4] : 0);
const sx = (x) => Math.round((x - camX) * zoom);
const sy = (y) => Math.round((y - camY) * zoom);

function wrap(text, maxW) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch.trimStart(); }
    else line += ch;
  }
  if (line) lines.push(line);
  if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].slice(0, -1) + '…'; }
  return lines;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const posOf = (c) => (c === me ? { x: c.x, y: c.y } : { x: c.dx, y: c.dy });

function render(now) {
  const viewW = cv.width / zoom, viewH = cv.height / zoom;
  const focus = me || world.spawn;
  camX = WORLD_W > viewW ? Math.max(0, Math.min(WORLD_W - viewW, focus.x - viewW / 2)) : (WORLD_W - viewW) / 2;
  camY = WORLD_H > viewH ? Math.max(0, Math.min(WORLD_H - viewH, focus.y - 8 - viewH / 2)) : (WORLD_H - viewH) / 2;
  camX = Math.round(camX * zoom) / zoom;
  camY = Math.round(camY * zoom) / zoom;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#5b8f4c';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(world.groundCanvas, sx(0), sy(0), WORLD_W * zoom, WORLD_H * zoom);

  if (target) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const r = 3 + Math.sin(now / 150);
    ctx.fillRect(sx(target.x - r), sy(target.y - 1), Math.round(r * 2 * zoom), zoom);
    ctx.fillRect(sx(target.x - 1), sy(target.y - r / 2 - 1), zoom * 2, Math.round(r * zoom));
  }

  world.fountainProp.img = world.fountainProp.frames[Math.floor(now / 300) % 2];
  const chars = me ? [me, ...peers.values()] : [];
  const items = [
    ...world.props.map((p) => ({ y: p.baseY, draw: () => ctx.drawImage(p.img, sx(p.x), sy(p.y), p.img.width * zoom, p.img.height * zoom) })),
    ...chars.map((c) => {
      const { x, y } = posOf(c);
      return {
        y,
        draw: () => {
          ctx.fillStyle = 'rgba(40,50,30,0.22)';
          ctx.fillRect(sx(x - 4), sy(y - 1), 8 * zoom, 2 * zoom);
          const bob = frameOf(c.anim) !== 0 ? 1 : 0;
          const img = charSprite(c.look, c.dir, frameOf(c.anim));
          ctx.drawImage(img, sx(Math.round(x) - SPRITE_W / 2), sy(Math.round(y) - SPRITE_H - bob), SPRITE_W * zoom, SPRITE_H * zoom);
        },
      };
    }),
  ].sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();

  // 글자는 화면 좌표로 (도트가 아닌 선명한 글씨)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(12 * dpr)}px ${FONT}`;
  for (const l of world.labels) {
    const x = sx(l.x), y = sy(l.y);
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = 'rgba(74,52,44,0.9)';
    ctx.strokeText(l.text, x, y);
    ctx.fillStyle = '#fff8e8';
    ctx.fillText(l.text, x, y);
  }

  ctx.font = `600 ${Math.round(11 * dpr)}px ${FONT}`;
  for (const c of chars) {
    const p = posOf(c);
    const x = sx(p.x), y = sy(p.y + 2);
    const w = ctx.measureText(c.name).width + 10 * dpr, h = 16 * dpr;
    ctx.fillStyle = c === me ? 'rgba(242,140,168,0.95)' : 'rgba(255,255,255,0.88)';
    roundRect(x - w / 2, y, w, h, 8 * dpr);
    ctx.fill();
    ctx.fillStyle = c === me ? '#fff' : '#4a342c';
    ctx.fillText(c.name, x, y + h / 2 + 0.5 * dpr);
  }

  ctx.font = `500 ${Math.round(12 * dpr)}px ${FONT}`;
  for (const c of chars) {
    if (!c.bubble) continue;
    if (now > c.bubble.until) { c.bubble = null; continue; }
    const lines = wrap(c.bubble.text, 150 * dpr);
    const lh = 16 * dpr, pad = 7 * dpr;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
    const h = lines.length * lh + pad * 2 - 4 * dpr;
    const p = posOf(c);
    const x = sx(p.x), bottom = sy(p.y - SPRITE_H - 3);
    ctx.globalAlpha = Math.min(1, (c.bubble.until - now) / 400);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#4a342c';
    ctx.lineWidth = 2 * dpr;
    roundRect(x - w / 2, bottom - h - 6 * dpr, w, h, 8 * dpr);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 5 * dpr, bottom - 6 * dpr - 1);
    ctx.lineTo(x, bottom);
    ctx.lineTo(x + 5 * dpr, bottom - 6 * dpr - 1);
    ctx.fill(); ctx.stroke();
    ctx.fillRect(x - 4 * dpr, bottom - 8 * dpr, 8 * dpr, 3 * dpr);
    ctx.fillStyle = '#3b2a26';
    lines.forEach((l, i) => ctx.fillText(l, x, bottom - h - 6 * dpr + pad + lh * i + lh / 2 - 2 * dpr));
    ctx.globalAlpha = 1;
  }
}

let prev = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  if (me) update(dt, now);
  else if (!$('entry-form').hidden) drawPreview(now);
  render(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
boot();
