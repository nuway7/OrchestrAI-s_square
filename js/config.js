// Supabase 프로젝트 주소와 공개 키를 넣는 곳.
// - SUPABASE_URL: 대시보드 > Project Settings > Data API 의 Project URL (https://xxxx.supabase.co)
// - SUPABASE_KEY: 대시보드 > Project Settings > API Keys 의 publishable 키(sb_publishable_...) 또는 legacy anon 키
// 이 두 값은 공개 저장소에 올려도 되도록 설계된 값이에요. 실제 보호는 DB의 RLS 규칙이 해요.
// ⚠️ secret 키(sb_secret_...)나 service_role 키는 절대 넣지 마세요. 넣으면 사이트가 열리지 않게 막아 두었어요.
//
// 둘 다 비워 두면 로그인 없이 이 브라우저 안에서만 도는 연습 모드로 열려요.
export const SUPABASE_URL = 'https://mpuqdjlwpcdpizlyxxnl.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_58YT6rUpwOb7inzw-maB3A_Y2VX-8G8';
