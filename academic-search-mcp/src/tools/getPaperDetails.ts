import { z } from "zod";
import { getPaper } from "../clients/semanticScholar.js";
import { formatResponse, formatError } from "../utils/format.js";
import { ApiError } from "../utils/retry.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const getPaperDetailsSchema = {
  paper_id: z
    .string()
    .describe(
      "论文 ID。支持：裸 arXiv ID（如 2402.18294）、裸 DOI（如 10.1109/...）、ARXIV:xxx、DOI:10.xxx、或 40 位 S2 paperId。自动归一化。"
    ),
  include_references: z
    .boolean()
    .default(true)
    .describe("是否包含参考文献列表（默认 true；设 false 可大幅缩减响应）"),
  include_citations: z
    .boolean()
    .default(true)
    .describe("是否包含被引论文列表（默认 true；设 false 可大幅缩减响应）"),
  references_limit: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(10)
    .describe("参考文献最大条数（0-100，默认 10）"),
  citations_limit: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(10)
    .describe("被引论文最大条数（0-100，默认 10）"),
};

export async function handleGetPaperDetails(args: {
  paper_id: string;
  include_references: boolean;
  include_citations: boolean;
  references_limit: number;
  citations_limit: number;
}): Promise<CallToolResult> {
  try {
    // S2 returns references+citations together; we still request them but slice locally.
    const p = await getPaper(args.paper_id);

    const doi = p.externalIds?.DOI ?? "无";
    const arxiv = p.externalIds?.ArXiv ?? "无";
    const pdf = p.openAccessPdf?.url ?? "无";

    const refLines = args.include_references
      ? (p.references ?? [])
          .slice(0, args.references_limit)
          .map((r, i) => {
            const rid = r.externalIds?.DOI
              ? `DOI:${r.externalIds.DOI}`
              : r.externalIds?.ArXiv
              ? `ARXIV:${r.externalIds.ArXiv}`
              : r.paperId;
            return `${i + 1}. **${r.title}** (${r.year ?? "?"}) — 引用数: ${r.citationCount} | ID: ${rid}`;
          })
      : ["（已省略）"];

    const citLines = args.include_citations
      ? (p.citations ?? [])
          .slice(0, args.citations_limit)
          .map((c, i) => {
            const cid = c.externalIds?.DOI
              ? `DOI:${c.externalIds.DOI}`
              : c.externalIds?.ArXiv
              ? `ARXIV:${c.externalIds.ArXiv}`
              : c.paperId;
            return `${i + 1}. **${c.title}** (${c.year ?? "?"}) — 引用数: ${c.citationCount} | ID: ${cid}`;
          })
      : ["（已省略）"];

    const refHeader = `### 参考文献（前 ${args.include_references ? args.references_limit : 0} 条）`;
    const citHeader = `### 被引论文（前 ${args.include_citations ? args.citations_limit : 0} 条，按引用数排序）`;

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
      `${refHeader}\n${refLines.join("\n") || "无"}`,
      "",
      `${citHeader}\n${citLines.join("\n") || "无"}`,
    ].join("\n");

    return formatResponse(markdown, p, { maxJsonChars: 50_000 });
  } catch (err) {
    if (err instanceof ApiError) {
      return formatError(err.message, err.suggestion);
    }
    return formatError(`获取论文详情失败：${(err as Error).message}`);
  }
}
