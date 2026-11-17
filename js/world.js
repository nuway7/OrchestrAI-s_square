// 광장 맵. 바닥은 한 장으로 굽고, 나무·건물 같은 소품은 따로 그려서 캐릭터와 함께 y 순서로 그린다.
export const TILE = 16;
export const COLS = 48;
export const ROWS = 32;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

const GRASS = 0, PATH = 1, WATER = 2, RIM = 3;
const OUT = '#4a342c';

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSprite(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  const p = (x, y, ww, hh, color) => { g.fillStyle = color; g.fillRect(x, y, ww, hh); };
  draw(p, g);
  return cv;
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// ---------- 소품 그림 ----------
function treeSprite(R) {
  const tones = R() < 0.5
    ? { o: '#3f6b3a', b: '#5fae57', d: '#4c9447', l: '#80c870' }
    : { o: '#3f6640', b: '#6bb36a', d: '#559a57', l: '#8fd081' };
  return makeSprite(28, 36, (p) => {
    p(11, 23, 6, 13, OUT);
    p(12, 23, 4, 12, '#9a6a45');
    p(12, 23, 1, 12, '#b07c52');
    for (let y = 0; y < 27; y++) {
      for (let x = 0; x < 28; x++) {
        const dx = x - 13.5, dy = y - 12.5;
        const bump = Math.sin(Math.atan2(dy, dx) * 5) * 0.8;
        const d = Math.hypot(dx, dy) - bump;
        if (d > 12.8) continue;
        let c = tones.b;
        if (d > 11.6) c = tones.o;
        else if (dx + dy > 7) c = tones.d;
        else if (dx + dy < -9 && d < 9) c = tones.l;
        p(x, y, 1, 1, c);
      }
    }
    p(7, 7, 2, 2, tones.l);
    p(17, 15, 2, 2, tones.d);
  });
}

function gallerySprite() {
  return makeSprite(160, 112, (p) => {
    // 지붕
    for (let y = 0; y < 40; y++) {
      const inset = Math.max(0, Math.round(18 - y * 0.6));
      p(2 + inset, y + 4, 156 - inset * 2, 1, y % 6 === 5 ? '#c27357' : '#d98a6a');
      p(2 + inset, y + 4, 1, 1, OUT);
      p(157 - inset, y + 4, 1, 1, OUT);
    }
    p(20, 3, 120, 2, OUT);
    p(2, 44, 156, 2, OUT);
    // 벽
    p(10, 46, 140, 64, OUT);
    p(12, 46, 136, 62, '#f3e6d3');
    p(12, 100, 136, 8, '#dfcaa9');
    // 창문 두 개 (안에 작은 그림 액자)
    for (const wx of [24, 104]) {
      p(wx, 56, 32, 30, OUT);
      p(wx + 2, 58, 28, 26, '#8a5a3c');
      p(wx + 4, 60, 24, 22, '#cfe9f2');
      p(wx + 9, 64, 14, 12, '#9a6a45');
      p(wx + 10, 65, 12, 10, wx < 60 ? '#f28ca8' : '#9c86e8');
      p(wx + 12, 69, 4, 4, '#e8c84e');
      p(wx + 2, 84, 28, 3, '#dfcaa9');
    }
    // 문
    p(66, 68, 28, 42, OUT);
    p(68, 70, 24, 38, '#9a6a45');
    p(79, 70, 2, 38, '#7a5236');
    p(74, 88, 2, 2, '#e8c84e');
    p(84, 88, 2, 2, '#e8c84e');
    // 간판
    p(54, 49, 52, 14, OUT);
    p(56, 51, 48, 10, '#e8c26a');
  });
}

function boardSprite() {
  return makeSprite(64, 46, (p) => {
    p(6, 24, 6, 22, OUT); p(7, 24, 4, 21, '#8a5a3c');
    p(52, 24, 6, 22, OUT); p(53, 24, 4, 21, '#8a5a3c');
    p(0, 0, 64, 32, OUT);
    p(2, 2, 60, 28, '#9a6a45');
    p(4, 4, 56, 24, '#d9a86c');
    const notes = [[7, 7, '#fde3ea'], [20, 6, '#fff3c4'], [33, 8, '#dff1fb'], [46, 6, '#f4f1ea'], [11, 17, '#e3f5e5'], [27, 17, '#fff3c4'], [41, 17, '#fde3ea']];
    for (const [x, y, c] of notes) {
      p(x, y, 10, 9, '#b98a55');
      p(x, y, 9, 8, c);
      p(x + 4, y, 2, 2, '#d46a6a');
      p(x + 2, y + 4, 5, 1, '#b8a99a');
    }
  });
}

function benchSprite() {
  return makeSprite(32, 14, (p) => {
    p(3, 9, 3, 5, OUT); p(26, 9, 3, 5, OUT);
    p(0, 0, 32, 10, OUT);
    p(1, 1, 30, 3, '#c98b4f');
    p(1, 5, 30, 4, '#b8794a');
    p(1, 4, 30, 1, '#9a6a45');
  });
}

function lampSprite() {
  return makeSprite(10, 32, (p) => {
    p(1, 0, 8, 9, OUT);
    p(2, 1, 6, 7, '#f7e7a0');
    p(3, 2, 2, 3, '#fffbe6');
    p(4, 9, 2, 21, '#4a4a58');
    p(2, 29, 6, 3, OUT);
  });
}

function signSprite() {
  return makeSprite(20, 24, (p) => {
    p(8, 12, 4, 12, OUT); p(9, 12, 2, 11, '#8a5a3c');
    p(0, 0, 20, 14, OUT);
    p(1, 1, 18, 12, '#e8c26a');
    p(4, 4, 12, 1, '#b98a3c'); p(4, 7, 9, 1, '#b98a3c'); p(4, 10, 11, 1, '#b98a3c');
  });
}

function fountainSprite(frame) {
  return makeSprite(20, 30, (p) => {
    p(6, 18, 8, 12, OUT); p(7, 18, 6, 11, '#d6cfc3'); p(7, 18, 2, 11, '#e8e2d8');
    p(2, 14, 16, 5, OUT); p(3, 15, 14, 3, '#cfc7ba');
    const jet = frame ? '#d8f2fb' : '#bfe8f7';
    p(9, 2, 2, 12, jet);
    p(6, 1 + frame, 8, 2, jet);
    p(4, 4 + frame, 2, 6, jet); p(14, 4 + frame, 2, 6, jet);
    p(3, 10, 2, 3, '#8fd3ec'); p(15, 10, 2, 3, '#8fd3ec');
  });
}

// ---------- 맵 만들기 ----------
export function buildWorld() {
  const R = rng(20261117);
  const ground = new Uint8Array(COLS * ROWS);
  const solid = new Uint8Array(COLS * ROWS);
  const reserved = new Uint8Array(COLS * ROWS);
  const at = (c, r) => r * COLS + c;
  const inb = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
  const fill = (arr, c0, r0, c1, r1, v) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (inb(c, r)) arr[at(c, r)] = v;
  };

  const CX = 24, CY = 16;
  fill(ground, 1, 15, COLS - 2, 16, PATH);
  fill(ground, 23, 1, 24, ROWS - 2, PATH);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const d = Math.hypot(c + 0.5 - CX, r + 0.5 - CY);
      if (d < 7) ground[at(c, r)] = PATH;
      if (d < 3.2) { ground[at(c, r)] = RIM; solid[at(c, r)] = 1; }
      if (d < 2.3) ground[at(c, r)] = WATER;
    }
  }

  // 전시관
  fill(ground, 4, 3, 13, 14, PATH);
  fill(ground, 3, 9, 14, 10, PATH);
  fill(ground, 8, 9, 9, 14, PATH);
  fill(solid, 4, 4, 13, 8, 1);
  fill(reserved, 2, 1, 15, 11, 1);
  // 의견 게시판
  fill(ground, 32, 7, 39, 8, PATH);
  fill(ground, 35, 7, 36, 14, PATH);
  fill(solid, 34, 5, 37, 6, 1);
  fill(reserved, 31, 3, 40, 9, 1);
  // 테두리는 못 나가게
  fill(solid, 0, 0, COLS - 1, 0, 1);
  fill(solid, 0, ROWS - 1, COLS - 1, ROWS - 1, 1);
  fill(solid, 0, 0, 0, ROWS - 1, 1);
  fill(solid, COLS - 1, 0, COLS - 1, ROWS - 1, 1);

  const props = [];
  const addProp = (img, cx, bottom) => props.push({ img, x: Math.round(cx - img.width / 2), y: bottom - img.height, baseY: bottom });

  const galleryImg = gallerySprite();
  props.push({ img: galleryImg, x: 4 * TILE, y: 9 * TILE - galleryImg.height, baseY: 9 * TILE });
  const boardImg = boardSprite();
  props.push({ img: boardImg, x: 34 * TILE, y: 7 * TILE - boardImg.height, baseY: 7 * TILE });

  // 벤치와 가로등
  for (const [c, r] of [[19, 11], [27, 11], [19, 20], [27, 20]]) {
    fill(solid, c, r, c + 1, r, 1);
    addProp(benchSprite(), (c + 1) * TILE, (r + 1) * TILE - 1);
  }
  for (const [c, r] of [[17, 14], [30, 14], [17, 17], [30, 17]]) {
    solid[at(c, r)] = 1;
    addProp(lampSprite(), c * TILE + 8, (r + 1) * TILE - 2);
  }
  // 안내 표지판
  solid[at(26, 22)] = 1;
  addProp(signSprite(), 26 * TILE + 8, 23 * TILE - 2);

  // 나무: 테두리 + 빈 잔디
  const trees = [];
  const placeTree = (c, r) => {
    trees.push([c, r]);
    solid[at(c, r)] = 1;
    addProp(treeSprite(R), c * TILE + 8, (r + 1) * TILE);
  };
  for (let c = 0; c < COLS; c += 2) { placeTree(c, 0); placeTree(c + 1 < COLS ? c + 1 : c, ROWS - 1); }
  for (let r = 2; r < ROWS - 1; r += 2) { placeTree(0, r); placeTree(COLS - 1, r); }
  const grassAround = (c, r) => {
    for (let y = r - 1; y <= r + 1; y++) for (let x = c - 1; x <= c + 1; x++) {
      if (!inb(x, y) || ground[at(x, y)] !== GRASS || reserved[at(x, y)] || solid[at(x, y)]) return false;
    }
    return true;
  };
  for (let i = 0, placed = 0; i < 400 && placed < 26; i++) {
    const c = 2 + Math.floor(R() * (COLS - 4));
    const r = 2 + Math.floor(R() * (ROWS - 4));
    if (!grassAround(c, r)) continue;
    if (trees.some(([x, y]) => Math.hypot(x - c, y - r) < 3.2)) continue;
    placeTree(c, r);
    placed++;
  }

  // ---------- 바닥 한 장 굽기 ----------
  const groundCanvas = document.createElement('canvas');
  groundCanvas.width = WORLD_W;
  groundCanvas.height = WORLD_H;
  const gctx = groundCanvas.getContext('2d');
  const img = gctx.createImageData(WORLD_W, WORLD_H);
  const C = {
    grass: hex('#93cf6f'), grassD: hex('#82c062'), grassL: hex('#a7dc85'),
    path: hex('#ead8b2'), pathD: hex('#dfca9c'), pathL: hex('#f3e6c8'), pathEdge: hex('#cdb487'),
    rim: hex('#d6cfc3'), rimD: hex('#b3aa9b'), water: hex('#69bfe0'), waterL: hex('#8fd3ec'),
  };
  const typeAt = (c, r) => (inb(c, r) ? ground[at(c, r)] : GRASS);
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const c = (x / TILE) | 0, r = (y / TILE) | 0;
      const px = x % TILE, py = y % TILE;
      const t = ground[at(c, r)];
      const n = R();
      let col;
      if (t === GRASS) col = n < 0.07 ? C.grassD : n < 0.1 ? C.grassL : C.grass;
      else if (t === PATH) {
        const edge = (px === 0 && typeAt(c - 1, r) === GRASS) || (px === 15 && typeAt(c + 1, r) === GRASS)
          || (py === 0 && typeAt(c, r - 1) === GRASS) || (py === 15 && typeAt(c, r + 1) === GRASS);
        col = edge ? C.pathEdge : n < 0.08 ? C.pathD : n < 0.12 ? C.pathL : C.path;
      } else if (t === RIM) {
        const off = (Math.floor(y / 6) % 2) * 5;
        col = (y % 6 === 0 || (x + off) % 10 === 0) ? C.rimD : C.rim;
      } else col = n < 0.05 ? C.waterL : C.water;
      const i = (y * WORLD_W + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
  }
  gctx.putImageData(img, 0, 0);

  // 잔디 위 꽃과 풀
  const flowerColors = ['#f4f1ea', '#f28ca8', '#e8c84e', '#9c86e8'];
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (ground[at(c, r)] !== GRASS || solid[at(c, r)]) continue;
      const n = R();
      const x = c * TILE + 3 + Math.floor(R() * 10), y = r * TILE + 3 + Math.floor(R() * 10);
      if (n < 0.08) {
        gctx.fillStyle = flowerColors[Math.floor(R() * flowerColors.length)];
        gctx.fillRect(x - 1, y, 3, 1); gctx.fillRect(x, y - 1, 1, 3);
        gctx.fillStyle = '#e8c84e'; gctx.fillRect(x, y, 1, 1);
      } else if (n < 0.25) {
        gctx.fillStyle = '#74b157';
        gctx.fillRect(x, y, 1, 2); gctx.fillRect(x + 2, y - 1, 1, 3);
      }
    }
  }
  // 소품 그림자
  gctx.fillStyle = 'rgba(40, 60, 30, 0.18)';
  for (const pr of props) {
    const w = Math.min(pr.img.width, 28);
    for (let k = 0; k < 4; k++) {
      const ww = Math.round(w * (1 - Math.abs(k - 1.5) / 3));
      gctx.fillRect(Math.round(pr.x + pr.img.width / 2 - ww / 2), pr.baseY - 3 + k, ww, 1);
    }
  }

  const fountain = [fountainSprite(0), fountainSprite(1)];
  const fountainProp = { img: fountain[0], frames: fountain, x: CX * TILE - 10, y: CY * TILE + 6 - 30, baseY: CY * TILE + 6 };
  props.push(fountainProp);

  const zones = [
    { id: 'gallery', label: '전시관 들어가기', x: 7 * TILE, y: 9 * TILE, w: 4 * TILE, h: 2 * TILE },
    { id: 'board', label: '의견 게시판 보기', x: 33 * TILE, y: 7 * TILE, w: 6 * TILE, h: 2 * TILE },
    { id: 'sign', label: '안내 읽기', x: 25 * TILE, y: 21 * TILE, w: 3 * TILE, h: 3 * TILE },
  ];
  const labels = [
    { text: '전시관', x: 4 * TILE + 80, y: 9 * TILE - 56 },
    { text: '의견 게시판', x: 34 * TILE + 32, y: 7 * TILE - 50 },
    { text: '분수 광장', x: CX * TILE, y: (CY - 4) * TILE + 4 },
  ];

  const isSolid = (x, y) => {
    const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
    if (!inb(c, r)) return true;
    return solid[at(c, r)] === 1;
  };

  return { groundCanvas, props, fountainProp, zones, labels, isSolid, spawn: { x: CX * TILE, y: 22 * TILE } };
}
