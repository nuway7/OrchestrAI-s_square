// 미니룸 가구와 별 줍기 별 도트 그림.
// 방 바닥(걸을 수 있는 3x3칸)을 6x6 작은 칸(8px)으로 나눠 가구를 놓는다.

export const DECOR_GRID = { cols: 6, rows: 6, cell: 8 };
export const DECOR_MAX = 24;
export const RUG_COLORS = ['#cfe3ef', '#f6d6de', '#d6ecd9', '#f4e5bf', '#e3dcf3', '#f4f1ea', '#d9a86c', '#9fb4d8'];
const OUT = '#4a342c';

// w, h: 차지하는 작은 칸 수
export const DECOR_ITEMS = {
  plant: { label: '화분', w: 1, h: 2, draw(p) {
    p(1, 10, 6, 6, OUT); p(2, 11, 4, 4, '#c27357');
    p(0, 2, 8, 8, '#3f6b3a'); p(1, 3, 6, 6, '#5fae57'); p(3, 0, 2, 3, '#5fae57'); p(2, 4, 2, 2, '#80c870');
  } },
  cactus: { label: '선인장', w: 1, h: 1, draw(p) {
    p(1, 5, 6, 3, OUT); p(2, 5, 4, 2, '#d98a6a');
    p(3, 0, 3, 6, '#3f6b3a'); p(3, 1, 2, 4, '#6bb36a'); p(1, 2, 2, 2, '#6bb36a'); p(6, 1, 1, 2, '#6bb36a');
  } },
  lamp: { label: '스탠드', w: 1, h: 2, draw(p) {
    p(0, 0, 8, 6, OUT); p(1, 1, 6, 4, '#f7e7a0'); p(2, 1, 2, 2, '#fffbe6');
    p(3, 6, 2, 8, '#4a4a58'); p(1, 14, 6, 2, OUT);
  } },
  guitar: { label: '기타', w: 1, h: 2, draw(p) {
    p(3, 0, 2, 7, '#7a5236'); p(2, 0, 4, 2, OUT);
    p(1, 7, 6, 8, OUT); p(2, 8, 4, 6, '#e8a35e'); p(3, 10, 2, 2, '#4a342c');
  } },
  speaker: { label: '스피커', w: 1, h: 2, draw(p) {
    p(0, 1, 8, 15, OUT); p(1, 2, 6, 13, '#3b3b46');
    p(2, 3, 4, 4, '#6a6a7a'); p(3, 4, 2, 2, '#2a2a33'); p(2, 9, 4, 4, '#6a6a7a'); p(3, 10, 2, 2, '#2a2a33');
  } },
  trophy: { label: '트로피', w: 1, h: 1, draw(p) {
    p(1, 0, 6, 4, '#e8b83e'); p(0, 1, 1, 2, '#e8b83e'); p(7, 1, 1, 2, '#e8b83e'); p(2, 1, 2, 2, '#fff3c4');
    p(3, 4, 2, 2, '#c99a2e'); p(1, 6, 6, 2, '#7a5236');
  } },
  cat: { label: '고양이', w: 2, h: 1, draw(p) {
    p(1, 3, 11, 5, OUT); p(2, 4, 9, 3, '#f2a35e'); p(4, 4, 1, 3, '#d9823e'); p(7, 4, 1, 3, '#d9823e');
    p(10, 0, 6, 6, OUT); p(11, 1, 4, 4, '#f2a35e'); p(10, 0, 2, 2, OUT); p(14, 0, 2, 2, OUT);
    p(12, 2, 1, 1, OUT); p(14, 2, 1, 1, OUT); p(0, 2, 2, 2, '#f2a35e');
  } },
  bookshelf: { label: '책장', w: 2, h: 2, draw(p) {
    p(0, 0, 16, 16, OUT); p(1, 1, 14, 14, '#9a6a45'); p(1, 7, 14, 1, OUT);
    const books = ['#d46a6a', '#4fb4d8', '#e8c84e', '#58b98a', '#9c86e8', '#f28ca8'];
    for (let i = 0; i < 6; i++) { p(2 + i * 2, 2 + (i % 2), 2, 5 - (i % 2), books[i]); p(2 + i * 2, 9 + ((i + 1) % 2), 2, 5 - ((i + 1) % 2), books[5 - i]); }
  } },
  beanbag: { label: '빈백', w: 2, h: 2, draw(p) {
    p(1, 3, 14, 13, OUT); p(2, 4, 12, 11, '#9c86e8'); p(0, 7, 16, 8, OUT); p(1, 8, 14, 6, '#9c86e8');
    p(4, 5, 5, 3, '#b8a8f0'); p(3, 9, 10, 1, '#7d68c8');
  } },
  boxes: { label: '택배 상자', w: 2, h: 2, draw(p) {
    p(0, 6, 10, 10, OUT); p(1, 7, 8, 8, '#d9a86c'); p(1, 10, 8, 1, '#b98a55');
    p(7, 0, 9, 9, OUT); p(8, 1, 7, 7, '#e6be86'); p(11, 1, 1, 7, '#b98a55');
  } },
  easel: { label: '그림판', w: 2, h: 2, draw(p) {
    p(2, 10, 2, 6, '#7a5236'); p(12, 10, 2, 6, '#7a5236'); p(7, 11, 2, 5, '#7a5236');
    p(1, 0, 14, 11, OUT); p(2, 1, 12, 9, '#f4f1ea');
    p(4, 3, 4, 3, '#f28ca8'); p(8, 5, 4, 3, '#4fb4d8'); p(6, 2, 2, 2, '#e8c84e');
  } },
  bed: { label: '침대', w: 2, h: 3, draw(p) {
    p(0, 0, 16, 24, OUT); p(1, 1, 14, 22, '#f4f1ea'); p(2, 2, 12, 5, '#ffffff'); p(2, 2, 12, 1, '#ddd5c7');
    p(1, 8, 14, 15, '#6fa8e8'); p(1, 8, 14, 2, '#8fbcf0'); p(1, 14, 14, 1, '#5a90cf');
  } },
};

const cache = new Map();
export function decorSprite(id) {
  let cv = cache.get(id);
  if (cv) return cv;
  const item = DECOR_ITEMS[id];
  cv = document.createElement('canvas');
  cv.width = item.w * DECOR_GRID.cell;
  cv.height = item.h * DECOR_GRID.cell;
  const g = cv.getContext('2d');
  item.draw((x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); });
  cache.set(id, cv);
  return cv;
}

// 겹침 검사용: 칸 → 가구 번호
export function occupancy(items) {
  const occ = new Map();
  items.forEach((it, i) => {
    const d = DECOR_ITEMS[it.t];
    for (let y = it.y; y < it.y + d.h; y++) for (let x = it.x; x < it.x + d.w; x++) occ.set(`${x},${y}`, i);
  });
  return occ;
}

export function fits(items, t, x, y, ignore = -1) {
  const d = DECOR_ITEMS[t];
  if (!d || x < 0 || y < 0 || x + d.w > DECOR_GRID.cols || y + d.h > DECOR_GRID.rows) return false;
  const occ = occupancy(items);
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
    const hit = occ.get(`${xx},${yy}`);
    if (hit !== undefined && hit !== ignore) return false;
  }
  return true;
}

// DB에서 온 값은 믿지 않고 목록에 있는 가구, 칸 안, 겹치지 않는 것만 남긴다
export function cleanDecor(raw) {
  const items = [];
  for (const it of Array.isArray(raw?.items) ? raw.items.slice(0, DECOR_MAX) : []) {
    const t = String(it?.t || ''), x = Number(it?.x), y = Number(it?.y);
    if (!DECOR_ITEMS[t] || !Number.isInteger(x) || !Number.isInteger(y)) continue;
    if (fits(items, t, x, y)) items.push({ t, x, y });
  }
  const rug = RUG_COLORS.includes(raw?.rug) ? raw.rug : '';
  return { items, rug };
}

// 별 (2프레임 반짝임)
const starCache = [];
export function starSprite(frame) {
  if (starCache[frame]) return starCache[frame];
  const rows = [
    '....o....',
    '...oyo...',
    '...oyo...',
    'oooyyyooo',
    'oyyywyyyo',
    '.oyyyyyo.',
    '..oyyyo..',
    '.oyyoyyo.',
    'ooo...ooo',
  ];
  const colors = { o: '#a8741e', y: frame ? '#ffe27a' : '#ffd45e', w: '#ffffff' };
  const cv = document.createElement('canvas');
  cv.width = 9; cv.height = 9;
  const g = cv.getContext('2d');
  rows.forEach((row, y) => { for (let x = 0; x < 9; x++) { const c = colors[row[x]]; if (c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); } } });
  starCache[frame] = cv;
  return cv;
}
