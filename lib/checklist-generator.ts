import OpenAI from 'openai';
import { ENV } from './config';
import { getBidById, Bid } from './db';
import { buildAttachmentContext } from './attachments/context';

export interface ChecklistItem {
  category: string;
  item: string;
  required: boolean;
  description: string;
  status: 'pending' | 'done';
}

export interface BidChecklist {
  bid_ntce_no: string;
  items: ChecklistItem[];
  deadline_summary: string;
  estimated_prep_days: number;
  created_at: string;
}

const CHECKLIST_PROMPT = `당신은 한국 공공입찰 전문 컨설턴트입니다. 입찰공고를 분석하여 참가에 필요한 체크리스트를 JSON으로 생성해주세요.

## 일반적으로 필요한 입찰 참가 서류
- 입찰참가신청서
- 사업자등록증 사본
- 소프트웨어사업자 신고확인서
- 법인 인감증명서
- 사용인감계 (필요시)
- 납세증명서 (국세/지방세)
- 재무제표 (최근 3년)
- 신용평가등급확인서
- 수행실적증명서 (발주처 확인)
- 기술제안서
- 가격제안서
- 입찰보증금 (입찰금액의 5%)
- 청렴계약이행서약서
- 개인정보처리위탁 동의서

반드시 아래 JSON만 출력. 다른 텍스트 금지.
{
  "items": [
    {
      "category": "자격서류|제안서류|가격서류|행정서류|보증서류",
      "item": "서류명",
      "required": true/false,
      "description": "준비 방법 및 주의사항 50자 이내"
    }
  ],
  "deadline_summary": "마감까지 N일, 핵심 일정 요약 50자 이내",
  "estimated_prep_days": 숫자(준비 예상 소요일)
}`;

function buildChecklistUserPrompt(bid: Bid): string {
  const price = bid.presmpt_prce ? `${bid.presmpt_prce.toLocaleString()}원` : '미정';
  // 체크리스트는 공고문 "제출서류 목록" 섹션만 있으면 충분하므로 30K 정도.
  const attachmentCtx = buildAttachmentContext(bid, 30_000);
  return `아래 입찰공고의 참가에 필요한 서류 체크리스트를 생성해주세요.

공고명: ${bid.bid_ntce_nm}
공고번호: ${bid.bid_ntce_no}
공고기관: ${bid.ntce_instt_nm || '-'}
수요기관: ${bid.dminstt_nm || '-'}
추정가격: ${price}
계약방법: ${bid.cntrct_mthd_nm || '-'}
입찰방식: ${bid.bid_mthd_nm || '-'}
공고종류: ${bid.ntce_kind_nm || '-'}
용역구분: ${bid.srvc_div_nm || '-'}
마감일: ${bid.bid_clse_dt || '-'}${attachmentCtx}

공고의 특성(계약방법, 입찰방식, 용역구분 등)에 따라 필요한 서류를 판단하세요.
첨부된 공고 원문이 있다면 거기 명시된 "제출서류 목록"을 최우선 근거로 사용하세요.
협상에 의한 계약이면 기술제안서가 필수, 적격심사/최저가면 가격 위주 서류가 중요합니다.`;
}

function extractJSON(text: string): any {
  try { return JSON.parse(text); } catch {}
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block) { try { return JSON.parse(block[1].trim()); } catch {} }
  const obj = text.match(/\{[\s\S]*"items"[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch {} }
  throw new Error('체크리스트 JSON 추출 실패');
}

export async function generateChecklist(bidId: number): Promise<BidChecklist> {
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
      { role: 'system', content: CHECKLIST_PROMPT },
      { role: 'user', content: buildChecklistUserPrompt(bid) },
    ],
  });

  const content = response.choices[0]?.message?.content || '';
  const parsed = extractJSON(content);

  return {
    bid_ntce_no: bid.bid_ntce_no,
    items: (parsed.items || []).map((item: any) => ({ ...item, status: 'pending' })),
    deadline_summary: parsed.deadline_summary || '',
    estimated_prep_days: parsed.estimated_prep_days || 7,
    created_at: new Date().toISOString(),
  };
}
