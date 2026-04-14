import OpenAI from 'openai';
import { ENV } from './config';
import { getBidById, Bid } from './db';

export interface PriceBreakdownItem {
  category: string;
  amount: number;
  note: string;
}

export interface PriceAdvice {
  bid_ntce_no: string;
  estimated_price: number;
  recommended_bid_price: number;
  bid_rate: number;
  price_breakdown: PriceBreakdownItem[];
  strategy: string;
  risk_note: string;
  created_at: string;
}

const PRICE_PROMPT = `당신은 한국 공공입찰 가격 전문 컨설턴트입니다. SW사업 대가산정 기준에 따라 투찰가격을 추천합니다.

## 2026 SW기술자 등급별 노임단가 (월 기준, 참고값)
- 특급기술자: 6,500,000원
- 고급기술자: 5,400,000원
- 중급기술자: 4,500,000원
- 초급기술자: 3,500,000원

## 대가산정 구조
- 인건비 = Σ(등급별 단가 × 투입M/M)
- 직접경비 = 인건비의 10~15% (여비, 재료비, 장비사용료 등)
- 제경비 = 인건비의 110~120%
- 기술료 = (인건비 + 제경비)의 20~40%
- 부가세 = (인건비 + 직접경비 + 제경비 + 기술료)의 10%

## 투찰 전략
- 협상에 의한 계약: 기술점수가 중요하므로 가격은 예정가의 88~95%
- 적격심사: 가격점수 비중이 높으므로 예정가의 87.745% (공식에 의한 최적값)
- 최저가: 가능한 낮게, 하지만 투입 가능 최소 인력 기준으로

## 바틀 투입 가능 인력 (6명)
- PM/PL (특급): 1명
- 데이터 아키텍트 (고급): 1명
- 백엔드/데이터 (중급): 1명
- NLP/AI (중급): 1명
- QA (초급): 1명
- 기획/문서 (초급): 1명

반드시 아래 JSON만 출력. 다른 텍스트 금지.
{
  "estimated_price": 추정가격(숫자),
  "recommended_bid_price": 추천투찰가(숫자),
  "bid_rate": 투찰률(예: 89.5),
  "price_breakdown": [
    {"category": "인건비", "amount": 숫자, "note": "산출근거 50자"},
    {"category": "직접경비", "amount": 숫자, "note": "산출근거"},
    {"category": "제경비", "amount": 숫자, "note": "산출근거"},
    {"category": "기술료", "amount": 숫자, "note": "산출근거"},
    {"category": "부가가치세", "amount": 숫자, "note": "10%"}
  ],
  "strategy": "투찰 전략 설명 100자 이내",
  "risk_note": "가격 관련 리스크 50자 이내"
}`;

function buildPriceUserPrompt(bid: Bid): string {
  const price = bid.presmpt_prce ? `${bid.presmpt_prce.toLocaleString()}원` : '미정';
  return `아래 입찰공고의 투찰 가격을 추천해주세요.

공고명: ${bid.bid_ntce_nm}
공고번호: ${bid.bid_ntce_no}
추정가격: ${price}
계약방법: ${bid.cntrct_mthd_nm || '-'}
입찰방식: ${bid.bid_mthd_nm || '-'}
공고종류: ${bid.ntce_kind_nm || '-'}
용역구분: ${bid.srvc_div_nm || '-'}
마감일: ${bid.bid_clse_dt || '-'}

${bid.presmpt_prce ? `추정가격 ${bid.presmpt_prce.toLocaleString()}원을 기준으로 산출하세요.` : '추정가격이 미정이므로, 공고명으로 유사 사업 규모를 추정하여 산출하세요. 바틀 6명 기준 3~6개월 사업으로 가정합니다.'}`;
}

function extractJSON(text: string): any {
  try { return JSON.parse(text); } catch {}
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block) { try { return JSON.parse(block[1].trim()); } catch {} }
  const obj = text.match(/\{[\s\S]*"recommended_bid_price"[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch {} }
  throw new Error('가격 추천 JSON 추출 실패');
}

export async function generatePriceAdvice(bidId: number): Promise<PriceAdvice> {
  const bid = await getBidById(bidId);
  if (!bid) throw new Error('공고를 찾을 수 없습니다');

  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: ENV.OPENROUTER_API_KEY,
  });

  const response = await client.chat.completions.create({
    model: 'anthropic/claude-sonnet-4',
    max_tokens: 2048,
    temperature: 0.2,
    messages: [
      { role: 'system', content: PRICE_PROMPT },
      { role: 'user', content: buildPriceUserPrompt(bid) },
    ],
  });

  const content = response.choices[0]?.message?.content || '';
  const parsed = extractJSON(content);

  return {
    bid_ntce_no: bid.bid_ntce_no,
    estimated_price: parsed.estimated_price || bid.presmpt_prce || 0,
    recommended_bid_price: parsed.recommended_bid_price || 0,
    bid_rate: parsed.bid_rate || 0,
    price_breakdown: parsed.price_breakdown || [],
    strategy: parsed.strategy || '',
    risk_note: parsed.risk_note || '',
    created_at: new Date().toISOString(),
  };
}
