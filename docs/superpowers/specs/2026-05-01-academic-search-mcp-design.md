# Academic Search MCP Server — Design Spec

**Date:** 2026-05-01  
**Project:** `academic-search-mcp`  
**Status:** Approved

---

## 1. 目标

构建一个本地 stdio MCP Server，帮助搜索机器人学与强化学习（Robotics + RL）领域的学术论文，支持：

- 按关键词、时间范围、作者、期刊/会议搜索
- 查看论文影响因子、引用数、h-index 等指标
- 获取摘要、DOI、PDF 链接

---

## 2. 技术决策

| 决策项 | 选择 | 原因 |
|--------|------|------|
| MCP SDK 版本 | v1.x (`@modelcontextprotocol/sdk`) | 稳定，推荐生产使用；v2 pre-alpha |
| Transport | stdio | 本地 Claude Desktop 集成标准方式 |
| 参数校验 | zod | SDK v1 原生支持 |
| HTTP 客户端 | 原生 fetch（Node 18+） | 无额外依赖 |
| API Key 管理 | 环境变量 | 通过 Claude Desktop MCP config `env` 字段传入 |
| 限速处理 | 指数退避重试（最多3次） | 对用户透明，适合交互式使用 |
| 响应格式 | 双 text block（markdown + JSON） | v1 SDK 不支持 structuredContent，用多 block 模拟 |

---

## 3. 数据源

| API | 用途 | 认证 | 速率限制 |
|-----|------|------|---------|
| Semantic Scholar Graph API | 论文搜索、详情、引用、作者 | 可选 `S2_API_KEY` | 无 key: 100req/5min；有 key: 1req/sec |
| arXiv API | 预印本搜索，PDF 链接 | 无需 | 宽松（建议 3s 间隔） |
| OpenAlex API | 期刊/会议影响因子、h-index | 需要 `OPENALEX_API_KEY`（免费） | 有 key: $1/day 预算 |

**注意：** OpenAlex 自 2025-02-13 起要求 API Key。无 key 时每天仅 100 credits（仅供测试）。

---

## 4. 项目结构

```
academic-search-mcp/
├── src/
│   ├── index.ts                  # McpServer 初始化 + 注册所有工具
│   ├── clients/
│   │   ├── semanticScholar.ts    # S2 API 封装
│   │   ├── arxiv.ts              # arXiv Atom feed 解析
│   │   └── openAlex.ts           # OpenAlex sources 查询
│   ├── tools/
│   │   ├── searchPapers.ts
│   │   ├── getPaperDetails.ts
│   │   ├── searchArxiv.ts
│   │   ├── getJournalMetrics.ts
│   │   ├── getAuthorInfo.ts
│   │   └── getCitations.ts
│   └── utils/
│       ├── retry.ts              # 指数退避，最多 3 次
│       └── format.ts             # 统一双格式输出
├── package.json
├── tsconfig.json
└── claude_desktop_config.json
```

---

## 5. 工具规格

### 5.1 `search_papers`

**数据源：** Semantic Scholar  
**端点：** `GET /graph/v1/paper/search`

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `query` | string | 是 | — | 搜索关键词 |
| `year_start` | number | 否 | — | 起始年份 |
| `year_end` | number | 否 | — | 结束年份 |
| `fields_of_study` | string | 否 | `"Computer Science"` | 研究领域 |
| `limit` | number | 否 | 20 | 返回数量（1-100） |

**返回字段：** `title`, `authors`, `year`, `abstract`, `citationCount`, `influentialCitationCount`, `venue`, `externalIds`（DOI/arXiv）

---

### 5.2 `get_paper_details`

**数据源：** Semantic Scholar  
**端点：** `GET /graph/v1/paper/{paper_id}`

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `paper_id` | string | 是 | S2ID、`DOI:10.xxx`、或 `ARXIV:2301.xxxxx` |

**返回：** 完整论文信息 + 参考文献列表（前20条）+ 被引论文列表（前20条，按引用数排序）

---

### 5.3 `search_arxiv_papers`

**数据源：** arXiv  
**端点：** `GET http://export.arxiv.org/api/query`

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `query` | string | 是 | — | 搜索关键词 |
| `categories` | string[] | 否 | `["cs.RO"]` | arXiv 分类（cs.RO, cs.LG, eess.SY 等） |
| `max_results` | number | 否 | 20 | 最大返回数量 |
| `date_from` | string | 否 | — | 起始日期（YYYY-MM-DD） |

**返回：** `arxivId`, `title`, `authors`, `abstract`, `publishedDate`, `pdfUrl`, `categories`

---

### 5.4 `get_journal_metrics`

**数据源：** OpenAlex  
**端点：** `GET /sources?search={venue_name}`

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `venue_name` | string | 是 | 期刊或会议名称（如 "ICRA", "Nature Robotics"） |

**返回：** `displayName`, `impactFactor`（2yr_mean_citedness）, `hIndex`, `worksCount`, `citedByCount`, `homepageUrl`

---

### 5.5 `get_author_info`

**数据源：** Semantic Scholar  
**端点：** `GET /graph/v1/author/{id}` 或 `GET /graph/v1/author/search`

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `author_name` | string | 条件必填 | 作者姓名（与 author_id 二选一） |
| `author_id` | string | 条件必填 | Semantic Scholar 作者 ID |

**返回：** `name`, `hIndex`, `citationCount`, `paperCount`, `affiliations`, `papers`（代表作前10篇）, `fields`（研究领域）

---

### 5.6 `get_citations`

**数据源：** Semantic Scholar  
**端点：** `GET /graph/v1/paper/{id}/citations`

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `paper_id` | string | 是 | — | S2ID、DOI:xxx 或 ARXIV:xxx |
| `limit` | number | 否 | 20 | 返回数量（1-100） |

**返回：** 引用该论文的论文列表，按 `citationCount` 降序排列

---

## 6. 错误处理

所有 API 调用包在 try/catch 中，错误信息包含 HTTP 状态码 + 原因 + 建议。

| 错误类型 | 处理方式 |
|---------|---------|
| 429 Too Many Requests | 指数退避重试（1s→2s→4s），3次后返回含建议的错误 |
| 404 Not Found | 立即返回，提示正确 ID 格式 |
| 5xx Server Error | 退避重试 |
| 4xx（非429/404） | 立即返回，含状态码和响应体 |
| 网络超时（>10s） | 立即返回，提示检查网络 |
| OpenAlex 无 key | 正常请求，响应末尾附注配置建议 |

工具返回 `isError: true` 时 Claude 可自行决策是否重试。

---

## 7. 响应格式

v1 SDK 不支持 `structuredContent`，用双 text block 模拟：

```typescript
return {
  content: [
    { type: "text", text: markdownSummary },
    { type: "text", text: "```json\n" + JSON.stringify(data, null, 2) + "\n```" }
  ]
}
```

`format.ts` 提供统一的 `formatResponse(markdown: string, data: unknown)` 函数供所有工具调用。

---

## 8. 重试逻辑

```
fetchWithRetry(fn, maxRetries = 3):
  对 429 和 5xx 重试
  等待时间：2^attempt * 1000ms（1s, 2s, 4s）
  4xx（除429）直接抛出
  超过 maxRetries 后抛出含重试次数的错误
```

---

## 9. 环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `OPENALEX_API_KEY` | 强烈建议 | OpenAlex 免费 key，openalex.org/settings/api 获取 |
| `S2_API_KEY` | 可选 | Semantic Scholar key，提升速率至 1req/sec |

---

## 10. Claude Desktop 配置

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

---

## 11. 典型使用示例

**示例 1：搜索近两年的机器人强化学习论文**
> "帮我搜索 2023-2025 年关于 'robot manipulation reinforcement learning' 的论文，按引用数排序"
→ 调用 `search_papers(query="robot manipulation reinforcement learning", year_start=2023, year_end=2025, limit=20)`

**示例 2：查看 ICRA 会议的影响力指标**
> "ICRA 会议的影响因子和 h-index 是多少？"
→ 调用 `get_journal_metrics(venue_name="ICRA")`

**示例 3：找某篇论文的所有引用**
> "帮我找引用了 'Soft Actor-Critic' 这篇论文的最新高引用论文"
→ 先 `search_papers(query="Soft Actor-Critic")` 获取 paper_id，再 `get_citations(paper_id=..., limit=50)`

---

## 12. 测试与启动

```bash
# 构建
npm run build

# MCP Inspector 测试
npx @modelcontextprotocol/inspector node dist/index.js

# 环境变量传入方式
OPENALEX_API_KEY=xxx S2_API_KEY=yyy npx @modelcontextprotocol/inspector node dist/index.js
```

---

## 13. Changelog

### v1.1.0（2026-06-15，optimize-v1 refactor）

7 个 commit，针对使用反馈的 7 个改进点：

1. **ID 规范化**（`src/clients/idNormalize.ts`）：`paper_id` 接受裸 arXiv ID / 裸 DOI / `ARXIV:xxx` / `DOI:10.xxx` / 40 位 S2 paperId，无效格式抛 400 含支持清单。
2. **`get_paper_details` 输出体积**：`formatResponse` 加两层兜底截断（单字段 2K / JSON 总长 50K），并新增 4 个可选参数 `include_references` / `include_citations` / `references_limit` / `citations_limit`。
3. **OpenAlex 字段语义修正**：`VenueMetrics.impactFactor` → `twoYearMeanCitedness`（实际是 OpenAlex 的 2yr mean citedness 而非 JCR IF）。会议自动标记 ⚠️ 并对该字段返回 N/A。
4. **作者消歧**：`searchAuthor` 返回 top 5 候选 + `author_id`；handler 列出全部候选 + 检测 name mismatch，给出警告。
5. **摘要截断可配**：`search_papers` / `search_arxiv_papers` 新增 `abstract_chars`（0-5000，默认 300，0=不截断）。
6. **README 文档**：新增「论文 ID 格式速查表」「输出体积控制」「作者消歧」「arXiv 分类默认」「OpenAlex 字段说明」「摘要长度自定义」6 节。
7. **schema describe 增强**：所有 `paper_id` 字段明确列出支持的 ID 格式；`venue_name` 描述补充。

向后兼容：所有新参数 `optional` 或有默认值，旧调用方式不需改动。
