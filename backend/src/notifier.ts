import axios from 'axios';
import { ENV, SCORE_THRESHOLD } from './config';
import { getUnnotifiedBids, markNotified, getStats, Bid } from './db';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildSlackMessage(bid: Bid) {
  const emoji: Record<string, string> = {
    STRONG_FIT: '🔥', GOOD_FIT: '✅', MODERATE_FIT: '🟡',
    WEAK_FIT: '⚪', NOT_FIT: '❌',
  };
  const e = emoji[bid.recommendation] || '❓';

  const price = bid.presmpt_prce
    ? bid.presmpt_prce >= 100000000
      ? `${(bid.presmpt_prce / 100000000).toFixed(1)}억원`
      : `${Math.round(bid.presmpt_prce / 10000).toLocaleString()}만원`
    : '미정';

  const keyPoints = bid.key_points_json ? JSON.parse(bid.key_points_json) : [];
  const risks = bid.risks_json ? JSON.parse(bid.risks_json) : [];

  return {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `${e} ${bid.total_score}점 | ${bid.recommendation}`, emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text:
        `*${bid.bid_ntce_nm}*\n\n` +
        `📋 공고번호: ${bid.bid_ntce_no}\n` +
        `🏛️ 발주: ${bid.ntce_instt_nm || '-'} → ${bid.dminstt_nm || '-'}\n` +
        `💰 추정가격: ${price}\n` +
        `📅 마감: ${bid.bid_clse_dt || '-'}\n` +
        `📝 계약: ${bid.cntrct_mthd_nm || '-'}`,
      }},
      { type: 'section', text: { type: 'mrkdwn', text:
        `💡 *AI 분석:* ${bid.summary || '-'}\n\n` +
        `✅ 강점: ${keyPoints.join(' | ') || '-'}\n` +
        `⚠️ 리스크: ${risks.join(' | ') || '-'}\n` +
        `🎯 전략: ${bid.suggested_strategy || '-'}`,
      }},
      { type: 'divider' },
    ],
  };
}

async function sendSlack(payload: any, retries: number = 2): Promise<boolean> {
  if (!ENV.SLACK_WEBHOOK_URL || ENV.SLACK_WEBHOOK_URL.includes('여기에')) {
    return false;
  }

  for (let i = 0; i <= retries; i++) {
    try {
      await axios.post(ENV.SLACK_WEBHOOK_URL, payload, { timeout: 10000 });
      return true;
    } catch (error: any) {
      console.warn(`  ⚠️ Slack 발송 실패 (${i + 1}/${retries + 1}): ${error.message}`);
      if (i < retries) await sleep(1000);
    }
  }
  return false;
}

export async function notifyNewBids(): Promise<number> {
  const bids = getUnnotifiedBids(SCORE_THRESHOLD.SLACK_NOTIFY);
  let sent = 0;

  for (const bid of bids) {
    const message = buildSlackMessage(bid);
    const ok = await sendSlack(message);
    if (ok) {
      markNotified(bid.bid_ntce_no);
      sent++;
    }
    await sleep(500);
  }

  if (sent > 0) {
    console.log(`📢 Slack 알림 ${sent}/${bids.length}건 발송`);
  }

  return sent;
}

export async function sendDailySummary(): Promise<void> {
  const stats = getStats();
  const today = new Date().toLocaleDateString('ko-KR');

  const payload = {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '📊 바틀 입찰 모니터 — 일일 리포트', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text:
        `📅 ${today}\n\n` +
        `신규 수집: ${stats.todayNew}건 | 적합 공고(65+): ${stats.strongFit + stats.goodFit}건\n` +
        `🔥 STRONG: ${stats.strongFit}건 | ✅ GOOD: ${stats.goodFit}건\n\n` +
        `⏰ 마감 임박 (3일내): ${stats.urgentCount}건\n` +
        `📊 평균 적합도: ${stats.avgScore}점 | 전체: ${stats.total}건`,
      }},
      { type: 'divider' },
    ],
  };

  await sendSlack(payload);
  console.log('📊 일일 요약 발송 완료');
}
