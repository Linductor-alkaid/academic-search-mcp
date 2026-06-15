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
    .describe(
      "arXiv 分类列表，默认 ['cs.RO']。跨分类示例: ['cs.RO', 'cs.LG', 'eess.SY']"
    ),
  max_results: z.number().int().min(1).max(100).default(20).describe("最大返回数量"),
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("起始日期，格式 YYYY-MM-DD"),
  abstract_chars: z
    .number()
    .int()
    .min(0)
    .max(5000)
    .default(300)
    .describe("每条论文摘要最大字符数（0 表示不截断，默认 300）"),
};

export async function handleSearchArxiv(args: {
  query: string;
  categories: string[];
  max_results: number;
  date_from?: string;
  abstract_chars: number;
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

    const lines = papers.map((p, i) => {
      const absSlice =
        args.abstract_chars > 0
          ? p.abstract.slice(0, args.abstract_chars) +
            (p.abstract.length > args.abstract_chars ? "..." : "")
          : p.abstract;
      return [
        `### ${i + 1}. ${p.title}`,
        `**作者：** ${p.authors.join(", ")}`,
        `**发布日期：** ${p.publishedDate} | **分类：** ${p.categories.join(", ")}`,
        `**arXiv ID：** ${p.arxivId}`,
        `**PDF：** ${p.pdfUrl}`,
        `**摘要：** ${absSlice}`,
      ].join("\n");
    });

    const markdown = `## arXiv 搜索结果：${args.query}\n\n分类：${args.categories.join(", ")} | 共 ${papers.length} 篇\n\n${lines.join("\n\n---\n\n")}`;
    return formatResponse(markdown, { total: papers.length, papers });
  } catch (err) {
    if (err instanceof ApiError) {
      return formatError(err.message, err.suggestion);
    }
    return formatError(`arXiv 搜索失败：${(err as Error).message}`);
  }
}
