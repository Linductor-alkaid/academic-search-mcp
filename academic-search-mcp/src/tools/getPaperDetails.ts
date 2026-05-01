import { z } from "zod";
import { getPaper } from "../clients/semanticScholar.js";
import { formatResponse, formatError } from "../utils/format.js";
import { ApiError } from "../utils/retry.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const getPaperDetailsSchema = {
  paper_id: z
    .string()
    .describe("论文 ID：Semantic Scholar ID、DOI:10.xxx 或 ARXIV:2301.xxxxx"),
};

export async function handleGetPaperDetails(args: {
  paper_id: string;
}): Promise<CallToolResult> {
  try {
    const p = await getPaper(args.paper_id);

    const doi = p.externalIds?.DOI ?? "无";
    const arxiv = p.externalIds?.ArXiv ?? "无";
    const pdf = p.openAccessPdf?.url ?? "无";

    const refLines = (p.references ?? []).slice(0, 20).map((r, i) => {
      const rid = r.externalIds?.DOI
        ? `DOI:${r.externalIds.DOI}`
        : r.externalIds?.ArXiv
        ? `ARXIV:${r.externalIds.ArXiv}`
        : r.paperId;
      return `${i + 1}. **${r.title}** (${r.year ?? "?"}) — 引用数: ${r.citationCount} | ID: ${rid}`;
    });

    const citLines = (p.citations ?? []).slice(0, 20).map((c, i) => {
      const cid = c.externalIds?.DOI
        ? `DOI:${c.externalIds.DOI}`
        : c.externalIds?.ArXiv
        ? `ARXIV:${c.externalIds.ArXiv}`
        : c.paperId;
      return `${i + 1}. **${c.title}** (${c.year ?? "?"}) — 引用数: ${c.citationCount} | ID: ${cid}`;
    });

    const markdown = [
      `## ${p.title}`,
      `**作者：** ${p.authors.map((a) => a.name).join(", ")}`,
      `**年份：** ${p.year ?? "未知"} | **期刊/会议：** ${p.venue || "未知"}`,
      `**引用数：** ${p.citationCount} | **高影响引用：** ${p.influentialCitationCount}`,
      `**DOI：** ${doi} | **arXiv：** ${arxiv}`,
      `**PDF：** ${pdf}`,
      "",
      `### 摘要\n${p.abstract ?? "无摘要"}`,
      "",
      `### 参考文献（前20条）\n${refLines.join("\n") || "无"}`,
      "",
      `### 被引论文（前20条，按引用数排序）\n${citLines.join("\n") || "无"}`,
    ].join("\n");

    return formatResponse(markdown, p);
  } catch (err) {
    if (err instanceof ApiError) {
      return formatError(err.message, err.suggestion);
    }
    return formatError(`获取论文详情失败：${(err as Error).message}`);
  }
}
