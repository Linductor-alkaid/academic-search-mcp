# academic-search-mcp

本地 stdio MCP Server，专为机器人学与强化学习（Robotics + RL）领域的论文检索而构建。支持按关键词、时间范围、作者、期刊/会议搜索，查看引用数、影响因子、h-index 等指标，获取摘要、DOI 和 PDF 链接。

## 数据源

| API | 用途 | 认证 |
|-----|------|------|
| [Semantic Scholar](https://api.semanticscholar.org/) | 论文搜索、详情、引用、作者 | 可选 `S2_API_KEY` |
| [arXiv](https://arxiv.org/help/api/) | 预印本搜索，PDF 直链 | 无需 |
| [OpenAlex](https://docs.openalex.org/) | 期刊/会议影响因子、h-index | 需要 `OPENALEX_API_KEY`（免费） |

## 前置要求

- Node.js 18+
- OpenAlex 免费 API Key：[openalex.org/settings/api](https://openalex.org/settings/api)（30 秒注册）
- Semantic Scholar API Key（可选，提升速率至 1req/sec）：[申请地址](https://www.semanticscholar.org/product/api#api-key-form)

## 安装

```bash
git clone https://github.com/Linductor-alkaid/academic-search-mcp.git
cd academic-search-mcp
npm install
npm run build
```

## Claude Desktop 配置

将以下内容合并到 Claude Desktop 的 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "academic-search": {
      "command": "node",
      "args": ["/path/to/academic-search-mcp/dist/index.js"],
      "env": {
        "OPENALEX_API_KEY": "your_openalex_key_here",
        "S2_API_KEY": "your_s2_key_here"
      }
    }
  }
}
```

> Windows 路径使用正斜杠 `/` 或双反斜杠 `\\`。

## 工具列表

### `search_papers`
通过 Semantic Scholar 搜索论文。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `query` | string | 必填 | 搜索关键词 |
| `year_start` | number | — | 起始年份 |
| `year_end` | number | — | 结束年份 |
| `fields_of_study` | string | `"Computer Science"` | 研究领域 |
| `limit` | number | `20` | 返回数量（1-100） |

返回：title、authors、year、abstract（前300字）、citation_count、venue、DOI/arXiv ID

---

### `get_paper_details`
获取论文完整信息，包含参考文献和被引论文列表。

| 参数 | 类型 | 说明 |
|------|------|------|
| `paper_id` | string | S2ID、`DOI:10.xxx` 或 `ARXIV:2301.xxxxx` |

返回：完整摘要、PDF 链接、参考文献（前20条）、被引论文（前20条，按引用数排序）

---

### `search_arxiv_papers`
搜索 arXiv 预印本，支持分类过滤。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `query` | string | 必填 | 搜索关键词 |
| `categories` | string[] | `["cs.RO"]` | arXiv 分类，如 `cs.RO`、`cs.LG`、`eess.SY` |
| `max_results` | number | `20` | 最大返回数量 |
| `date_from` | string | — | 起始日期，格式 `YYYY-MM-DD` |

返回：arXiv ID、title、authors、abstract、published_date、pdf_url、categories

---

### `get_journal_metrics`
通过 OpenAlex 查询期刊或会议的影响力指标。

| 参数 | 类型 | 说明 |
|------|------|------|
| `venue_name` | string | 期刊/会议名称，如 `"ICRA"`、`"Nature Robotics"` |

返回：impact_factor（2yr）、h_index、works_count、cited_by_count、homepage_url

---

### `get_author_info`
查询作者的学术指标和代表作。

| 参数 | 类型 | 说明 |
|------|------|------|
| `author_name` | string | 作者姓名（与 `author_id` 二选一） |
| `author_id` | string | Semantic Scholar 作者 ID |

返回：h_index、citation_count、paper_count、affiliations、代表作（前10篇，按引用数排序）

---

### `get_citations`
获取引用指定论文的论文列表。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `paper_id` | string | 必填 | S2ID、`DOI:10.xxx` 或 `ARXIV:2301.xxxxx` |
| `limit` | number | `20` | 返回数量（1-100） |

返回：引用该论文的论文列表，按 citation_count 降序排列

## 使用示例

**搜索近两年机器人强化学习论文：**
> 帮我搜索 2023-2025 年关于 "robot manipulation reinforcement learning" 的高引用论文

**查看 ICRA 会议指标：**
> ICRA 会议的影响因子和 h-index 是多少？

**查找某篇论文的所有引用：**
> 帮我找引用了 "Soft Actor-Critic" 这篇论文的最新高引用论文

**查询作者信息：**
> Sergey Levine 的 h-index 是多少，他最有影响力的论文有哪些？

**搜索最新 arXiv 预印本：**
> 搜索 2024 年以来 cs.RO 和 cs.LG 分类下关于 "diffusion policy" 的论文

## 限速说明

- **Semantic Scholar（无 key）**：100 req/5min，遇到 429 自动指数退避重试（1s→2s→4s）
- **Semantic Scholar（有 key）**：1 req/sec，基本不限速
- **arXiv**：无硬性限制，建议间隔 3s
- **OpenAlex（有 key）**：$1/day 预算，日常使用足够

## 开发

```bash
npm run build      # 编译 TypeScript
npm run dev        # 监听模式编译
```

MCP Inspector 调试（需先全局安装或使用 npx）：
```bash
OPENALEX_API_KEY=xxx node dist/index.js
```
