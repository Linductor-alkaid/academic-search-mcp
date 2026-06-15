import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const DEFAULT_MAX_JSON_CHARS = 50_000;

export interface FormatResponseOptions {
  /**
   * Two-stage truncation, applied in order:
   *   1. `maxStringFieldChars` (default 2000): any string field longer than
   *      this in the data tree is replaced with `<truncated: N chars total>`.
   *      This is the primary guard — it bounds the worst-case JSON size from
   *      long abstracts / references titles regardless of structure.
   *   2. `maxJsonChars` (default 50000): final safety-net on the serialized
   *      JSON block length. Usually a no-op because stage 1 already bounded
   *      it, but defends against pathological cases (millions of small
   *      fields).
   * Set either to 0 to disable that stage.
   */
  maxJsonChars?: number;
  /**
   * @see maxJsonChars for semantics.
   */
  maxStringFieldChars?: number;
}

function truncateStringsDeep(value: unknown, cap: number): unknown {
  if (cap <= 0) return value;
  if (typeof value === "string") {
    return value.length > cap
      ? `<truncated: ${value.length} chars total>`
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => truncateStringsDeep(v, cap));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = truncateStringsDeep(v, cap);
    }
    return out;
  }
  return value;
}

export function formatResponse(
  markdown: string,
  data: unknown,
  options: FormatResponseOptions = {}
): CallToolResult {
  const maxJsonChars = options.maxJsonChars ?? DEFAULT_MAX_JSON_CHARS;
  const maxStringFieldChars = options.maxStringFieldChars ?? 2000;

  const safeData = truncateStringsDeep(data, maxStringFieldChars);
  let jsonBlock = "```json\n" + JSON.stringify(safeData, null, 2) + "\n```";
  let truncationNote = "";

  if (maxJsonChars > 0 && jsonBlock.length > maxJsonChars) {
    const head = jsonBlock.slice(0, maxJsonChars);
    const dropped = jsonBlock.length - maxJsonChars;
    jsonBlock = head + `\n... <truncated ${dropped} chars>`;
    truncationNote = `\n\n> **提示：** JSON block 已截断（>${maxJsonChars} chars）。如需完整数据请通过具体字段查询（参考 references / citations 可独立调 \`get_citations\`）。`;
  }

  return {
    content: [
      { type: "text", text: markdown + truncationNote },
      { type: "text", text: jsonBlock },
    ],
  };
}

export function formatError(message: string, suggestion?: string): CallToolResult {
  const text = suggestion ? `${message}\n\n**建议：** ${suggestion}` : message;
  return {
    content: [{ type: "text", text: `**错误：** ${text}` }],
    isError: true,
  };
}
