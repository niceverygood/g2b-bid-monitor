// 테스트용 시드 데이터 삽입 스크립트
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '..', '..', 'data', 'g2b.db');
const db = new Database(dbPath);

const bidNtceNo = 'TEST-20260414-001';
const bidNtceNm = '서논술형 평가 자동채점 인공지능 모델 학습용 데이터 구축 시스템 개발';

// 1. 테스트 공고 삽입
db.prepare(`
  INSERT OR REPLACE INTO bids (
    bid_ntce_no, bid_ntce_nm, ntce_instt_nm, dminstt_nm,
    presmpt_prce, cntrct_mthd_nm, bid_mthd_nm, ntce_kind_nm,
    srvc_div_nm, bid_clse_dt, total_score, recommendation,
    summary, key_points_json, risks_json, suggested_strategy,
    scores_json, analyzed_at
  ) VALUES (
    @bid_ntce_no, @bid_ntce_nm, @ntce_instt_nm, @dminstt_nm,
    @presmpt_prce, @cntrct_mthd_nm, @bid_mthd_nm, @ntce_kind_nm,
    @srvc_div_nm, @bid_clse_dt, @total_score, @recommendation,
    @summary, @key_points_json, @risks_json, @suggested_strategy,
    @scores_json, datetime('now','localtime')
  )
`).run({
  bid_ntce_no: bidNtceNo,
  bid_ntce_nm: bidNtceNm,
  ntce_instt_nm: '한국교육과정평가원',
  dminstt_nm: '한국교육과정평가원',
  presmpt_prce: 370000000,
  cntrct_mthd_nm: '제한경쟁',
  bid_mthd_nm: '적격심사',
  ntce_kind_nm: '일반공고',
  srvc_div_nm: '용역',
  bid_clse_dt: '2026-05-21 11:00:00',
  total_score: 85,
  recommendation: 'STRONG_FIT',
  summary: '서논술형 평가 자동채점을 위한 AI 학습 데이터 구축 사업. NLP/LLM 경험 매우 유리.',
  key_points_json: JSON.stringify(['NLP 데이터 가공 전문성', 'LLM 파인튜닝 경험', 'TIPS 감성AI R&D']),
  risks_json: JSON.stringify(['교육 플랫폼 특화 경험 부족']),
  suggested_strategy: "D'Live 시스템 현대화와 골프예약 플랫폼 실적을 강조하여 유지보수 전문성과 사용자 경험 개선 역량 어필",
  scores_json: JSON.stringify({
    techFit: 90, scaleFit: 80, trackRecordFit: 75, competitiveEdge: 85, winProbability: 82,
  }),
});

// 2. 6종 제안서 삽입 (마크다운 샘플)
const docs = [
  { type: 'technical', label: '기술제안서', body: `# 기술제안서

## 1. 사업 이해도

본 사업은 **서논술형 평가 자동채점 AI**를 위한 학습 데이터 구축 사업으로,
한국교육과정평가원의 평가 고도화 전략의 핵심 프로젝트입니다.

### 핵심 요구사항
- 서논술형 답안 데이터 수집 및 정제
- 채점 기준 표준화 및 라벨링
- 모델 학습 및 검증

## 2. 기술 접근 방법

| 구분 | 기술 스택 | 근거 |
|------|----------|------|
| 프론트엔드 | React + TypeScript | 타입 안정성 |
| 백엔드 | FastAPI | AI 서빙 최적화 |
| AI | Claude + Gemini | 고성능 NLP |
| DB | PostgreSQL | 안정성 |

## 3. 차별화 기술

- \`감성 AI/NLP 엔진\` 자체 개발 경험
- INK Chat 감성분류 **99% 정확도** 검증
- 의도파악 **100%**, 개체명인식 **90%**

## 4. 시스템 구성도

\`\`\`
[사용자] → [React] → [API Gateway] → [FastAPI]
                                      ├→ [PostgreSQL]
                                      └→ [Claude API]
\`\`\`
` },
  { type: 'execution', label: '사업수행계획서', body: `# 사업수행계획서

## 1. 사업 추진 체계

- **PM**: 대표 (서울대 MBA, 15년차)
- **PL**: 데이터 아키텍처 (10년차)

## 2. WBS

| 단계 | 주요 활동 | 기간 |
|------|-----------|------|
| 분석 | 요구사항 분석 | 1개월 |
| 설계 | 데이터 스키마 설계 | 1개월 |
| 구현 | AI 모델 학습 | 3개월 |
| 검증 | QA 및 인수 | 1개월 |
` },
  { type: 'personnel', label: '투입인력 현황표', body: `# 투입인력 현황표

## 투입 인력 총괄

| 성명 | 직급 | 담당 업무 | 투입률 |
|------|------|-----------|--------|
| 김PM | 특급 | PM/PL | 100% |
| 이설계 | 고급 | 아키텍처 | 80% |
| 박AI | 고급 | NLP 모델 | 100% |
` },
  { type: 'company', label: '회사소개서', body: `# 회사소개서

## 주식회사 바틀 (Bottle Inc.)

- **설립**: 2018년 4월
- **인력**: 6명
- **핵심 기술**: 감성 AI/NLP, LLM, 텍스트 임베딩

## 주요 수상

- KISA 원장상
- TIPS 선정
- 누적 투자 5억
` },
  { type: 'track_record', label: '수행실적표', body: `# 수행실적표

## 1. INK Chat 감성 AI 챗봇

- **발주처**: TIPS R&D
- **성과**: 감성분류 99%, 의도파악 100%, 개체명인식 90%
- **유사점**: NLP 모델 학습 및 데이터 구축 동일

## 2. 보험비서 (BoBi)

- **발주처**: B2B SaaS
- **성과**: 금감원/KLIA/KNIA 크롤링, CODEF API 연동
` },
  { type: 'pricing', label: '가격제안서', body: `# 가격제안서

## 총 사업비 요약

| 항목 | 금액 |
|------|------|
| 인건비 | 280,000,000원 |
| 직접경비 | 15,000,000원 |
| 제경비 | 30,000,000원 |
| 기술료 | 20,000,000원 |
| 부가세 | 34,500,000원 |
| **합계** | **379,500,000원** |

## 투찰가 87.7% (3.2억원)
` },
];

const insert = db.prepare(`
  INSERT OR REPLACE INTO proposals (bid_id, bid_ntce_no, doc_type, content)
  VALUES ((SELECT id FROM bids WHERE bid_ntce_no = ?), ?, ?, ?)
`);

for (const d of docs) {
  insert.run(bidNtceNo, bidNtceNo, d.type, d.body);
}

const bidRow = db.prepare('SELECT id FROM bids WHERE bid_ntce_no = ?').get(bidNtceNo) as { id: number };
console.log(`✅ 시드 완료: bid_id=${bidRow.id}, bid_ntce_no=${bidNtceNo}`);
console.log(`   제안서 6종 삽입됨`);
console.log(`   인덱스: http://localhost:3001/proposals/${bidNtceNo}`);
console.log(`   단건: http://localhost:3001/proposals/${bidNtceNo}/technical`);
