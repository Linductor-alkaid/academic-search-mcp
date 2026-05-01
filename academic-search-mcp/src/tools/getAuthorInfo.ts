import { z } from "zod";
import { getAuthorById, searchAuthor } from "../clients/semanticScholar.js";
import { formatResponse, formatError } from "../utils/format.js";
import { ApiError } from "../utils/retry.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const getAuthorInfoSchema = {
  author_name: z.string().optional().describe("作者姓名（与 author_id 二选一）"),
  author_id: z.string().optional().describe("Semantic Scholar 作者 ID（与 author_name 二选一）"),
};

export async function handleGetAuthorInfo(args: {
  author_name?: string;
  author_id?: string;
}): Promise<CallToolResult> {
  if (!args.author_name && !args.author_id) {
    return formatError("请提供 author_name 或 author_id 其中之一");
  }

  try {
    const author = args.author_id
      ? await getAuthorById(args.author_id)
      : await searchAuthor(args.author_name!);

    if (!author) {
      return formatError(`未找到作者：${args.author_name}，请尝试使用全名或英文名`);
    }

    const topPapers = (author.papers ?? [])
      .sort((a, b) => b.citationCount - a.citationCount)
      .slice(0, 10);

    const paperLines = topPapers.map((p, i) => {
      const id = p.externalIds?.DOI
        ? `DOI:${p.externalIds.DOI}`
        : p.externalIds?.ArXiv
        ? `ARXIV:${p.externalIds.ArXiv}`
        : "";
      return `${i + 1}. **${p.title}** (${p.year ?? "?"}) — 引用数: ${p.citationCount}${id ? ` | ${id}` : ""}`;
    });

    const markdown = [
      `## 作者信息：${author.name}`,
      `**机构：** ${author.affiliations?.join(", ") || "未知"}`,
      `**h-index：** ${author.hIndex} | **总引用数：** ${author.citationCount} | **论文数：** ${author.paperCount}`,
      "",
      `### 代表作（按引用数排序，前10篇）`,
      paperLines.join("\n") || "无",
    ].join("\n");

    return formatResponse(markdown, author);
  } catch (err) {
    if (err instanceof ApiError) {
      return formatError(err.message, err.suggestion);
    }
    return formatError(`获取作者信息失败：${(err as Error).message}`);
  }
}
