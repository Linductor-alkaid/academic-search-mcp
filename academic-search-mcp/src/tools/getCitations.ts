import { z } from "zod";
import { getPaperCitations } from "../clients/semanticScholar.js";
import { formatResponse, formatError } from "../utils/format.js";
import { ApiError } from "../utils/retry.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const getCitationsSchema = {
  paper_id: z
    .string()
    .describe("论文 ID：Semantic Scholar ID、DOI:10.xxx 或 ARXIV:2301.xxxxx"),
  limit: z.number().int().min(1).max(100).default(20).describe("返回数量（1-100）"),
};

export async function handleGetCitations(args: {
  paper_id: string;
  limit: number;
}): Promise<CallToolResult> {
  try {
    const papers = await getPaperCitations(args.paper_id, args.limit);

    if (papers.length === 0) {
      return formatError(`未找到引用该论文的记录，或论文 ID 不存在：${args.paper_id}`);
    }

    const lines = papers.map((p, i) => {
      const doi = p.externalIds?.DOI ? `DOI:${p.externalIds.DOI}` : "";
      const arxiv = p.externalIds?.ArXiv ? `ARXIV:${p.externalIds.ArXiv}` : "";
      const ids = [doi, arxiv].filter(Boolean).join(" | ");
      return [
        `### ${i + 1}. ${p.title}`,
        `**作者：** ${p.authors.map((a) => a.name).join(", ")}`,
        `**年份：** ${p.year ?? "未知"} | **引用数：** ${p.citationCount} | **期刊/会议：** ${p.venue || "未知"}`,
        ids ? `**ID：** ${ids}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    });

    const markdown = `## 引用论文列表（按引用数排序）\n\n论文 ID：${args.paper_id} | 共 ${papers.length} 篇\n\n${lines.join("\n\n---\n\n")}`;
    return formatResponse(markdown, { total: papers.length, papers });
  } catch (err) {
    if (err instanceof ApiError) {
      return formatError(err.message, err.suggestion);
    }
    return formatError(`获取引用列表失败：${(err as Error).message}`);
  }
}
