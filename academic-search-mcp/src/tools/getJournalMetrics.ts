import { z } from "zod";
import { searchVenue } from "../clients/openAlex.js";
import { formatResponse, formatError } from "../utils/format.js";
import { ApiError } from "../utils/retry.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const getJournalMetricsSchema = {
  venue_name: z
    .string()
    .describe("期刊或会议名称，如 'ICRA', 'Nature Robotics', 'IEEE Transactions on Robotics'"),
};

export async function handleGetJournalMetrics(args: {
  venue_name: string;
}): Promise<CallToolResult> {
  try {
    const venues = await searchVenue(args.venue_name);

    if (venues.length === 0) {
      return formatError(`未找到期刊/会议：${args.venue_name}，请尝试使用全称或缩写`);
    }

    const noKeyWarning =
      !process.env.OPENALEX_API_KEY
        ? "\n\n> **提示：** 未配置 OPENALEX_API_KEY，每日仅 100 credits。请前往 openalex.org/settings/api 获取免费 key。"
        : "";

    const lines = venues.map((v, i) => {
      const isConference = v.type === "conference";
      const citednessLine = isConference
        ? `**2yr mean citedness：** N/A（会议无此指标，参考 h-index / 总引用数）`
        : `**2yr mean citedness：** ${v.twoYearMeanCitedness?.toFixed(3) ?? "无数据"}（非期刊影响因子 IF）`;

      return [
        `### ${i + 1}. ${v.displayName}`,
        `**类型：** ${v.type ?? "未知"}${isConference ? " ⚠️ 会议" : ""}`,
        citednessLine,
        `**h-index：** ${v.hIndex ?? "无数据"}`,
        `**收录论文数：** ${v.worksCount.toLocaleString()}`,
        `**总被引次数：** ${v.citedByCount.toLocaleString()}`,
        v.homepageUrl ? `**主页：** ${v.homepageUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    });

    const markdown = `## 期刊/会议指标：${args.venue_name}\n\n${lines.join("\n\n---\n\n")}${noKeyWarning}`;
    return formatResponse(markdown, venues);
  } catch (err) {
    if (err instanceof ApiError) {
      return formatError(err.message, err.suggestion);
    }
    return formatError(`获取期刊指标失败：${(err as Error).message}`);
  }
}
