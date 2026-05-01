import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function formatResponse(markdown: string, data: unknown): CallToolResult {
  return {
    content: [
      { type: "text", text: markdown },
      { type: "text", text: "```json\n" + JSON.stringify(data, null, 2) + "\n```" },
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
