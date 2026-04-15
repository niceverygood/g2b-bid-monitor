# 자체 호스팅 첨부파일 워커
#
# 기능:
#   1) Supabase 에서 NEEDS_WORKER 상태 엔트리 폴링
#   2) g2b 첨부파일 다운로드
#      - OpenAPI 직링크로 안 되는 공고는 Playwright + g2b 세션으로 AES 우회
#   3) HWP 5.x 는 hwp5txt (pyhwp) 로 텍스트 추출
#   4) Supabase Storage 에 파일 업로드 + attachment_text 업데이트

# Playwright 공식 이미지는 Chromium + 시스템 의존성 포함
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

# Python 런타임 + pyhwp (hwp5txt CLI 제공)
# pyhwp 는 HWP 5.x 텍스트 추출 전용 — 변환 없이 stdout 으로 바로 뽑음 (가장 빠름)
# Jammy(22.04) 는 PEP 668 을 강제하므로 전용 venv 에 설치한다.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
  && python3 -m venv /opt/pyhwp-venv \
  && /opt/pyhwp-venv/bin/pip install --no-cache-dir pyhwp \
  && apt-get clean && rm -rf /var/lib/apt/lists/* \
  && /opt/pyhwp-venv/bin/hwp5txt --version

ENV HWP5TXT_BIN=/opt/pyhwp-venv/bin/hwp5txt

WORKDIR /app

# deps 먼저 복사 (캐시 재활용)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# 소스
COPY tsconfig.json ./
COPY src ./src

RUN npx tsc -p .

# 헬스체크 기본값: 5분마다 1회 폴링
ENV POLL_INTERVAL_MS=300000
ENV MIN_SCORE=70

CMD ["node", "dist/index.js"]
