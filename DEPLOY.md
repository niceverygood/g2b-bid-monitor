# 🚀 배포 가이드 — 따라하기만 하면 됩니다

이 가이드는 **Supabase (DB)** + **Vercel (서버 + 프론트)** 조합으로 배포하는 전체 과정입니다.
처음 해보는 분도 그대로 따라가면 끝나도록 썼습니다.

**준비물** (모두 무료):
- GitHub 계정
- Supabase 계정 (https://supabase.com)
- Vercel 계정 (https://vercel.com)
- 나라장터 공공데이터 포털 API 키 (https://data.go.kr)
- OpenRouter API 키 (https://openrouter.ai)
- Slack Incoming Webhook URL (선택)

**총 소요시간**: 약 20~30분

---

## 📋 배포 절차 한눈에

1. **GitHub에 코드 푸시** (이미 돼 있으면 스킵)
2. **Supabase 프로젝트 생성 + DB 스키마 만들기**
3. **Supabase 환경변수 값 복사**
4. **Vercel에 레포 연결 + 환경변수 입력**
5. **Deploy 버튼 클릭**
6. **배포 후 크론/기능 확인**

---

## 1️⃣ GitHub에 코드 올리기

이미 `niceverygood/g2b-bid-monitor` 레포가 있으면 **스킵**.

```bash
cd /Users/seungsoohan/Projects/g2b-bid-monitor
git add .
git commit -m "Vercel + Supabase 배포 준비"
git push origin main
```

---

## 2️⃣ Supabase 프로젝트 만들기

### 2-1. 프로젝트 생성

1. https://supabase.com 접속 → 우상단 **Sign In** (GitHub 로그인 권장)
2. 대시보드 좌상단 **New project** 클릭
3. 다음처럼 입력:
   - **Organization**: 본인 계정 선택
   - **Name**: `g2b-bid-monitor` (원하는 이름)
   - **Database Password**: 강력한 비밀번호 입력 후 **꼭 어딘가에 저장** (나중에 안 써도 됨, 그래도 저장)
   - **Region**: `Northeast Asia (Seoul)` ← 반드시 한국 가까운 곳
   - **Pricing Plan**: `Free` 그대로
4. **Create new project** 클릭
5. 프로젝트 생성에 1~2분 걸립니다. 완료되면 대시보드로 이동.

### 2-2. DB 스키마 적용 (테이블 만들기)

1. 좌측 사이드바 **SQL Editor** (계산기 아이콘) 클릭
2. 우상단 **+ New query** 클릭
3. 이 레포의 `supabase/migrations/001_initial_schema.sql` 파일을 열어서 **전체 내용을 복사**
4. Supabase SQL Editor에 **붙여넣기**
5. 우하단 **Run** 버튼 클릭 (또는 ⌘/Ctrl + Enter)
6. 좌하단에 `Success. No rows returned` 메시지가 뜨면 OK
7. 확인: 좌측 사이드바 **Table Editor**(데이터베이스 아이콘) → `bids`, `proposals`, `pipeline_results`, `collection_logs` 테이블 4개가 보이면 성공 ✅

### 2-3. Supabase 접속 정보 복사 (매우 중요)

1. 좌측 사이드바 맨 아래 **Project Settings** (톱니바퀴) 클릭
2. **API** 메뉴 선택
3. 아래 두 값을 메모장에 복사해 두기:

   | 표시 이름 | 나중에 쓸 이름 |
   |---|---|
   | **Project URL** (`https://xxxxx.supabase.co`) | `SUPABASE_URL` |
   | **Project API keys → service_role** (긴 문자열) | `SUPABASE_SERVICE_KEY` |

   ⚠️ **service_role 키는 절대 프론트엔드나 공개 레포에 넣으면 안 됩니다.**
   Vercel 환경변수로만 사용하세요.

---

## 3️⃣ 나머지 API 키 준비

배포할 때 필요한 나머지 값들을 미리 모아두세요.

### G2B_API_KEY (나라장터)

1. https://www.data.go.kr 접속 → 로그인
2. `나라장터 입찰공고정보서비스` 검색
3. **활용신청** → 승인되면 **마이페이지 → 일반 인증키(Decoding)** 값 복사

### OPENROUTER_API_KEY

1. https://openrouter.ai 접속 → Sign up
2. 우상단 프로필 → **Keys** → **Create Key**
3. 생성된 `sk-or-v1-...` 키 복사
4. **Credits** 메뉴에서 $5~10 정도 충전 (Claude Sonnet 4 사용)

### SLACK_WEBHOOK_URL (선택)

알림이 필요 없으면 스킵 가능.

1. https://api.slack.com/messaging/webhooks 접속
2. **Create your Slack app** → From scratch → 앱 이름/워크스페이스 선택
3. **Incoming Webhooks** → 활성화 → **Add New Webhook to Workspace**
4. 채널 선택 후 생성되는 `https://hooks.slack.com/services/...` URL 복사

### CRON_SECRET

아래 명령어로 랜덤 문자열 생성:

```bash
openssl rand -hex 32
```

출력된 긴 문자열을 복사해 두기.

---

## 4️⃣ Vercel 배포하기

### 4-1. 프로젝트 import

1. https://vercel.com 접속 → 로그인 (GitHub 권장)
2. 대시보드에서 **Add New... → Project** 클릭
3. `niceverygood/g2b-bid-monitor` 레포 찾아서 **Import**
   - 안 보이면 **Adjust GitHub App Permissions** 로 권한 추가
4. **Configure Project** 화면이 뜹니다.

### 4-2. 빌드 설정 (자동)

아래 값들은 `vercel.json`에 이미 있어서 **건드리지 마세요**:
- Framework Preset: `Other`
- Build Command: (자동)
- Output Directory: (자동)

### 4-3. 환경변수 입력 ⭐ 가장 중요

**Environment Variables** 섹션을 펼쳐서 아래 6개를 **하나씩** 입력합니다.

| Name | Value |
|---|---|
| `SUPABASE_URL` | 2-3단계에서 복사한 Project URL |
| `SUPABASE_SERVICE_KEY` | 2-3단계에서 복사한 service_role 키 |
| `G2B_API_KEY` | 나라장터 일반 인증키(Decoding) |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` |
| `SLACK_WEBHOOK_URL` | `https://hooks.slack.com/...` (없으면 빈 값 OK) |
| `CRON_SECRET` | `openssl rand -hex 32` 결과값 |

각 값을 입력하고 **Add** 버튼으로 추가하세요.

### 4-4. 배포 실행

1. 화면 맨 아래 **Deploy** 버튼 클릭
2. 빌드 로그가 흐르기 시작합니다 (2~3분)
3. 🎉 축하 화면이 뜨면 성공. **Continue to Dashboard** 클릭
4. 상단 `Visit` 버튼으로 사이트 확인 (`https://xxx.vercel.app`)

---

## 5️⃣ 배포 후 동작 확인

### 5-1. 기본 화면 확인

`https://xxx.vercel.app` 접속 → 입찰 대시보드가 뜨면 성공.
아직 데이터가 없어서 "수집된 공고 없음"이 정상입니다.

### 5-2. 수집 한 번 돌려보기

대시보드 우상단 **🔄 수집 시작** 버튼 클릭.
또는 터미널에서:

```bash
curl -X POST https://xxx.vercel.app/api/collect
```

5분 정도 기다린 뒤 새로고침하면 공고가 표시됩니다.

### 5-3. Supabase에서 데이터 확인

Supabase 대시보드 → **Table Editor → bids** → 레코드가 쌓이면 OK ✅

### 5-4. 크론 작업 확인

Vercel 대시보드 → 프로젝트 → **Settings → Cron Jobs** 메뉴에서 3개 크론이 등록돼 있는지 확인:

| 엔드포인트 | 스케줄 |
|---|---|
| `/api/cron/collect` | 2시간마다 |
| `/api/cron/auto-pipeline` | 3시간마다 |
| `/api/cron/deadline` | 매일 오전 8시·오후 5시 (KST) |

각 크론을 **Run Now** 버튼으로 수동 테스트 가능.

---

## ⚠️ 중요 — Vercel Pro 플랜 필요

### Hobby (무료)는 부족합니다
- 서버리스 함수 실행 제한: **10초**
- 입찰 파이프라인은 AI 호출이 8~10번 연쇄되어 **5분**이 걸립니다.
- Hobby로 배포하면 수집/분석은 되지만 **제안서 생성과 파이프라인이 timeout으로 실패**합니다.

### Pro 플랜 ($20/월) 권장
- 서버리스 함수 최대 **300초 (5분)**
- 모든 기능 정상 동작
- Vercel 대시보드 → 본인 계정 → **Settings → Plans → Upgrade to Pro**

### Hobby에서도 쓰려면
`vercel.json`에서 크론 `auto-pipeline`을 제거하고, 프론트에서 **제안서 생성 기능을 숨기고**, 수집만 사용하세요.

---

## 🔧 문제 해결

### "SUPABASE_URL 또는 SUPABASE_SERVICE_KEY 환경변수가 설정되지 않았습니다" 경고
→ Vercel Settings → Environment Variables 에서 두 값이 입력됐는지 확인. 입력 후 **Redeploy** 필요.

### 배포는 되는데 `/api/bids`가 500 에러
→ Supabase 스키마가 적용 안 됐을 가능성. 2-2단계 다시 실행.
→ 또는 Supabase 대시보드 **Logs → API**에서 실제 에러 확인.

### 크론이 동작 안 함
→ Vercel Cron은 **Pro 플랜**에서 최대 스케줄 개수 제한 완화. Hobby에서도 기본 1일 1~2회는 돌아갑니다.
→ 수동 트리거: `curl -X POST https://xxx.vercel.app/api/cron/collect -H "Authorization: Bearer $CRON_SECRET"`

### Slack 알림이 안 옴
→ `SLACK_WEBHOOK_URL` 값이 정확한지 확인. 테스트:
```bash
curl -X POST -H 'Content-type: application/json' --data '{"text":"test"}' $SLACK_WEBHOOK_URL
```

### 빌드 실패 (frontend/dist 없음)
→ `vercel.json`의 `buildCommand`가 `cd frontend && npm install && npm run build`를 포함하는지 확인.

---

## 📁 레포 구조 요약

```
/
├─ api/                         Vercel Serverless Functions (12개)
│  ├─ bids/index.ts             GET /api/bids
│  ├─ bids/[id]/index.ts        GET /api/bids/:id
│  ├─ bids/[id]/bookmark.ts     POST /api/bids/:id/bookmark
│  ├─ bids/[id]/pipeline.ts     입찰 준비 파이프라인
│  ├─ bids/[id]/proposals/      제안서 6종 생성·조회
│  ├─ stats.ts, logs.ts
│  ├─ collect.ts                수동 수집 트리거
│  └─ cron/                     자동 크론 3종
├─ lib/                         공통 비즈니스 로직 (Supabase 기반)
├─ frontend/                    React + Vite (정적 호스팅)
├─ supabase/migrations/         SQL 스키마
├─ backend/                     (레거시, 배포 제외됨)
├─ vercel.json                  Vercel 설정
└─ package.json                 서버리스 의존성
```

---

## ✅ 체크리스트

배포 전 모두 체크됐는지 확인:

- [ ] GitHub에 코드 푸시 완료
- [ ] Supabase 프로젝트 생성
- [ ] SQL Editor에서 `001_initial_schema.sql` 실행 성공
- [ ] Table Editor에서 테이블 4개 확인
- [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` 복사
- [ ] `G2B_API_KEY`, `OPENROUTER_API_KEY` 준비
- [ ] `CRON_SECRET` 랜덤 문자열 생성
- [ ] Vercel에서 레포 Import
- [ ] 환경변수 6개 모두 입력
- [ ] Deploy 성공
- [ ] `/api/stats` 응답 확인
- [ ] 🔄 수집 테스트 후 Supabase에 데이터 확인

끝! 문제가 생기면 Vercel `Logs` 탭 + Supabase `Logs` 탭을 먼저 확인하세요.
