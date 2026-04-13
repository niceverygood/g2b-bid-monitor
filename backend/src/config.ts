import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  G2B_API_KEY: process.env.G2B_API_KEY || '',
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL || '',
  PORT: parseInt(process.env.PORT || '3001'),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  // Slack에서 제안서 보기 링크가 가리킬 백엔드 공개 URL (배포 환경에서는 실제 도메인으로 설정)
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || '3001'}`,
};

// 바틀 맞춤 검색 키워드
export const SEARCH_KEYWORDS = [
  '인공지능', 'AI', '자연어처리', 'NLP', '챗봇', 'LLM', '생성형',
  '데이터분석', '빅데이터', '데이터 가공', '데이터 수집',
  '소프트웨어 개발', '웹시스템', '플랫폼 구축', '정보시스템',
  '홈페이지 구축', '앱 개발', '시스템 고도화', '시스템 유지관리',
  'CRM', '고객관리', '보험', '의료정보', 'EMR', '콘텐츠 제작',
];

// 분석 없이 바로 제외할 키워드 (건설/토목/비IT 등)
export const EXCLUDE_KEYWORDS = [
  '공사', '건설', '토목', '건축', '조경', '설비공사', '전기공사',
  '도로', '교량', '상하수도', '철거', '보수공사', '방수', '도장',
  '측량', '감리', '안전진단',
  '경비', '청소', '주차', '세탁', '조리', '택배',
  '물품납품', '사무용품', '가구납품',
  '배관', '냉난방공사', '소방공사', '엘리베이터',
  '인쇄', '출판', '제본',
  '차량구매', '차량임차', '차량리스',
  '경호', '시설경비',
];

export const SCORE_THRESHOLD = {
  SLACK_NOTIFY: 65,
  STRONG_FIT: 80,
  GOOD_FIT: 60,
  MODERATE_FIT: 40,
};

export const G2B_API = {
  BASE_URL: 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService',
  SERVC_LIST: '/getBidPblancListInfoServc',
  ROWS_PER_PAGE: 100,
  RETRY_COUNT: 3,
  CALL_INTERVAL_MS: 1200,
};
