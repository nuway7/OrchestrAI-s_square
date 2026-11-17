// 캐릭터 도트 그림. 12x16칸 템플릿에 각자 고른 색을 입혀 캔버스로 굽는다.
// 글자: o 외곽선, h 머리카락, s 피부, e 눈, c 옷, p 바지, b 신발, . 투명

const HEAD_FRONT = [
  '...oooooo...',
  '..ohhhhhho..',
  '.ohhhhhhhho.',
  '.ohhhhhhhho.',
  '.ohssssssho.',
  '.osesssseso.',
  '.osssssssso.',
  '..osssssso..',
  '...oooooo...',
];
const HEAD_BACK = [
  '...oooooo...',
  '..ohhhhhho..',
  '.ohhhhhhhho.',
  '.ohhhhhhhho.',
  '.ohhhhhhhho.',
  '.ohhhhhhhho.',
  '.ohhhhhhhho.',
  '..ohhhhhho..',
  '...oooooo...',
];
const HEAD_SIDE = [
  '...oooooo...',
  '..ohhhhhho..',
  '.ohhhhhhhho.',
  '.ohhhhhhhho.',
  '.ossssshhho.',
  '.osesssshho.',
  '.osssssshho.',
  '..osssssso..',
  '...oooooo...',
];
const BODY_FRONT = [
  'occcccccccco',
  'occcccccccco',
  'osccccccccso',
];
const BODY_SIDE = [
  '..occcccco..',
  '..occcccco..',
  '..osccccco..',
];
const LEGS_FRONT = [
  ['.oppppppppo.', '.oppo..oppo.', '.obbo..obbo.', '.oooo..oooo.'],
  ['.oppppppppo.', '.oppo..obbo.', '.obbo..oooo.', '.oooo.......'],
  ['.oppppppppo.', '.obbo..oppo.', '.oooo..obbo.', '.......oooo.'],
];
const LEGS_SIDE = [
  ['..oppppppo..', '...oppppo...', '...obbbbo...', '...oooooo...'],
  ['..oppppppo..', '.oppo.oppo..', '.obbo.obbo..', '.oooo.oooo..'],
  ['..oppppppo..', '...oppppo...', '...obbbbo...', '...oooooo...'],
];

export const SPRITE_W = 12;
export const SPRITE_H = 16;

export const PALETTE = {
  hair: ['#3b2a26', '#7a4a2e', '#c98b4f', '#e8c26a', '#d46a6a', '#6a7fd4', '#f2f0ea'],
  skin: ['#fde3cf', '#f5cfae', '#e0ac85', '#b9805a', '#8a5a3c'],
  shirt: ['#f28ca8', '#f2a35e', '#e8c84e', '#58b98a', '#4fb4d8', '#9c86e8', '#f4f1ea', '#4a4a58'],
  pants: ['#4a5a7a', '#3b3b46', '#7a5a46', '#58806a', '#c9b49a'],
};

const FIXED = { o: '#3b2a26', e: '#2a1d1b', b: '#5a4038' };

export function randomLook() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return { hair: pick(PALETTE.hair), skin: pick(PALETTE.skin), shirt: pick(PALETTE.shirt), pants: pick(PALETTE.pants) };
}

// 다른 사람이 보낸 색이 팔레트 밖이면 기본색으로 (아무 문자열이나 그리지 않게)
export function safeLook(look) {
  const ok = (k) => (look && PALETTE[k].includes(look[k]) ? look[k] : PALETTE[k][0]);
  return { hair: ok('hair'), skin: ok('skin'), shirt: ok('shirt'), pants: ok('pants') };
}

const cache = new Map();

// dir: 'down' | 'up' | 'left' | 'right', frame: 0 서 있기, 1·2 걷기
export function charSprite(look, dir, frame) {
  const key = `${look.hair}${look.skin}${look.shirt}${look.pants}|${dir}|${frame}`;
  let cv = cache.get(key);
  if (cv) return cv;
  const side = dir === 'left' || dir === 'right';
  const head = dir === 'up' ? HEAD_BACK : side ? HEAD_SIDE : HEAD_FRONT;
  const body = side ? BODY_SIDE : BODY_FRONT;
  const legs = (side ? LEGS_SIDE : LEGS_FRONT)[frame] || LEGS_FRONT[0];
  const rows = [...head, ...body, ...legs];
  const colors = { ...FIXED, h: look.hair, s: look.skin, c: look.shirt, p: look.pants };
  cv = document.createElement('canvas');
  cv.width = SPRITE_W;
  cv.height = SPRITE_H;
  const g = cv.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < SPRITE_W; x++) {
      const ch = row[dir === 'right' ? SPRITE_W - 1 - x : x];
      if (ch === '.' || !ch) continue;
      g.fillStyle = colors[ch];
      g.fillRect(x, y, 1, 1);
    }
  });
  cache.set(key, cv);
  return cv;
}
