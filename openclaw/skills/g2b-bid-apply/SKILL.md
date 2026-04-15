---
name: g2b-bid-apply
description: 나라장터(g2b.go.kr) 공고에 바틀 입찰 제안서를 자동으로 준비합니다. 공고 정보 조회, 제안서 6종 다운로드, 나라장터 입찰 참가 양식 입력까지 수행하고 최종 제출 버튼만 사용자가 누르도록 멈춥니다.
---

# 나라장터 입찰 자동 준비

## 목적
바틀 입찰 모니터 서버(https://g2b-bid-monitor.vercel.app) 에서 이미 분석·생성된 공고를 받아 나라장터 전자입찰 시스템에 **제출 직전까지** 자동 입력합니다.

## ⚠️ 반드시 지킬 규칙
1. **최종 '제출' / '입찰서 제출' 버튼은 절대 누르지 않습니다.** 규정상 사용자 본인이 직접 눌러야 합니다.
2. **공동인증서 PIN은 사용자가 직접 입력하도록 멈춥니다.** 사용자 입력을 대신 처리하지 않습니다.
3. **금액은 API가 내려준 `recommended_price`만 사용합니다.** 임의로 숫자를 바꾸거나 추정하지 않습니다.
4. 에러가 나면 멈추고 사용자에게 스크린샷과 함께 보고합니다.

## 실행 조건 (Slack 멘션 또는 슬래시 커맨드)
- `@openclaw 공고 <bid_ntce_no> 지원 준비` — 특정 공고 ID로 실행
- `@openclaw 강적합 공고 지원 준비` — STRONG_FIT 중 북마크된 것 중 가장 최근 공고로 실행

사용자가 위처럼 말하면 아래 단계를 순서대로 실행합니다.

---

## 단계별 실행

### 1. 공고 정보 조회
`http` 도구로 아래 요청을 보내서 공고 메타데이터를 가져옵니다:

```
GET https://g2b-bid-monitor.vercel.app/api/bids/{bid_ntce_no}
```

응답에 `bid_ntce_nm`, `bid_ntce_dtl_url`, `presmpt_prce`, `bid_clse_dt`, `recommended_price`(있으면) 가 들어있습니다. 없으면 서버 쪽 파이프라인이 안 돌았다는 뜻이니 사용자에게 "먼저 파이프라인을 실행하세요" 라고 말하고 종료합니다.

### 2. 제안서 6종 번들 다운로드
```
GET https://g2b-bid-monitor.vercel.app/api/bids/{bid_ntce_no}/proposals?format=zip
```
응답은 zip 바이너리입니다. `~/Downloads/openclaw/g2b/<bid_ntce_no>/` 디렉토리를 만들고 zip을 저장 후 풀어줍니다. 풀린 파일은 6개 .docx:
- `기술제안서_{bid_ntce_no}.docx`
- `사업수행계획서_{bid_ntce_no}.docx`
- `투입인력 현황표_{bid_ntce_no}.docx`
- `회사소개서_{bid_ntce_no}.docx`
- `수행실적표_{bid_ntce_no}.docx`
- `가격제안서_{bid_ntce_no}.docx`

zip이 404면 제안서가 아직 생성 안 된 것이니 API로 먼저 생성합니다:
```
POST https://g2b-bid-monitor.vercel.app/api/bids/{bid_ntce_no}/proposals
```
(응답까지 4~5분 걸립니다. 중간에 타임아웃 나더라도 서버에서는 계속 돕니다. 1분마다 GET 해서 proposals 배열에 6개 다 들어올 때까지 폴링합니다.)

### 3. 나라장터 브라우저 열기
`browser navigate` 로 공고 상세 URL(`bid_ntce_dtl_url`)을 엽니다. URL이 없으면 직접 조립합니다:
`https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo={bid_ntce_no}&bidPbancOrd=000`

### 4. 로그인 대기
나라장터는 공동인증서 로그인이 필요합니다. **절대 인증서 PIN 입력을 대신 시도하지 않습니다.** 대신 Slack 채널에 다음처럼 보냅니다:

> 🔐 나라장터 로그인 화면입니다. 공동인증서 로그인 해주세요. 완료되면 이 메시지에 "done" 으로 답장해 주세요.

사용자가 "done" 이라고 답할 때까지 대기합니다.

### 5. 입찰 참가 버튼 찾기
`browser snapshot` 을 찍고, 결과에서 "입찰참가", "입찰서 제출", "참가신청" 텍스트를 가진 버튼의 ref를 찾습니다. `browser click <ref>` 로 클릭합니다.

### 6. 제안서 첨부
업로드 버튼을 찾습니다(보통 "파일 첨부", "문서 업로드"). 각 문서를 해당 슬롯에 업로드:
- "기술제안서" 슬롯 → `기술제안서_*.docx`
- "사업수행계획서" 슬롯 → `사업수행계획서_*.docx`
- "투입인력" 슬롯 → `투입인력 현황표_*.docx`
- "회사소개" 슬롯 → `회사소개서_*.docx`
- "실적" 슬롯 → `수행실적표_*.docx`
- "가격" 또는 "금액" 슬롯 → `가격제안서_*.docx`

슬롯 이름이 정확히 매칭 안 되면 `browser snapshot` 결과를 Slack에 붙여넣고 사용자에게 "어느 슬롯에 어느 파일을 올려야 하는지" 확인받습니다.

업로드는 `browser upload <filepath>` 로 arm 하고, 파일 선택 버튼을 클릭합니다.

### 7. 입찰 금액 입력
금액 입력란을 찾아서 `browser fill <ref> <recommended_price>` 로 채웁니다. `recommended_price` 가 없으면 **사용자에게 반드시 금액을 물어봅니다.** 추정가(`presmpt_prce`)를 그대로 쓰지 않습니다 — 전략적 할인율이 있을 수 있어서.

### 8. 여기서 멈춥니다 🛑
Slack에 다음처럼 최종 보고합니다:

> ✅ **입찰 준비 완료**
> - 공고: {bid_ntce_nm}
> - 공고번호: {bid_ntce_no}
> - 입력 금액: {recommended_price}원
> - 첨부 파일: 6종 업로드 완료
>
> ⚠️ 브라우저에서 모든 항목을 최종 검토한 후, **직접 '제출' 버튼을 눌러주세요.** 저는 제출하지 않습니다.
> 
> 📸 현재 화면 스냅샷: [스크린샷 첨부]

`browser screenshot --full-page` 으로 전체 화면 캡처해서 Slack에 함께 보냅니다.

---

## 에러 처리
- **HTTP 404 (공고 없음)**: "공고번호 {id} 를 서버에서 찾을 수 없습니다. 수집이 먼저 필요합니다." 로 보고하고 종료.
- **제안서 미생성**: step 2의 POST로 생성 시도. 생성도 실패하면 OpenRouter 크레딧/API 키 확인 요청.
- **브라우저 스냅샷 실패**: iframe 문제일 가능성 높음. `browser snapshot --frame "iframe[name=main]"` 로 재시도.
- **업로드 슬롯을 못 찾음**: 전체 화면 스크린샷을 Slack에 올리고 사용자 확인 요청. 임의로 잘못된 슬롯에 올리지 않음.
- **금액 입력란을 못 찾음**: 마찬가지로 사용자 확인.

## 사용하는 도구
- `http` — Vercel API 호출
- `fs` / `exec` — zip 저장·압축 해제 (`unzip`)
- `browser` — Playwright 기반 나라장터 조작
- `chat.notify` — Slack 채널에 중간/최종 보고

## 환경 변수 (OpenClaw 설정에서)
- `G2B_MONITOR_URL` — 기본 `https://g2b-bid-monitor.vercel.app`
- `DOWNLOAD_DIR` — 기본 `~/Downloads/openclaw/g2b`
