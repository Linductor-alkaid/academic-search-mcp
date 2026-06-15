/**
 * Normalize a paper ID into a form Semantic Scholar Graph API accepts.
 *
 * Accepted inputs (all case-insensitive on prefix):
 *   - bare arXiv ID:           "2402.18294"           → "ARXIV:2402.18294"
 *   - "ARXIV:2402.18294"        → "ARXIV:2402.18294"  (canonicalized)
 *   - bare DOI:                 "10.1109/IROS.2024"  → "DOI:10.1109/IROS.2024"
 *   - "DOI:10.1109/IROS.2024"   → "DOI:10.1109/IROS.2024"
 *   - Semantic Scholar paperId: 40-char hex           → unchanged
 *
 * Throws ApiError(400) when the input cannot be classified.
 */

import { ApiError } from "../utils/retry.js";

const ARXIV_BARE = /^\d{4}\.\d{4,5}(v\d+)?$/;
const DOI_BARE = /^10\.\d{4,9}\/\S+$/;
const S2_PAPER_ID = /^[0-9a-f]{40}$/i;

export function normalizePaperId(raw: string): string {
  const id = raw.trim();
  if (!id) {
    throw new ApiError(
      "论文 ID 不能为空",
      400,
      "请提供以下之一：裸 arXiv ID（如 2402.18294）、裸 DOI（如 10.1109/...）、ARXIV:xxx、DOI:10.xxx、或 40 位 S2 paperId"
    );
  }

  const upper = id.toUpperCase();

  // Already has a recognized prefix → canonicalize case, strip whitespace
  if (upper.startsWith("ARXIV:")) {
    const rest = id.slice(6).trim();
    if (!ARXIV_BARE.test(rest)) {
      throw new ApiError(
        `ARXIV: 前缀后的部分不是合法 arXiv ID：${rest}`,
        400,
        "arXiv ID 格式：YYMM.NNNNN(vN)，例如 ARXIV:2402.18294"
      );
    }
    return `ARXIV:${rest}`;
  }

  if (upper.startsWith("DOI:")) {
    const rest = id.slice(4).trim();
    if (!DOI_BARE.test(rest)) {
      throw new ApiError(
        `DOI: 前缀后的部分不是合法 DOI：${rest}`,
        400,
        "DOI 格式：10.<registrant>/<suffix>，例如 DOI:10.1109/IROS.2024.10801451"
      );
    }
    return `DOI:${rest}`;
  }

  // Bare arXiv ID
  if (ARXIV_BARE.test(id)) {
    return `ARXIV:${id}`;
  }

  // Bare DOI
  if (DOI_BARE.test(id)) {
    return `DOI:${id}`;
  }

  // Bare Semantic Scholar paperId (40 hex chars)
  if (S2_PAPER_ID.test(id)) {
    return id;
  }

  throw new ApiError(
    `无法识别的论文 ID 格式：${raw}`,
    400,
    "支持的格式：\n" +
      "  - 裸 arXiv ID：2402.18294\n" +
      "  - 裸 DOI：10.1109/IROS.2024.10801451\n" +
      "  - ARXIV:2402.18294\n" +
      "  - DOI:10.1109/IROS.2024.10801451\n" +
      "  - 40 位 S2 paperId（hex）"
  );
}