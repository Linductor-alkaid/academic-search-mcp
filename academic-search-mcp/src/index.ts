import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ZodRawShape } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { searchPapersSchema, handleSearchPapers } from "./tools/searchPapers.js";
import { getPaperDetailsSchema, handleGetPaperDetails } from "./tools/getPaperDetails.js";
import { searchArxivSchema, handleSearchArxiv } from "./tools/searchArxiv.js";

const server = new McpServer({
  name: "academic-search-mcp",
  version: "1.0.0",
});

/**
 * Registers a tool without triggering TS2589 deep instantiation.
 * The handler is typed loosely here; each handler file enforces its own types.
 */
function registerTool(
  name: string,
  description: string,
  inputSchema: ZodRawShape,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any) => Promise<CallToolResult>
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool(name, { description, inputSchema }, handler);
}

registerTool(
  "search_papers",
  "搜索学术论文（Semantic Scholar），支持关键词、年份范围、研究领域过滤",
  searchPapersSchema,
  handleSearchPapers
);

registerTool(
  "get_paper_details",
  "获取论文完整详情，包含参考文献和被引论文列表（Semantic Scholar）",
  getPaperDetailsSchema,
  handleGetPaperDetails
);

registerTool(
  "search_arxiv_papers",
  "搜索 arXiv 预印本论文，支持分类过滤（cs.RO, cs.LG, eess.SY 等）",
  searchArxivSchema,
  handleSearchArxiv
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

