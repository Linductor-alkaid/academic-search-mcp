import { z } from "zod";
import { searchPapers as s2Search } from "../clients/semanticScholar.js";
import { formatResponse, formatError } from "../utils/format.js";
import { ApiError } from "../utils/retry.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const searchPapersSchema = {
  query: z.string().describe("搜索关键词，如 'robot manipulation reinforcement learning'"),
  year_start: z.number().int().min(1900).max(2100).optional().describe("起始年份"),
  year_end: z.number().int().min(1900).max(2100).optional().describe("结束年份"),
  fields_of_study: z.string().default("Computer Science").describe("研究领域"),
  limit: z.number().int().min(1).max(100).default(20).describe("返回数量（1-100）"),
};

export async function handleSearchPapers(args: {
  query: string;
  year_start?: number;
  year_end?: number;
  fields_of_study: string;
  limit: number;
}): Promise<CallToolResult> {
  try {
    const papers = await s2Search({
      query: args.query,
      yearStart: args.year_start,
      yearEnd: args.year_end,
      fieldsOfStudy: args.fields_of_study,
      limit: args.limit,
    });

    if (papers.length === 0) {
      return formatError("未找到相关论文，请尝试调整关键词或放宽年份范围");
    }

    const lines = papers.map((p, i) => {
      const doi = p.externalIds?.DOI ? `DOI: ${p.externalIds.DOI}` : "";
      const arxiv = p.externalIds?.ArXiv ? `arXiv: ${p.externalIds.ArXiv}` : "";
      const ids = [doi, arxiv].filter(Boolean).join(" | ");
      return [
        `### ${i + 1}. ${p.title}`,
        `**作者：** ${p.authors.map((a) => a.name).join(", ")}`,
        `**年份：** ${p.year ?? "未知"} | **引用数：** ${p.citationCount} | **高影响引用：** ${p.influentialCitationCount}`,
        `**期刊/会议：** ${p.venue || "未知"}`,
        ids ? `**ID：** ${ids}` : "",
        p.abstract ? `**摘要：** ${p.abstract.slice(0, 300)}${p.abstract.length > 300 ? "..." : ""}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    });

    const markdown = `## 搜索结果：${args.query}\n\n共找到 ${papers.length} 篇论文\n\n${lines.join("\n\n---\n\n")}`;
    return formatResponse(markdown, { total: papers.length, papers });
  } catch (err) {
    if (err instanceof ApiError) {
      return formatError(err.message, err.suggestion);
    }
    return formatError(`搜索失败：${(err as Error).message}`);
  }
}
