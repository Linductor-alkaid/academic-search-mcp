import { z } from "zod";
import { getAuthorById, searchAuthor, type S2AuthorDetail } from "../clients/semanticScholar.js";
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
    // Resolve to a single author (by ID directly, or by name search).
    let author: S2AuthorDetail | null = null;
    let candidates: S2AuthorDetail[] = [];

    if (args.author_id) {
      author = await getAuthorById(args.author_id);
    } else {
      candidates = await searchAuthor(args.author_name!, 5);
      author = candidates[0] ?? null;
    }

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

    // Disambiguation warning: more than one candidate OR the resolved author's
    // name differs from the query (common with Chinese names).
    const nameMismatch =
      args.author_name &&
      author.name.localeCompare(args.author_name, undefined, { sensitivity: "accent" }) !== 0;
    const showCandidates = candidates.length > 1;
    const needsDisambig = nameMismatch || showCandidates;

    const candidateBlock = showCandidates
      ? [
          "### 搜索候选（按匹配度排序，请用 author_id 重试以精确指定）",
          ...candidates.map((c, i) => {
            const aff = c.affiliations?.join(", ") || "未知机构";
            return `${i + 1}. **${c.name}** — h-index: ${c.hIndex}, 引用: ${c.citationCount}, 论文: ${c.paperCount} | ${aff} | author_id: \`${c.authorId}\``;
          }),
        ].join("\n")
      : "";

    const disambigWarning = needsDisambig
      ? `\n\n> **注意：** ${nameMismatch ? `匹配作者名 "${author.name}" 与查询 "${args.author_name}" 不完全一致（中文/拼音常见歧义）。` : ""}${showCandidates ? `共找到 ${candidates.length} 个候选作者（已自动选择首位）。请检查上方候选列表，必要时用 \`author_id\` 参数精确指定。` : ""}`
      : "";

    const markdown = [
      `## 作者信息：${author.name}`,
      `**机构：** ${author.affiliations?.join(", ") || "未知"}`,
      `**h-index：** ${author.hIndex} | **总引用数：** ${author.citationCount} | **论文数：** ${author.paperCount}`,
      `**author_id：** \`${author.authorId}\``,
      "",
      `### 代表作（按引用数排序，前10篇）`,
      paperLines.join("\n") || "无",
      candidateBlock,
      disambigWarning,
    ]
      .filter(Boolean)
      .join("\n");

    return formatResponse(markdown, author);
  } catch (err) {
    if (err instanceof ApiError) {
      return formatError(err.message, err.suggestion);
    }
    return formatError(`获取作者信息失败：${(err as Error).message}`);
  }
}
