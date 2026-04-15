import OpenAI from 'openai';
import { ENV } from './config';
import { getBidById, saveProposal, Bid } from './db';

export const DOC_TYPES = {
  technical: '기술제안서',
  execution: '사업수행계획서',
  personnel: '투입인력 현황표',
  company: '회사소개서',
  track_record: '수행실적표',
  pricing: '가격제안서',
} as const;

export type DocType = keyof typeof DOC_TYPES;

const COMPANY_PROFILE = `## 주식회사 바틀 (Bottle Inc.)
- 설립: 2018년 4월, 경기도 성남시 판교 테크노밸리
- 인력: 6명
  - 대표 겸 PM/풀스택 개발자 (서울대 MBA, 대우조선해양 출신) 1명
  - 데이터 아키텍처 1명
  - 데이터 수집/분석 1명
  - NLP 데이터 가공 1명
  - QA 1명
  - 데이터 설계/기획 1명
- 핵심 기술: 감성 AI/NLP 엔진, LLM 서비스 개발, 텍스트 임베딩, AI 아바타, Gemini 멀티이미지 생성
- 기술 스택: React, Node.js, FastAPI, Python, PostgreSQL, Claude API, Gemini API, Prometheus, Grafana, ELK
- 자격: 소프트웨어사업자, 소기업, KISA 원장상, TIPS 선정, 누적 투자 5억

## 수행 실적
1. D'Live 설비관리 시스템 현대화 — ASP→React/Node.js 마이그레이션, 업무시간 70% 단축
2. 마리아병원 CRM — 3개 병원 고객관리 시스템
3. 골프피플/티마트 골프예약 플랫폼 — 10만 회원, KISA 원장상 수상
4. 사람인HS CRM 개발
5. INK Chat 감성 AI 챗봇 — TIPS R&D, TTA 검증 (감성분류 99%, 의도파악 100%, 개체명인식 90%)
6. 보험비서(BoBi) B2B SaaS — 금감원/KLIA/KNIA 크롤링, CODEF API 연동
7. 통비서(TongBiseo) AI 통화후 CRM — STT 기반 자동 고객관리
8. 2026 데이터바우처 공급기업 선정
9. CINOS INSITE ITIM 통합모니터링 제안 (1.7억원)
10. ARGUS SKY 공항 위협 인텔리전스 플랫폼`;

function buildBidContext(bid: Bid): string {
  const price = bid.presmpt_prce ? `${bid.presmpt_prce.toLocaleString()}원` : '미정';
  const scores = bid.scores_json || {};
  const keyPoints = bid.key_points_json || [];
  const risks = bid.risks_json || [];

  return `## 입찰공고 정보
- 공고명: ${bid.bid_ntce_nm}
- 공고번호: ${bid.bid_ntce_no}
- 공고기관: ${bid.ntce_instt_nm || '-'}
- 수요기관: ${bid.dminstt_nm || '-'}
- 추정가격: ${price}
- 계약방법: ${bid.cntrct_mthd_nm || '-'}
- 입찰방식: ${bid.bid_mthd_nm || '-'}
- 공고종류: ${bid.ntce_kind_nm || '-'}
- 용역구분: ${bid.srvc_div_nm || '-'}
- 마감일: ${bid.bid_clse_dt || '-'}

## AI 분석 결과
- 적합도: ${bid.total_score}점 (${bid.recommendation})
- 요약: ${bid.summary || '-'}
- 강점: ${(keyPoints as string[]).join(', ') || '-'}
- 리스크: ${(risks as string[]).join(', ') || '-'}
- 전략: ${bid.suggested_strategy || '-'}
- 세부점수: 기술${scores.techFit || 0} 규모${scores.scaleFit || 0} 실적${scores.trackRecordFit || 0} 경쟁력${scores.competitiveEdge || 0} 수주${scores.winProbability || 0}`;
}

const DOC_PROMPTS: Record<DocType, string> = {
  technical: `당신은 공공 입찰 제안서 전문 작성자입니다. 아래 공고 정보와 회사 프로필을 바탕으로 **기술제안서**를 마크다운으로 작성하세요.

포함할 내용:
1. 사업 이해도 — 공고의 목적과 배경 분석, 핵심 요구사항 도출
2. 기술 접근 방법 — 시스템 아키텍처, 핵심 기술 스택, 개발 방법론 (Agile/Waterfall)
3. 차별화 기술 — 바틀만의 AI/NLP 역량을 활용한 차별화 포인트
4. 시스템 구성도 — 텍스트로 표현한 시스템 아키텍처 (프론트/백/DB/외부연동)
5. 기술적 고려사항 — 보안, 성능, 확장성, 접근성
6. 유지보수 방안 — 운영 이관, 안정화, SLA

형식: 마크다운. 표, 목록 적극 활용. 구체적이고 실무적으로 작성. 15페이지 분량.`,

  execution: `당신은 공공 입찰 제안서 전문 작성자입니다. 아래 공고 정보와 회사 프로필을 바탕으로 **사업수행계획서**를 마크다운으로 작성하세요.

포함할 내용:
1. 사업 추진 체계 — 조직 구성, PM/PL 역할, 발주기관 협업 체계
2. WBS (Work Breakdown Structure) — 단계별 주요 활동을 표로 정리
3. 일정 계획 — 착수~완료 마일스톤 (추정가격/규모 기반으로 3~6개월 추정)
4. 단계별 산출물 — 분석/설계/구현/테스트/이관 단계별 산출물 목록
5. 품질 관리 방안 — 코드리뷰, 테스트 전략, 결함 관리
6. 위험 관리 — 리스크 식별 및 대응 방안 (AI 분석 리스크 반영)
7. 보안 관리 — 개인정보보호, 보안 개발, 취약점 점검

형식: 마크다운. 간트차트는 표로 표현. 10페이지 분량.`,

  personnel: `당신은 공공 입찰 제안서 전문 작성자입니다. 아래 공고 정보와 회사 프로필을 바탕으로 **투입인력 현황표**를 마크다운으로 작성하세요.

바틀 인력 6명을 공고에 맞게 배치하세요:
- 대표 겸 PM/풀스택 (서울대 MBA, 15년차) — PM/PL 역할
- 데이터 아키텍처 (10년차) — 설계/DB 역할
- 데이터 수집/분석 (8년차) — 백엔드/데이터 역할
- NLP 데이터 가공 (7년차) — AI/NLP 역할
- QA (5년차) — 테스트/품질 역할
- 데이터 설계/기획 (6년차) — 기획/문서 역할

포함할 내용:
1. 투입인력 총괄표 — 성명(가명), 직급, 담당업무, 투입기간, 투입률(M/M)
2. 인력별 약력 — 학력, 경력, 자격증, 주요 수행 프로젝트
3. 투입 일정표 — 월별 투입률을 표로 정리

형식: 마크다운 표 위주. 5페이지 분량.`,

  company: `당신은 공공 입찰 제안서 전문 작성자입니다. 아래 회사 프로필을 바탕으로 **회사소개서**를 마크다운으로 작성하세요.

포함할 내용:
1. 회사 개요 — 상호, 대표, 설립일, 소재지, 사업 영역
2. 비전 및 미션 — AI/NLP 전문 기업으로서의 비전
3. 핵심 역량 — 기술 역량, 인적 역량, 사업 역량
4. 기술 스택 — 보유 기술 상세 (프론트/백/AI/인프라)
5. 주요 인증 및 수상 — KISA 원장상, TIPS, 소프트웨어사업자 등
6. 조직 구성 — 6명 전문 인력 소개
7. 핵심 수행 실적 — 10개 프로젝트 요약

형식: 마크다운. 깔끔하고 전문적인 톤. 8페이지 분량.`,

  track_record: `당신은 공공 입찰 제안서 전문 작성자입니다. 아래 공고 정보와 회사 프로필을 바탕으로 **수행실적표**를 마크다운으로 작성하세요.

10개 수행실적을 공고와의 유사성 순으로 정렬하고 상세 기술하세요.

각 실적 포함 내용:
- 프로젝트명, 발주처, 수행기간, 사업금액
- 사업 개요 및 주요 기능
- 적용 기술 및 아키텍처
- 성과 및 효과 (정량적 수치 포함)
- 본 공고와의 유사점

마지막에 '유사 실적 요약표'를 마크다운 표로 정리.

형식: 마크다운. 7페이지 분량.`,

  pricing: `당신은 공공 입찰 가격제안 전문가입니다. 아래 공고 정보와 회사 프로필을 바탕으로 **가격제안서**를 마크다운으로 작성하세요.

추정가격을 기반으로 소프트웨어 사업 대가 기준(SW기술자 등급별 노임단가 기준)에 맞춰 산출하세요.

포함할 내용:
1. 총 사업비 요약표
2. 인건비 산출 내역 — 등급별 투입인력 × 투입M/M × 노임단가
   - 특급기술자: 월 약 600만원
   - 고급기술자: 월 약 500만원
   - 중급기술자: 월 약 420만원
   - 초급기술자: 월 약 330만원
3. 직접경비 — 여비, 재료비, 장비사용료 등
4. 제경비 — 인건비의 110~120%
5. 기술료 — (인건비+제경비)의 20~40%
6. 부가가치세 — 10%

금액은 추정가격의 85~95% 범위 내에서 경쟁력 있게 산출.

형식: 마크다운 표 위주. 5페이지 분량.`,
};

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export async function generateProposal(bidId: number, docType: DocType): Promise<string> {
  const bid = await getBidById(bidId);
  if (!bid) throw new Error('공고를 찾을 수 없습니다');

  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: ENV.OPENROUTER_API_KEY,
  });

  const systemPrompt = DOC_PROMPTS[docType];
  const userPrompt = `${COMPANY_PROFILE}\n\n${buildBidContext(bid)}\n\n위 정보를 바탕으로 ${DOC_TYPES[docType]}를 작성해주세요. 마크다운 형식으로, 제목은 "# ${DOC_TYPES[docType]}"로 시작하세요.`;

  const response = await client.chat.completions.create({
    model: 'anthropic/claude-sonnet-4',
    max_tokens: 4096,
    temperature: 0.4,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content || '';
  if (!content.trim()) throw new Error('AI 응답이 비어 있습니다');

  return content;
}

export interface GenerationResult {
  docType: DocType;
  label: string;
  success: boolean;
  error?: string;
}

export interface GenerateAllOptions {
  onLog?: (line: string) => void | Promise<void>;
}

export async function generateAllProposals(
  bidId: number,
  options: GenerateAllOptions = {}
): Promise<GenerationResult[]> {
  const log = async (line: string) => {
    console.log(line);
    if (options.onLog) {
      try { await options.onLog(line); } catch {}
    }
  };

  const results: GenerationResult[] = [];
  const bid = await getBidById(bidId);
  if (!bid) throw new Error('공고를 찾을 수 없습니다');

  const entries = Object.entries(DOC_TYPES);
  let idx = 0;
  for (const [docType, label] of entries) {
    idx++;
    try {
      await log(`  📝 [${idx}/${entries.length}] ${label} 생성 중...`);
      const content = await generateProposal(bidId, docType as DocType);
      await saveProposal(bid.bid_ntce_no, docType, content);
      results.push({ docType: docType as DocType, label, success: true });
      await log(`  ✅ [${idx}/${entries.length}] ${label} 완료 (${content.length.toLocaleString()}자)`);
      await sleep(1000);
    } catch (error: any) {
      results.push({ docType: docType as DocType, label, success: false, error: error.message });
      await log(`  ❌ [${idx}/${entries.length}] ${label} 실패: ${error.message}`);
    }
  }

  return results;
}
