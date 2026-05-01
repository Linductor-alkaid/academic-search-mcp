# Academic Search MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local stdio MCP Server with 6 tools for searching academic papers in Robotics and RL, backed by Semantic Scholar, arXiv, and OpenAlex APIs.

**Architecture:** Modular TypeScript project with separate API client layer (`src/clients/`), tool handler layer (`src/tools/`), and shared utilities (`src/utils/`). The server entry point (`src/index.ts`) initializes `McpServer` from `@modelcontextprotocol/sdk` v1.x and registers all tools.

**Tech Stack:** TypeScript 5.x, Node 18+, `@modelcontextprotocol/sdk` v1.x, `zod` v3, native `fetch`, `fast-xml-parser` for arXiv Atom feed.

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/index.ts` | McpServer init, StdioServerTransport, register all 6 tools |
| `src/utils/retry.ts` | `fetchWithRetry(fn, maxRetries)` — exponential backoff for 429/5xx |
| `src/utils/format.ts` | `formatResponse(markdown, data)` — dual text block output |
| `src/clients/semanticScholar.ts` | S2 API: searchPapers, getPaper, getCitations, getAuthor, searchAuthor |
| `src/clients/arxiv.ts` | arXiv Atom feed fetch + XML parse |
| `src/clients/openAlex.ts` | OpenAlex /sources search |
| `src/tools/searchPapers.ts` | Tool handler + zod schema for search_papers |
| `src/tools/getPaperDetails.ts` | Tool handler + zod schema for get_paper_details |
| `src/tools/searchArxiv.ts` | Tool handler + zod schema for search_arxiv_papers |
| `src/tools/getJournalMetrics.ts` | Tool handler + zod schema for get_journal_metrics |
| `src/tools/getAuthorInfo.ts` | Tool handler + zod schema for get_author_info |
| `src/tools/getCitations.ts` | Tool handler + zod schema for get_citations |
| `claude_desktop_config.json` | Claude Desktop MCP config snippet |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `academic-search-mcp/package.json`
- Create: `academic-search-mcp/tsconfig.json`
- Create: `academic-search-mcp/src/index.ts` (stub)

- [ ] **Step 1: Create project directory and package.json**

```bash
cd G:/myproject/papersearcher-mcp
mkdir academic-search-mcp && cd academic-search-mcp
```

Create `package.json`:

```json
{
  "name": "academic-search-mcp",
  "version": "1.0.0",
  "description": "MCP Server for academic paper search (Robotics + RL)",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/index.js",
    "inspector": "npx @modelcontextprotocol/inspector node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.12.0",
    "fast-xml-parser": "4.5.3",
    "zod": "3.24.4"
  },
  "devDependencies": {
    "@types/node": "22.15.3",
    "typescript": "5.8.3"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create src directory structure**

```bash
mkdir -p src/clients src/tools src/utils
```

- [ ] **Step 4: Create stub src/index.ts**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "academic-search-mcp",
  version: "1.0.0",
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Verify build compiles**

```bash
npm run build
```

Expected: `dist/index.js` created, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git init
git add package.json tsconfig.json src/index.ts
git commit -m "feat: scaffold academic-search-mcp project"
```

---

## Task 2: Utils — retry.ts

**Files:**
- Create: `src/utils/retry.ts`

- [ ] **Step 1: Create src/utils/retry.ts**

```typescript
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly suggestion?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export async function fetchWithRetry(
  fn: () => Promise<Response>,
  maxRetries = 3
): Promise<Response> {
  let lastError: ApiError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
    }

    const res = await fn();

    if (res.ok) return res;

    if (!RETRYABLE.has(res.status) || attempt === maxRetries) {
      const body = await res.text().catch(() => "");
      const suggestion =
        res.status === 429
          ? "已重试3次仍被限速，建议配置 S2_API_KEY 环境变量以提升速率限制"
          : res.status === 404
          ? "资源未找到，请检查 ID 格式（S2ID / DOI:10.xxx / ARXIV:2301.xxxxx）"
          : undefined;
      lastError = new ApiError(
        `HTTP ${res.status}: ${body.slice(0, 200)}`,
        res.status,
        suggestion
      );
      if (!RETRYABLE.has(res.status)) throw lastError;
    } else {
      lastError = new ApiError(`HTTP ${res.status} (attempt ${attempt + 1}/${maxRetries + 1})`, res.status);
    }
  }

  throw lastError!;
}

export async function fetchJson<T>(
  url: string,
  headers: Record<string, string> = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetchWithRetry(() =>
      fetch(url, { headers, signal: controller.signal })
    );
    return res.json() as Promise<T>;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new ApiError("请求超时（10s），请检查网络连接", 0);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/utils/retry.ts
git commit -m "feat: add fetchWithRetry with exponential backoff"
```

---

## Task 3: Utils — format.ts

**Files:**
- Create: `src/utils/format.ts`

- [ ] **Step 1: Create src/utils/format.ts**

```typescript
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
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/utils/format.ts
git commit -m "feat: add formatResponse and formatError utilities"
```

---

## Task 4: API Client — semanticScholar.ts

**Files:**
- Create: `src/clients/semanticScholar.ts`

- [ ] **Step 1: Create src/clients/semanticScholar.ts**

```typescript
import { fetchJson, ApiError } from "../utils/retry.js";

const BASE = "https://api.semanticscholar.org/graph/v1";

function s2Headers(): Record<string, string> {
  const key = process.env.S2_API_KEY;
  return key ? { "x-api-key": key } : {};
}

const PAPER_FIELDS =
  "title,authors,year,abstract,citationCount,influentialCitationCount,venue,externalIds,openAccessPdf";

const PAPER_DETAIL_FIELDS =
  "title,authors,year,abstract,citationCount,influentialCitationCount,venue,externalIds,openAccessPdf,references.title,references.authors,references.year,references.citationCount,references.externalIds,citations.title,citations.authors,citations.year,citations.citationCount,citations.externalIds";

export interface S2Author {
  authorId: string;
  name: string;
}

export interface S2Paper {
  paperId: string;
  title: string;
  authors: S2Author[];
  year: number | null;
  abstract: string | null;
  citationCount: number;
  influentialCitationCount: number;
  venue: string | null;
  externalIds: Record<string, string> | null;
  openAccessPdf: { url: string } | null;
}

export interface S2PaperDetail extends S2Paper {
  references: S2Paper[];
  citations: S2Paper[];
}

export interface S2AuthorDetail {
  authorId: string;
  name: string;
  hIndex: number;
  citationCount: number;
  paperCount: number;
  affiliations: string[];
  papers: S2Paper[];
}

export async function searchPapers(params: {
  query: string;
  yearStart?: number;
  yearEnd?: number;
  fieldsOfStudy?: string;
  limit?: number;
}): Promise<S2Paper[]> {
  const { query, yearStart, yearEnd, fieldsOfStudy = "Computer Science", limit = 20 } = params;
  const url = new URL(`${BASE}/paper/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("fields", PAPER_FIELDS);
  url.searchParams.set("limit", String(Math.min(limit, 100)));
  url.searchParams.set("fieldsOfStudy", fieldsOfStudy);
  if (yearStart || yearEnd) {
    url.searchParams.set("year", `${yearStart ?? ""}-${yearEnd ?? ""}`);
  }

  const data = await fetchJson<{ data: S2Paper[]; total: number }>(
    url.toString(),
    s2Headers()
  );
  return data.data ?? [];
}

export async function getPaper(paperId: string): Promise<S2PaperDetail> {
  const url = `${BASE}/paper/${encodeURIComponent(paperId)}?fields=${PAPER_DETAIL_FIELDS}&limit=20`;
  return fetchJson<S2PaperDetail>(url, s2Headers());
}

export async function getPaperCitations(
  paperId: string,
  limit = 20
): Promise<S2Paper[]> {
  const url = `${BASE}/paper/${encodeURIComponent(paperId)}/citations?fields=${PAPER_FIELDS}&limit=${limit}`;
  const data = await fetchJson<{ data: Array<{ citingPaper: S2Paper }> }>(
    url,
    s2Headers()
  );
  return (data.data ?? [])
    .map((d) => d.citingPaper)
    .sort((a, b) => b.citationCount - a.citationCount);
}

export async function getAuthorById(authorId: string): Promise<S2AuthorDetail> {
  const fields = "name,hIndex,citationCount,paperCount,affiliations,papers.title,papers.year,papers.citationCount,papers.externalIds";
  const url = `${BASE}/author/${encodeURIComponent(authorId)}?fields=${fields}`;
  return fetchJson<S2AuthorDetail>(url, s2Headers());
}

export async function searchAuthor(name: string): Promise<S2AuthorDetail | null> {
  const url = new URL(`${BASE}/author/search`);
  url.searchParams.set("query", name);
  url.searchParams.set("fields", "name,hIndex,citationCount,paperCount,affiliations,papers.title,papers.year,papers.citationCount,papers.externalIds");
  url.searchParams.set("limit", "1");

  const data = await fetchJson<{ data: S2AuthorDetail[] }>(url.toString(), s2Headers());
  return data.data?.[0] ?? null;
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/clients/semanticScholar.ts
git commit -m "feat: add Semantic Scholar API client"
```

---

## Task 5: API Client — arxiv.ts

**Files:**
- Create: `src/clients/arxiv.ts`

- [ ] **Step 1: Create src/clients/arxiv.ts**

```typescript
import { XMLParser } from "fast-xml-parser";
import { ApiError } from "../utils/retry.js";

const BASE = "http://export.arxiv.org/api/query";

export interface ArxivPaper {
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  publishedDate: string;
  updatedDate: string;
  pdfUrl: string;
  categories: string[];
}

function parseAtomDate(dateStr: string): string {
  return dateStr.split("T")[0];
}

function extractArxivId(idUrl: string): string {
  return idUrl.replace("http://arxiv.org/abs/", "").replace("https://arxiv.org/abs/", "");
}

export async function searchArxiv(params: {
  query: string;
  categories?: string[];
  maxResults?: number;
  dateFrom?: string;
}): Promise<ArxivPaper[]> {
  const { query, categories = ["cs.RO"], maxResults = 20, dateFrom } = params;

  const catFilter = categories.map((c) => `cat:${c}`).join(" OR ");
  const dateFilter = dateFrom
    ? ` AND submittedDate:[${dateFrom.replace(/-/g, "")}000000 TO 99991231235959]`
    : "";
  const searchQuery = `(${query}) AND (${catFilter})${dateFilter}`;

  const url = new URL(BASE);
  url.searchParams.set("search_query", searchQuery);
  url.searchParams.set("max_results", String(maxResults));
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let text: string;
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) throw new ApiError(`arXiv HTTP ${res.status}`, res.status);
    text = await res.text();
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new ApiError("arXiv 请求超时（10s）", 0);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const parsed = parser.parse(text);
  const feed = parsed?.feed;
  if (!feed) return [];

  const entries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];

  return entries.map((e: Record<string, unknown>) => {
    const id = extractArxivId(String(e.id ?? ""));
    const authors = Array.isArray(e.author)
      ? (e.author as Array<{ name: string }>).map((a) => a.name)
      : e.author
      ? [(e.author as { name: string }).name]
      : [];
    const categories = Array.isArray(e.category)
      ? (e.category as Array<{ "@_term": string }>).map((c) => c["@_term"])
      : e.category
      ? [(e.category as { "@_term": string })["@_term"]]
      : [];

    return {
      arxivId: id,
      title: String(e.title ?? "").trim().replace(/\s+/g, " "),
      authors,
      abstract: String(e.summary ?? "").trim().replace(/\s+/g, " "),
      publishedDate: parseAtomDate(String(e.published ?? "")),
      updatedDate: parseAtomDate(String(e.updated ?? "")),
      pdfUrl: `https://arxiv.org/pdf/${id}`,
      categories,
    };
  });
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/clients/arxiv.ts
git commit -m "feat: add arXiv API client with Atom feed parsing"
```

---

## Task 6: API Client — openAlex.ts

**Files:**
- Create: `src/clients/openAlex.ts`

- [ ] **Step 1: Create src/clients/openAlex.ts**

```typescript
import { fetchJson } from "../utils/retry.js";

const BASE = "https://api.openalex.org";

function openAlexHeaders(): Record<string, string> {
  const key = process.env.OPENALEX_API_KEY;
  const headers: Record<string, string> = {
    "User-Agent": "academic-search-mcp/1.0 (mailto:user@example.com)",
  };
  if (key) headers["Authorization"] = `Bearer ${key}`;
  return headers;
}

export interface VenueMetrics {
  id: string;
  displayName: string;
  impactFactor: number | null;
  hIndex: number | null;
  worksCount: number;
  citedByCount: number;
  homepageUrl: string | null;
  type: string | null;
}

interface OpenAlexSource {
  id: string;
  display_name: string;
  summary_stats?: {
    "2yr_mean_citedness"?: number;
    h_index?: number;
  };
  works_count: number;
  cited_by_count: number;
  homepage_url: string | null;
  type: string | null;
}

export async function searchVenue(venueName: string): Promise<VenueMetrics[]> {
  const url = new URL(`${BASE}/sources`);
  url.searchParams.set("search", venueName);
  url.searchParams.set(
    "select",
    "id,display_name,summary_stats,works_count,cited_by_count,homepage_url,type"
  );
  url.searchParams.set("per-page", "5");

  const noKey = !process.env.OPENALEX_API_KEY;
  const data = await fetchJson<{ results: OpenAlexSource[] }>(
    url.toString(),
    openAlexHeaders()
  );

  const results = (data.results ?? []).map((s) => ({
    id: s.id,
    displayName: s.display_name,
    impactFactor: s.summary_stats?.["2yr_mean_citedness"] ?? null,
    hIndex: s.summary_stats?.h_index ?? null,
    worksCount: s.works_count,
    citedByCount: s.cited_by_count,
    homepageUrl: s.homepage_url,
    type: s.type,
    _noKeyWarning: noKey,
  }));

  return results;
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/clients/openAlex.ts
git commit -m "feat: add OpenAlex API client for venue metrics"
```

---

## Task 7: Tool — search_papers

**Files:**
- Create: `src/tools/searchPapers.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create src/tools/searchPapers.ts**

```typescript
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
```

- [ ] **Step 2: Register tool in src/index.ts**

Replace the stub `src/index.ts` with:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchPapersSchema, handleSearchPapers } from "./tools/searchPapers.js";

const server = new McpServer({
  name: "academic-search-mcp",
  version: "1.0.0",
});

server.tool(
  "search_papers",
  "搜索学术论文（Semantic Scholar），支持关键词、年份范围、研究领域过滤",
  searchPapersSchema,
  handleSearchPapers
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/tools/searchPapers.ts src/index.ts
git commit -m "feat: add search_papers tool"
```

---

## Task 8: Tool — get_paper_details

**Files:**
- Create: `src/tools/getPaperDetails.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create src/tools/getPaperDetails.ts**

```typescript
import { z } from "zod";
import { getPaper } from "../clients/semanticScholar.js";
import { formatResponse, formatError } from "../utils/format.js";
import { ApiError } from "../utils/retry.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const getPaperDetailsSchema = {
  paper_id: z
    .string()
    .describe("论文 ID：Semantic Scholar ID、DOI:10.xxx 或 ARXIV:2301.xxxxx"),
};

export async function handleGetPaperDetails(args: {
  paper_id: string;
}): Promise<CallToolResult> {
  try {
    const p = await getPaper(args.paper_id);

    const doi = p.externalIds?.DOI ?? "无";
    const arxiv = p.externalIds?.ArXiv ?? "无";
    const pdf = p.openAccessPdf?.url ?? "无";

    const refLines = (p.references ?? []).slice(0, 20).map((r, i) => {
      const rid = r.externalIds?.DOI
        ? `DOI:${r.externalIds.DOI}`
        : r.externalIds?.ArXiv
        ? `ARXIV:${r.externalIds.ArXiv}`
        : r.paperId;
      return `${i + 1}. **${r.title}** (${r.year ?? "?"}) — 引用数: ${r.citationCount} | ID: ${rid}`;
    });

    const citLines = (p.citations ?? []).slice(0, 20).map((c, i) => {
      const cid = c.externalIds?.DOI
        ? `DOI:${c.externalIds.DOI}`
        : c.externalIds?.ArXiv
        ? `ARXIV:${c.externalIds.ArXiv}`
        : c.paperId;
      return `${i + 1}. **${c.title}** (${c.year ?? "?"}) — 引用数: ${c.citationCount} | ID: ${cid}`;
    });

    const markdown = [
      `## ${p.title}`,
      `**作者：** ${p.authors.map((a) => a.name).join(", ")}`,
      `**年份：** ${p.year ?? "未知"} | **期刊/会议：** ${p.venue || "未知"}`,
      `**引用数：** ${p.citationCount} | **高影响引用：** ${p.influentialCitationCount}`,
      `**DOI：** ${doi} | **arXiv：** ${arxiv}`,
      `**PDF：** ${pdf}`,
      "",
      `### 摘要\n${p.abstract ?? "无摘要"}`,
      "",
      `### 参考文献（前20条）\n${refLines.join("\n") || "无"}`,
      "",
      `### 被引论文（前20条，按引用数排序）\n${citLines.join("\n") || "无"}`,
    ].join("\n");

    return formatResponse(markdown, p);
  } catch (err) {
    if (err instanceof ApiError) {
      return formatError(err.message, err.suggestion);
    }
    return formatError(`获取论文详情失败：${(err as Error).message}`);
  }
}
```

- [ ] **Step 2: Add import and register in src/index.ts**

Add after the existing import lines:

```typescript
import { getPaperDetailsSchema, handleGetPaperDetails } from "./tools/getPaperDetails.js";
```

Add after the existing `server.tool(...)` call:

```typescript
server.tool(
  "get_paper_details",
  "获取论文完整详情，包含参考文献和被引论文列表（Semantic Scholar）",
  getPaperDetailsSchema,
  handleGetPaperDetails
);
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/tools/getPaperDetails.ts src/index.ts
git commit -m "feat: add get_paper_details tool"
```

---

## Task 9: Tool — search_arxiv_papers

**Files:**
- Create: `src/tools/searchArxiv.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create src/tools/searchArxiv.ts**

```typescript
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
```

- [ ] **Step 2: Add import and register in src/index.ts**

Add import:

```typescript
import { searchArxivSchema, handleSearchArxiv } from "./tools/searchArxiv.js";
```

Add tool registration:

```typescript
server.tool(
  "search_arxiv_papers",
  "搜索 arXiv 预印本论文，支持分类过滤（cs.RO, cs.LG, eess.SY 等）",
  searchArxivSchema,
  handleSearchArxiv
);
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/tools/searchArxiv.ts src/index.ts
git commit -m "feat: add search_arxiv_papers tool"
```

---

## Task 10: Tool — get_journal_metrics

**Files:**
- Create: `src/tools/getJournalMetrics.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create src/tools/getJournalMetrics.ts**

```typescript
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

    const lines = venues.map((v, i) =>
      [
        `### ${i + 1}. ${v.displayName}`,
        `**类型：** ${v.type ?? "未知"}`,
        `**影响因子（2yr）：** ${v.impactFactor?.toFixed(3) ?? "无数据"}`,
        `**h-index：** ${v.hIndex ?? "无数据"}`,
        `**收录论文数：** ${v.worksCount.toLocaleString()}`,
        `**总被引次数：** ${v.citedByCount.toLocaleString()}`,
        v.homepageUrl ? `**主页：** ${v.homepageUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    );

    const markdown = `## 期刊/会议指标：${args.venue_name}\n\n${lines.join("\n\n---\n\n")}${noKeyWarning}`;
    return formatResponse(markdown, venues);
  } catch (err) {
    if (err instanceof ApiError) {
      return formatError(err.message, err.suggestion);
    }
    return formatError(`获取期刊指标失败：${(err as Error).message}`);
  }
}
```

- [ ] **Step 2: Add import and register in src/index.ts**

Add import:

```typescript
import { getJournalMetricsSchema, handleGetJournalMetrics } from "./tools/getJournalMetrics.js";
```

Add tool registration:

```typescript
server.tool(
  "get_journal_metrics",
  "获取期刊或会议的影响因子、h-index 等指标（OpenAlex）",
  getJournalMetricsSchema,
  handleGetJournalMetrics
);
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/tools/getJournalMetrics.ts src/index.ts
git commit -m "feat: add get_journal_metrics tool"
```

---

## Task 11: Tool — get_author_info

**Files:**
- Create: `src/tools/getAuthorInfo.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create src/tools/getAuthorInfo.ts**

```typescript
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
```

- [ ] **Step 2: Add import and register in src/index.ts**

Add import:

```typescript
import { getAuthorInfoSchema, handleGetAuthorInfo } from "./tools/getAuthorInfo.js";
```

Add tool registration:

```typescript
server.tool(
  "get_author_info",
  "获取作者的 h-index、引用数、代表作等信息（Semantic Scholar）",
  getAuthorInfoSchema,
  handleGetAuthorInfo
);
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/tools/getAuthorInfo.ts src/index.ts
git commit -m "feat: add get_author_info tool"
```

---

## Task 12: Tool — get_citations

**Files:**
- Create: `src/tools/getCitations.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create src/tools/getCitations.ts**

```typescript
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
```

- [ ] **Step 2: Add import and register in src/index.ts**

Add import:

```typescript
import { getCitationsSchema, handleGetCitations } from "./tools/getCitations.js";
```

Add tool registration:

```typescript
server.tool(
  "get_citations",
  "获取引用指定论文的论文列表，按引用数降序排列（Semantic Scholar）",
  getCitationsSchema,
  handleGetCitations
);
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/tools/getCitations.ts src/index.ts
git commit -m "feat: add get_citations tool"
```

---

## Task 13: Final Build + Config File

**Files:**
- Verify: `dist/index.js`
- Create: `claude_desktop_config.json`

- [ ] **Step 1: Full build verification**

```bash
npm run build
```

Expected: `dist/` contains `index.js` and all compiled files, zero TypeScript errors.

- [ ] **Step 2: Smoke test with MCP Inspector**

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Expected: Inspector opens, lists 6 tools: `search_papers`, `get_paper_details`, `search_arxiv_papers`, `get_journal_metrics`, `get_author_info`, `get_citations`.

- [ ] **Step 3: Create claude_desktop_config.json**

```json
{
  "mcpServers": {
    "academic-search": {
      "command": "node",
      "args": ["G:/myproject/papersearcher-mcp/academic-search-mcp/dist/index.js"],
      "env": {
        "OPENALEX_API_KEY": "your_openalex_key_here",
        "S2_API_KEY": "your_s2_key_here"
      }
    }
  }
}
```

> **获取 API Keys：**
> - OpenAlex（必须）：https://openalex.org/settings/api — 免费注册，30秒获得
> - Semantic Scholar（可选）：https://www.semanticscholar.org/product/api — 申请后速率提升至 1req/sec

- [ ] **Step 4: Final commit**

```bash
git add dist/ claude_desktop_config.json
git commit -m "feat: complete academic-search-mcp v1.0"
```

---

## Spec Coverage Check

| 规格要求 | 对应任务 |
|---------|---------|
| search_papers 工具 | Task 7 |
| get_paper_details 工具 | Task 8 |
| search_arxiv_papers 工具 | Task 9 |
| get_journal_metrics 工具 | Task 10 |
| get_author_info 工具 | Task 11 |
| get_citations 工具 | Task 12 |
| retry.ts 指数退避 | Task 2 |
| format.ts 双格式输出 | Task 3 |
| Semantic Scholar 客户端 | Task 4 |
| arXiv 客户端 | Task 5 |
| OpenAlex 客户端 | Task 6 |
| 环境变量 API Key | Task 4, 6 |
| npm run build 验证 | Task 13 |
| claude_desktop_config.json | Task 13 |
