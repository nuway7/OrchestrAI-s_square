# Supabase 연결하기

처음 한 번만 하면 돼요. 15분쯤 걸려요. (대시보드 메뉴 이름은 Supabase 업데이트에 따라 조금 다를 수 있어요.)

## 1. 프로젝트 만들기

1. https://supabase.com 에 가입하고 **New project**를 눌러요.
2. 이름은 자유(예: `club-plaza`), Region은 **Northeast Asia (Seoul)**.
3. Database Password는 따로 안전하게 적어 두세요. **이 비밀번호는 사이트 코드에 넣지 않아요.**

## 2. DB 만들기

1. 왼쪽 메뉴 **SQL Editor** → New query.
2. [supabase/schema.sql](supabase/schema.sql) 내용을 통째로 붙여 넣고 **Run**.
3. "Success. No rows returned"가 나오면 성공이에요.

## 3. 아무나 가입하지 못하게 막기 (중요)

- **Authentication → Sign In / Providers**
  - **Allow new users to sign up**: 끄기 → 이제 계정은 운영진만 만들 수 있어요.
  - Email 공급자는 켜 둔 채로 둬요 (이메일+비밀번호 로그인에 씀).

## 4. 실시간 채널을 비공개로 (중요)

- **Realtime → Settings** → **Allow public access** 끄기
  → 로그인한 동아리원만 광장 실시간 채널에 들어올 수 있어요.

## 5. 동아리원 계정 만들기

- **Authentication → Users → Add user → Create new user**
  - 이메일, 임시 비밀번호 입력, **Auto Confirm User** 체크.
- 임시 비밀번호는 동아리원에게 직접(카톡 등) 알려 주고, 첫 로그인 뒤 입장 화면의 **비밀번호 바꾸기**로 바꾸라고 안내해요.
- 탈퇴한 사람은 같은 화면에서 계정을 지우면 바로 못 들어와요(그 사람 글도 같이 지워져요).

## 6. 사이트에 주소와 공개 키 넣기

1. **Project Settings → Data API**의 **Project URL** (`https://xxxx.supabase.co`)
2. **Project Settings → API Keys**의 **Publishable key** (`sb_publishable_...`)
   - 없으면 Legacy API Keys 탭의 `anon` `public` 키
3. [js/config.js](js/config.js)에 넣어요.

```js
export const SUPABASE_URL = 'https://xxxx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_...';
```

> ⚠️ **secret 키(`sb_secret_...`)나 `service_role` 키는 절대 넣지 마세요.** 공개 저장소에 올라가면 누구나 DB를 마음대로 쓸 수 있어요. 실수로 넣으면 사이트가 열리지 않게 막아 두었어요. 혹시 올렸다면 대시보드에서 바로 새 키로 바꾸세요(rotate).

## 7. 나를 관리자로 (선택)

관리자는 다른 사람 글도 지울 수 있어요. 사이트에 **한 번 로그인해서 입장한 뒤**, SQL Editor에서:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = '내 이메일');
```

## 8. 확인하기

- [ ] `py serve.py` → http://localhost:5188 에 로그인 화면이 뜬다
- [ ] 만든 계정으로 로그인 → 이름·캐릭터 정하고 입장
- [ ] 다른 브라우저(또는 시크릿 창)에서 다른 계정으로 로그인 → 서로 움직임·말풍선이 보인다
- [ ] 전시관·게시판에 글을 올리면 다른 쪽 창에서도 보인다
- [ ] 로그아웃 상태에서는 로그인 화면에서 더 못 들어간다

## 무료 플랜에서 알아 둘 것

| 항목 | 한도 | 이 사이트 기준 |
|---|---|---|
| 동시 접속 | 200명 | 동아리 규모면 충분 |
| 실시간 메시지 | 월 200만 개 | 위치를 "걷기 시작·방향 바뀜·1초마다"만 보내도록 아껴 두었어요 |
| DB 용량 | 500MB | 글만 저장하면 아주 넉넉 |
| **일시정지** | 7일 동안 아무도 안 쓰면 프로젝트가 잠들어요 | 대시보드에서 **Restore**를 누르면 다시 켜져요 |

## 보안 정리

- 로그인하지 않은 사람은 DB에서 아무것도 읽을 수 없어요(RLS).
- 글은 쓴 사람만 지울 수 있고, 관리자는 모두 지울 수 있어요. 남의 이름으로 글을 쓸 수 없어요.
- 자기 권한(role)을 스스로 관리자로 바꿀 수 없어요.
- 코드와 맵 그림은 공개 저장소에 있으니 누구나 볼 수 있지만, 그 안에 회원 정보나 글은 없어요.
- 실시간 채널 안의 말풍선 이름은 보내는 쪽이 정해요. 로그인한 동아리원끼리만 오가는 신호라 큰 문제는 아니지만, 장난으로 다른 이름을 쓸 수는 있어요(글은 DB가 실제 작성자로 기록해요).
