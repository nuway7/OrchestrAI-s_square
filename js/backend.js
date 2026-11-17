// 어떤 모드로 열지 정한다. config.js가 채워져 있으면 Supabase, 비어 있으면 연습(local) 모드.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';

function looksSecret(key) {
  if (/^sb_secret_/.test(key)) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'service_role';
  } catch { return false; }
}

export let supabase = null;
export let configError = '';

// 대시보드에서 복사할 때 흔히 딸려 오는 공백, 끝의 /rest/v1/ 은 알아서 뗀다
const url = SUPABASE_URL.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const key = SUPABASE_KEY.trim();

if (url || key) {
  if (!url || !key) configError = 'config.js에 SUPABASE_URL과 SUPABASE_KEY를 둘 다 넣어 주세요.';
  else if (looksSecret(key)) configError = 'config.js에 secret(service_role) 키가 들어 있어요. 이 키는 공개하면 안 돼요. publishable(anon) 키로 바꾸고, 대시보드에서 secret 키를 새로 발급(rotate)해 주세요.';
  else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) configError = 'SUPABASE_URL은 https://xxxx.supabase.co 모양이어야 해요.';
  else {
    const { createClient } = await import(SDK_URL);
    supabase = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
}

export const mode = supabase ? 'supabase' : 'local';
