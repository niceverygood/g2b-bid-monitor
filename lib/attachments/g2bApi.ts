/**
 * g2b 첨부파일 메타 API 래퍼
 *
 * 엔드포인트: POST /fs/fsc/fscb/UntyAtchFile/selectUntyAtchFileList.do
 *
 * 이 API는 세션 쿠키 없이도 호출 가능한 공개 리소스지만,
 * WAF/봇 차단이 있어서 일반적인 브라우저 UA 헤더를 붙여야 한다.
 *
 * 실제 바이너리 다운로드는 AES 암호화된 k01 파라미터가 필요해서
 * 여기서는 메타만 가져오고, 실제 파일은 Playwright 워커에서 처리한다.
 *
 * 페이로드 구조는 브라우저 XHR 후킹으로 캡처한 실제 값을 사용.
 */

const G2B_BASE = 'https://www.g2b.go.kr';
const ENDPOINT = '/fs/fsc/fscb/UntyAtchFile/selectUntyAtchFileList.do';

// 입찰공고 첨부파일 카테고리 코드 (공고문/규격서/제안요청서/도면/기타)
const DEFAULT_ATCH_FILE_KND_CDS = '첨020297,첨020417,첨020298,첨020299,첨020109';

export interface G2bAttachmentFile {
  atchFileSqno: number;
  fileName: string;
  fileSize: number;
  atchFileKndCd: string;
  atchFileKndNm?: string;
  // 원본 응답에 포함된 k01 생성에 필요한 필드들 (나중에 워커에서 사용)
  raw: Record<string, unknown>;
}

export interface FetchAttachmentsOptions {
  untyAtchFileNo: string;
  bsneClsfCd?: string; // 기본 "업130026" — 입찰공고
  tblNm?: string; // 기본 "PBANC_BID_PBANC"
  colNm?: string; // 기본 "ITEM_PBANC_UNTY_ATCH_FILE_NO"
  atchFileKndCds?: string;
}

/**
 * 통합 첨부파일번호로 파일 목록 메타를 가져온다.
 *
 * @param opts.untyAtchFileNo - UUID 형태의 첨부파일 그룹 번호
 * @returns 파일 메타 배열 (바이너리 X)
 */
export async function fetchAttachmentList(
  opts: FetchAttachmentsOptions
): Promise<G2bAttachmentFile[]> {
  const body = {
    dlUntyAtchFileM: {
      untyAtchFileNo: opts.untyAtchFileNo,
      atchFileSqnos: '',
      bsnePath: 'PNPE',
      bsneClsfCd: opts.bsneClsfCd ?? '업130026',
      tblNm: opts.tblNm ?? 'PBANC_BID_PBANC',
      colNm: opts.colNm ?? 'ITEM_PBANC_UNTY_ATCH_FILE_NO',
      webPathUse: 'N',
      isScanEnabled: false,
      atchFileKndCds: opts.atchFileKndCds ?? DEFAULT_ATCH_FILE_KND_CDS,
      kuploadId: 'wq_uuid_4242_kupload_holder_upload',
      viewMode: 'view',
    },
  };

  const res = await fetch(`${G2B_BASE}${ENDPOINT}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Referer: `${G2B_BASE}/`,
      Origin: G2B_BASE,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(
      `g2b attachment list failed: ${res.status} ${res.statusText}`
    );
  }

  const json = (await res.json()) as {
    dlUntyAtchFileL?: Array<Record<string, unknown>>;
    resultCode?: string;
    resultMessage?: string;
  };

  if (!json.dlUntyAtchFileL) {
    return [];
  }

  return json.dlUntyAtchFileL.map((row) => ({
    atchFileSqno: Number(row.atchFileSqno ?? row.ATCH_FILE_SQNO ?? 0),
    fileName: String(row.fileName ?? row.FILE_NM ?? row.orgnlFileNm ?? ''),
    fileSize: Number(row.fileSize ?? row.FILE_SIZE ?? 0),
    atchFileKndCd: String(row.atchFileKndCd ?? row.ATCH_FILE_KND_CD ?? ''),
    atchFileKndNm: row.atchFileKndNm
      ? String(row.atchFileKndNm)
      : undefined,
    raw: row,
  }));
}

/**
 * 파일 확장자로부터 파서 종류를 추론한다.
 */
export function detectParser(
  fileName: string
): 'pdf' | 'hwpx' | 'hwp' | 'xlsx' | 'docx' | 'txt' | 'unknown' {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.hwpx')) return 'hwpx';
  if (lower.endsWith('.hwp')) return 'hwp';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'docx';
  if (lower.endsWith('.txt')) return 'txt';
  return 'unknown';
}
