import OpenAI from 'openai';
import { ENV, EXCLUDE_KEYWORDS } from './config';
import { getUnanalyzedBids, updateAnalysis, Bid } from './db';

interface AnalysisResult {
  total: number;
  analyzed: number;
  excluded: number;
  strongFit: number;
  goodFit: number;
  errors: number;
}

const SYSTEM_PROMPT = `당신은 공공 입찰 컨설턴트입니다. AI/NLP 전문 스타트업 '주식회사 바틀(Bottle Inc.)'에게 입찰공고의 적합도를 분석해 주세요.

## 바틀 회사 프로필
- 설립: 2018년 4월, 경기도 성남시 판교 테크노밸리
- 인력: 6명 (대표 겸 PM/풀스택 1 + 데이터아키텍처 1 + 데이터수집분석 1 + NLP데이터가공 1 + QA 1 + 데이터설계기획 1)
- 대표: 서울대 MBA, 대우조선해양 출신, 풀스택 개발자
- 핵심 기술: 감성 AI/NLP 엔진, LLM 서비스 개발, 텍스트 임베딩, AI 아바타, Gemini 멀티이미지 생성
- 스택: React, Node.js, FastAPI, Python, PostgreSQL, Claude API, Gemini API, Prometheus, Grafana, ELK

## 수행 실적
1. D'Live 설비관리 시스템 현대화 (ASP→React/Node.js, 업무시간 70% 단축)
2. 마리아병원 CRM (3개 병원 고객관리)
3. 골프피플/티마트 골프예약 플랫폼 (10만 회원, KISA 원장상)
4. 사람인HS CRM 개발
5. INK Chat 감성 AI 챗봇 (TIPS R&D, TTA 검증 99%/100%/90%)
6. 보험비서(BoBi) B2B SaaS (금감원/KLIA/KNIA 크롤링, CODEF API)
7. 통비서(TongBiseo) AI 통화후 CRM
8. 2026 데이터바우처 공급기업 선정
9. CINOS INSITE ITIM 통합모니터링 제안 (170M KRW)
10. ARGUS SKY 공항 위협 인텔리전스 플랫폼

## 자격: 소프트웨어사업자, 소기업, KISA 원장상, TIPS 선정, 누적 투자 5억

## 분석 기준
1. 기술 적합도 (30%): 요구 기술 vs 바틀 보유 기술
2. 규모 적합도 (20%): 6인 팀 수행 가능 여부 (1.5억 이하 적합, 3억 이상 부적합)
3. 실적 적합도 (25%): 유사 수행실적 보유 여부
4. 경쟁 우위도 (15%): 바틀만의 차별점
5. 수주 가능성 (10%): 소기업 제한, 참가자격 등

반드시 아래 JSON만 출력. 다른 텍스트 금지.
{
  "totalScore": 0-100,
  "scores": {"techFit":0,"scaleFit":0,"trackRecordFit":0,"competitiveEdge":0,"winProbability":0},
  "recommendation": "STRONG_FIT|GOOD_FIT|MODERATE_FIT|WEAK_FIT|NOT_FIT",
  "summary": "한줄 50자 이내",
  "keyPoints": ["강점1","강점2"],
  "risks": ["리스크1"],
  "suggestedStrategy": "전략 100자 이내"
}`;

function buildUserPrompt(bid: Bid): string {
  const price = bid.presmpt_prce
    ? `${bid.presmpt_prce.toLocaleString()}원`
    : '미정';

  return `아래 입찰공고를 분석해주세요.

공고명: ${bid.bid_ntce_nm}
공고기관: ${bid.ntce_instt_nm || '-'}
수요기관: ${bid.dminstt_nm || '-'}
추정가격: ${price}
계약방법: ${bid.cntrct_mthd_nm || '-'}
입찰방식: ${bid.bid_mthd_nm || '-'}
공고종류: ${bid.ntce_kind_nm || '-'}
용역구분: ${bid.srvc_div_nm || '-'}
마감일: ${bid.bid_clse_dt || '-'}`;
}

function extractJSON(text: string): any {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {}

  // Try extracting from ```json ``` block
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    try {
      return JSON.parse(jsonBlockMatch[1].trim());
    } catch {}
  }

  // Try finding JSON object pattern
  const jsonMatch = text.match(/\{[\s\S]*"totalScore"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {}
  }

  throw new Error('JSON 추출 실패');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function analyzeBids(limit: number = 20): Promise<AnalysisResult> {
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: ENV.OPENROUTER_API_KEY,
  });

  const bids = getUnanalyzedBids(limit);

  const result: AnalysisResult = {
    total: bids.length,
    analyzed: 0,
    excluded: 0,
    strongFit: 0,
    goodFit: 0,
    errors: 0,
  };

  console.log(`🤖 AI 분석 시작: ${bids.length}건`);

  for (const bid of bids) {
    // 제외 키워드 체크
    if (EXCLUDE_KEYWORDS.some(kw => bid.bid_ntce_nm.includes(kw))) {
      updateAnalysis(bid.bid_ntce_no, {
        total_score: 0,
        scores_json: JSON.stringify({ techFit: 0, scaleFit: 0, trackRecordFit: 0, competitiveEdge: 0, winProbability: 0 }),
        recommendation: 'NOT_FIT',
        summary: '건설/토목 관련 공고 - 자동 제외',
        key_points_json: '[]',
        risks_json: '[]',
        suggested_strategy: '',
      });
      result.excluded++;
      console.log(`  ⏭️ 제외: ${bid.bid_ntce_no} - ${bid.bid_ntce_nm.substring(0, 30)}`);
      continue;
    }

    // AI 분석
    let success = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await client.chat.completions.create({
          model: 'anthropic/claude-sonnet-4',
          max_tokens: 1024,
          temperature: 0.3,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(bid) },
          ],
        });

        const content = response.choices[0]?.message?.content || '';
        const parsed = extractJSON(content);

        updateAnalysis(bid.bid_ntce_no, {
          total_score: parsed.totalScore || 0,
          scores_json: JSON.stringify(parsed.scores || {}),
          recommendation: parsed.recommendation || 'MODERATE_FIT',
          summary: parsed.summary || '',
          key_points_json: JSON.stringify(parsed.keyPoints || []),
          risks_json: JSON.stringify(parsed.risks || []),
          suggested_strategy: parsed.suggestedStrategy || '',
        });

        result.analyzed++;
        if (parsed.recommendation === 'STRONG_FIT') result.strongFit++;
        if (parsed.recommendation === 'GOOD_FIT') result.goodFit++;

        console.log(`  ✅ ${bid.bid_ntce_no}: ${parsed.totalScore}점 ${parsed.recommendation} - ${bid.bid_ntce_nm.substring(0, 30)}`);
        success = true;
        break;
      } catch (error: any) {
        console.warn(`  ⚠️ 분석 재시도 (${attempt + 1}/3) ${bid.bid_ntce_no}: ${error.message}`);
        if (attempt < 2) await sleep(2000);
      }
    }

    if (!success) {
      result.errors++;
      console.error(`  ❌ 분석 실패: ${bid.bid_ntce_no} - ${bid.bid_ntce_nm.substring(0, 30)}`);
    }

    await sleep(800);
  }

  console.log(`\n🤖 분석 완료: 분석 ${result.analyzed}건, 제외 ${result.excluded}건, 에러 ${result.errors}건 (STRONG ${result.strongFit}, GOOD ${result.goodFit})`);

  return result;
}
