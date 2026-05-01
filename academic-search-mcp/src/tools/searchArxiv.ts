import { z } from "zod";
import { searchArxiv } from "../clients/arxiv.js";
import { formatResponse, formatError } from "../utils/format.js";
import { ApiError } from "../utils/retry.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const searchArxivSchema = {
  query: z.string().describe("搜索关键词"),
  categories: z
    .array(z.string())
    .default(["cs.RO"])
    .describe("arXiv 分类列表，如 ['cs.RO', 'cs.LG', 'eess.SY']"),
  max_results: z.number().int().min(1).max(100).default(20).describe("最大返回数量"),
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("起始日期，格式 YYYY-MM-DD"),
};

export async function handleSearchArxiv(args: {
  query: string;
  categories: string[];
  max_results: number;
  date_from?: string;
}): Promise<CallToolResult> {
  try {
    const papers = await searchArxiv({
      query: args.query,
      categories: args.categories,
      maxResults: args.max_results,
      dateFrom: args.date_from,
    });

    if (papers.length === 0) {
      return formatError("未找到相关 arXiv 论文，请尝试调整关键词或分类");
    }

    const lines = papers.map((p, i) =>
      [
        `### ${i + 1}. ${p.title}`,
        `**作者：** ${p.authors.join(", ")}`,
        `**发布日期：** ${p.publishedDate} | **分类：** ${p.categories.join(", ")}`,
        `**arXiv ID：** ${p.arxivId}`,
        `**PDF：** ${p.pdfUrl}`,
        `**摘要：** ${p.abstract.slice(0, 300)}${p.abstract.length > 300 ? "..." : ""}`,
      ].join("\n")
    );

    const markdown = `## arXiv 搜索结果：${args.query}\n\n分类：${args.categories.join(", ")} | 共 ${papers.length} 篇\n\n${lines.join("\n\n---\n\n")}`;
    return formatResponse(markdown, { total: papers.length, papers });
  } catch (err) {
    if (err instanceof ApiError) {
      return formatError(err.message, err.suggestion);
    }
    return formatError(`arXiv 搜索失败：${(err as Error).message}`);
  }
}
