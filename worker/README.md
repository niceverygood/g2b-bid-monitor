# g2b Attachment Worker

자체 호스팅 워커. Vercel Function 에서 처리 못 하는 첨부파일을 보완.

## 주 기능

1. **HWP 5.x 재파싱** (현재 구현)
   - Vercel 에서는 `hwp5txt` (pyhwp) 가 없어 HWP 바이너리를 `NEEDS_WORKER` 로 표시해둠
   - 이 워커가 Supabase Storage 에서 원본을 받아 `hwp5txt` 로 텍스트 추출 → `attachment_text` 업데이트

2. **Playwright 폴백** (P1, 미구현)
   - OpenAPI 직링크로 못 받는 공고는 g2b 세션을 Playwright 로 열고
     AES 암호화된 `k01` 다운로드 경로로 원본 획득

## 빌드 & 실행

### 로컬 개발 (tsx, 컨테이너 없이)

```bash
cd worker
npm install
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_KEY=eyJhbGci... \
HWP5TXT_BIN=~/Library/Python/3.11/bin/hwp5txt \
  npm run dev
```

(macOS 는 `python3 -m pip install --user pyhwp` 하면 `~/Library/Python/3.11/bin/hwp5txt` 가 생긴다.)

### 프로덕션 (docker compose)

```bash
cd worker
cp .env.example .env      # 값 채우기
docker compose up -d      # 빌드 + 백그라운드 실행
docker compose logs -f    # 로그 확인
```

docker-compose.yml 은 다음을 포함한다:
- `restart: unless-stopped` — 호스트 재시작에도 자동 복구
- 로그 로테이션 (10MB × 5개)
- hwp5txt 헬스체크 (venv 손상 감지)

### 단일 `docker run` (compose 없이)

```bash
docker build -t g2b-attachment-worker ./worker
docker run -d --name g2b-worker \
  -e SUPABASE_URL=... \
  -e SUPABASE_SERVICE_KEY=... \
  -e MIN_SCORE=70 \
  -e POLL_INTERVAL_MS=300000 \
  --restart unless-stopped \
  g2b-attachment-worker
```

## 환경변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `SUPABASE_URL` | — | 필수. Supabase Project URL |
| `SUPABASE_SERVICE_KEY` | — | 필수. service_role 키 |
| `MIN_SCORE` | `70` | 처리 대상 total_score 하한 |
| `POLL_INTERVAL_MS` | `300000` | 폴링 주기 (5분) |
| `HWP5TXT_BIN` | `/opt/pyhwp-venv/bin/hwp5txt` (Docker) | hwp5txt 바이너리 경로 |

## 이미지 구성

베이스: `mcr.microsoft.com/playwright:v1.47.0-jammy` (~1.5GB)
추가:
- `python3-venv` 로 `/opt/pyhwp-venv` 생성 → 그 안에 pyhwp 설치 (Jammy PEP 668 우회)
- `npm install --omit=dev` + `npx tsc -p .` → `dist/index.js`

## 검증된 동작

로컬 tsx 런 (POLL_INTERVAL_MS=2s, MIN_SCORE=70) 로 실전 공고 1건 검증 완료:
- 공고 `R26BK01457862` (KISTA IP통합지원포털) 의 HWP 5.x 3개 파일을 claim → Storage 에서 다운로드 → hwp5txt 로 파싱 → `attachment_text` 업데이트 (9,097 / 9,097 / 12,141 자).
- claim 쿼리는 `attachments_status IN (DOWNLOADED, PARSED)` 로 1차 필터 후 앱 단에서 `NEEDS_WORKER` 엔트리 유무를 확인한다. (PostgREST 의 `.contains(array+object)` 는 JSONB 인코딩 오류가 나서 쓸 수 없었음.)
