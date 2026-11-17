// 도트 숫자(3x5칸)와 감정 표현 아이콘(7x7칸).

const GLYPHS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  D: ['110', '101', '101', '101', '110'],
  A: ['010', '101', '111', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  '-': ['000', '000', '111', '000', '000'],
  '+': ['000', '010', '111', '010', '000'],
  ':': ['000', '010', '000', '010', '000'],
  '?': ['111', '001', '011', '000', '010'],
  ' ': ['000', '000', '000', '000', '000'],
};

// 글자 폭(월드 px). 글자 3칸 + 사이 1칸, 배율 scale
export const pixelTextWidth = (text, scale) => Math.max(0, text.length * 4 * scale - scale);

// 월드 좌표 (wx, wy)에 그린다. sx/sy는 월드→화면 변환, zoom은 월드 1px의 화면 크기
export function drawPixelText(ctx, text, wx, wy, scale, color, sx, sy, zoom) {
  ctx.fillStyle = color;
  let x = wx;
  for (const ch of text) {
    const g = GLYPHS[ch] || GLYPHS['?'];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (g[r][c] !== '1') continue;
        ctx.fillRect(sx(x + c * scale), sy(wy + r * scale), scale * zoom, scale * zoom);
      }
    }
    x += 4 * scale;
  }
}

// 감정 표현: 숫자 키 1~5
export const EMOTES = [
  { emoji: '❤️', label: '좋아요', colors: { r: '#e5536e', w: '#ffd6de', o: '#7a2a3a' }, rows: [
    '.oo.oo.',
    'orrorro',
    'orwrrro',
    'orrrrro',
    '.orrro.',
    '..oro..',
    '...o...'] },
  { emoji: '😊', label: '웃음', colors: { y: '#ffd45e', o: '#7a5a2a', k: '#4a342c', p: '#f28ca8' }, rows: [
    '.ooooo.',
    'oyyyyyo',
    'oykykyo',
    'opyyypo',
    'oykkkyo',
    'oyyyyyo',
    '.ooooo.'] },
  { emoji: '❗', label: '느낌표', colors: { r: '#f2a35e', o: '#7a4a2a' }, rows: [
    '..ooo..',
    '..oro..',
    '..oro..',
    '..oro..',
    '..ooo..',
    '..oro..',
    '..ooo..'] },
  { emoji: '❓', label: '물음표', colors: { b: '#4fb4d8', o: '#2a4a6a' }, rows: [
    '.ooooo.',
    'obbbbbo',
    'oooobbo',
    '..obbo.',
    '..obo..',
    '..ooo..',
    '..obo..'] },
  { emoji: '🎵', label: '음표', colors: { p: '#9c86e8', o: '#3a2a6a' }, rows: [
    '..ooooo',
    '..oppoo',
    '..op.op',
    'ooop.op',
    'oppoopo',
    'oppoooo',
    '.oo....'] },
];

// 화면 좌표 (x, y)가 아이콘의 가운데 아래
export function drawEmote(ctx, n, x, y, zoom) {
  const em = EMOTES[n - 1];
  if (!em) return;
  const px = Math.max(1, Math.round(zoom));
  const left = Math.round(x - (7 * px) / 2), top = Math.round(y - 7 * px);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(left - px, top - px, 9 * px, 9 * px);
  em.rows.forEach((row, r) => {
    for (let c = 0; c < 7; c++) {
      const color = em.colors[row[c]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(left + c * px, top + r * px, px, px);
    }
  });
}
