# OpenClaw 연동 — 나라장터 자동 지원

바틀 입찰 모니터(Vercel)에서 분석·생성한 제안서를 **OpenClaw가 로컬 Mac에서 나라장터 사이트에 자동 업로드**하는 구성입니다.

## 아키텍처

```
g2b-bid-monitor (Vercel, 원격)        OpenClaw (Mac, 로컬)
──────────────────────────            ──────────────────────
공고 수집 (2h cron)                    Slack 멘션 수신
AI 적합도 분석                         │
제안서 6종 생성 (.docx)       ◀─API──  공고 정보 + zip 다운로드
Slack 알림 발송 ──────────────▶        │
                                       Chromium 브라우저 열기
                                       나라장터 로그인 대기 (사용자 PIN)
                                       파일 업로드 + 금액 입력
                                       🛑 제출 직전에서 정지
                                       사용자가 직접 '제출' 클릭
```

## ⚠️ 법적 제약
- 나라장터 전자입찰 특별약관 제8조: **"입찰자 본인이 직접 참여"** 필수
- 이 스킬은 **제출 직전까지 자동화**만 수행합니다
- 최종 제출 버튼은 반드시 사람이 직접 클릭
- 공동인증서 PIN은 사용자가 직접 입력

## 설치 (Mac)

### 1. OpenClaw 설치
```bash
# 공식 저장소: https://github.com/openclaw/openclaw
# 문서: https://docs.openclaw.ai/
```

설치 방법은 공식 문서 참조. 설치 후 `openclaw gateway` 가 백그라운드로 실행돼야 합니다.

### 2. Slack 앱 생성
1. https://api.slack.com/apps/new → From manifest
2. Bot Token(`xoxb-...`) + App-Level Token(`xapp-...`) 발급
3. Socket Mode 활성화
4. 필요 스코프: `app_mentions:read`, `chat:write`, `files:read`, `files:write`, `channels:history`, `im:history`, `im:write`

### 3. OpenClaw 설정 (`~/.openclaw/config.json5`)
```json5
{
  channels: {
    slack: {
      enabled: true,
      mode: "socket",
      appToken: "xapp-...",
      botToken: "xoxb-...",
    },
  },
  models: {
    provider: "openrouter",
    apiKey: "sk-or-v1-...", // g2b-bid-monitor와 동일 키 재사용 가능
    default: "anthropic/claude-sonnet-4",
  },
  skills: {
    load: {
      extraDirs: [
        "/Users/seungsoohan/Projects/g2b-bid-monitor/openclaw/skills",
      ],
    },
  },
  env: {
    G2B_MONITOR_URL: "https://g2b-bid-monitor.vercel.app",
    DOWNLOAD_DIR: "~/Downloads/openclaw/g2b",
  },
}
```

### 4. 스킬 로드 확인
```bash
openclaw skills list
# → g2b-bid-apply 가 목록에 나와야 함
```

안 나오면 `skills.load.extraDirs` 경로가 정확한지 확인.

### 5. Playwright 브라우저 설치
OpenClaw의 브라우저 도구가 Playwright를 쓰므로 Chromium이 필요합니다:
```bash
npx playwright install chromium
```

## 사용법

### 기본 플로우
1. Vercel에서 새 STRONG_FIT 공고가 Slack 알림으로 옴
2. 알림에서 공고번호 확인 (예: `R26BK01458478`)
3. Slack 채널에서:
   ```
   @openclaw 공고 R26BK01458478 지원 준비
   ```
4. OpenClaw가 Chromium 창을 띄우고 나라장터 공고 상세 페이지로 이동
5. Slack에 "공동인증서 로그인 해주세요. 완료되면 'done' 입력" 메시지
6. 사용자가 인증서 PIN 입력 후 `done` 답장
7. OpenClaw가 입찰 참가 버튼 클릭 → 6종 문서 업로드 → 금액 입력
8. Slack에 최종 보고 + 스크린샷 + "⚠️ 제출 버튼은 직접 눌러주세요"
9. 사용자가 브라우저로 가서 최종 검토 후 제출

### 트러블슈팅

**"제안서가 생성되지 않았습니다" 에러**
→ 먼저 Vercel 대시보드에서 해당 공고의 파이프라인을 실행하거나,
```bash
curl -X POST "https://g2b-bid-monitor.vercel.app/api/bids/{id}/proposals"
```

**업로드 슬롯을 못 찾음**
→ OpenClaw가 Slack에 스냅샷을 붙여넣고 확인 요청함. 답장으로 지시해주면 다시 진행.

**나라장터가 차단**
→ 브라우저 자동화 감지. User-Agent 변경 필요:
```bash
openclaw config set browser.userAgent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
```

## API 엔드포인트 레퍼런스 (Vercel 쪽)

OpenClaw가 사용하는 g2b-bid-monitor API:

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/api/bids/{id}` | 공고 상세 |
| POST | `/api/bids/{id}/pipeline` | 체크리스트+가격+전략 생성 |
| GET | `/api/bids/{id}/proposals` | 생성된 제안서 목록 (JSON) |
| GET | `/api/bids/{id}/proposals?format=zip` | **6종 .docx zip 다운로드** |
| POST | `/api/bids/{id}/proposals` | 6종 제안서 생성 (~4분) |
| GET | `/api/bids/{id}/proposals/{docType}?format=docx` | 단일 문서 .docx |
| POST | `/api/bids/{id}/proposals/{docType}` | 단일 문서 재생성 |

`{docType}` 은 `technical | execution | personnel | company | track_record | pricing`.
