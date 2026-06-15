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

## 论文 ID 格式速查表

所有接受 `paper_id` 的工具（`get_paper_details` / `get_citations`）支持以下 5 种格式，**自动归一化**到 Semantic Scholar 接受的内部表示：

| 你传的 | 自动归一化为 | 备注 |
|--------|-------------|------|
| `2402.18294` | `ARXIV:2402.18294` | 裸 arXiv ID（YYMM.NNNNN） |
| `ARXIV:2402.18294` | `ARXIV:2402.18294` | 大小写不敏感 |
| `10.1109/IROS.2024.10801451` | `DOI:10.1109/...` | 裸 DOI |
| `DOI:10.1109/...` | `DOI:10.1109/...` | |
| 40 位 hex（如 `9e1c2411c873a95843c4ce670fb53569c65059d6`） | 原样 | S2 paperId |

无法识别的格式会返回 400 错误并附「支持的格式」清单。

## 论文详情输出体积控制

`get_paper_details` 默认会包含参考文献 + 被引论文各 10 条（约 30-60KB），适合大多数场景。遇到输出过大时：

| 参数 | 类型 | 默认 | 作用 |
|------|------|------|------|
| `include_references` | bool | `true` | 是否包含参考文献列表 |
| `include_citations` | bool | `true` | 是否包含被引论文列表 |
| `references_limit` | 0-100 | `10` | 参考文献条数 |
| `citations_limit` | 0-100 | `10` | 被引论文条数 |

最小化调用示例（只看摘要和元数据）：
```
get_paper_details(paper_id="2402.18294", include_references=false, include_citations=false)
```

另外 `formatResponse` 还有两层兜底截断（单字符串字段 2000 chars / JSON 总长 50000 chars），超出部分会自动截断并附提示，不会撑爆客户端上下文。

## 作者消歧

`get_author_info(author_name=...)` 现在返回 **top 5 候选作者**，每个都带 `author_id`、机构、h-index、引用数。中文/拼音重名场景下尤其有用：

- 主信息仍是首位候选（保持原有行为）
- 末尾追加「搜索候选」列表 + ⚠️ 提示
- 用 `author_id="..."` 重试可精确指定作者

## arXiv 分类默认

`search_arxiv_papers` 默认 `categories=["cs.RO"]`（**仅机器人学方向**）。跨分类搜索需显式传：

```
search_arxiv_papers(query="...", categories=["cs.RO", "cs.LG", "eess.SY"])
```

## OpenAlex 字段说明

⚠️ `get_journal_metrics` 返回的「2yr mean citedness」**不是** JCR Impact Factor，而是 OpenAlex 自有指标。

- **会议（type=conference）**：无此字段，会标记 N/A，请参考 h-index 和总引用数
- **期刊（type=journal）**：可参考，但与 JCR IF 数值不同（口径差异）

## 摘要长度自定义

`search_papers` 和 `search_arxiv_papers` 默认摘要截断 300 字符，方法描述容易被截断。设大一点：

```
search_papers(query="...", abstract_chars=2000)
```

`abstract_chars=0` 表示不截断。

## v1.0.0 → v1.1.0 迁移指南

v1.1.0 包含 **1 处破坏性变更** 和 **1 处行为默认值变更**。其他都是新增可选参数（向后兼容）。本文档面向直接解析 `get_journal_metrics` JSON dump 的下游用户。

### 破坏性变更：`VenueMetrics.impactFactor` 重命名

OpenAlex 的 `summary_stats['2yr_mean_citedness']` **不是** JCR Impact Factor。旧名 `impactFactor` 误导性极强（ICRA 返回 0.000 像 bug，实际是该字段对会议本就无意义）。

```diff
// 旧 (v1.0.0)
const venue = parseJsonDump(getJournalMetrics("ICRA"));
console.log(venue[0].impactFactor);  // → undefined（字段没了）

// 新 (v1.1.0)
const venue = parseJsonDump(getJournalMetrics("ICRA"));
console.log(venue[0].twoYearMeanCitedness);  // → null（会议无此字段）或数值（期刊）
```

**迁移动作**：
- 如果你的代码访问 `v.impactFactor`，改为 `v.twoYearMeanCitedness`
- 如果依赖 `impactFactor !== null` 判断「这是期刊」，改为 `v.type !== "conference"`
- 会议（type=conference）现在永远返回 `twoYearMeanCitedness: null`，markdown 块会显示 `N/A（会议无此指标，参考 h-index / 总引用数）`

### 行为变更：`get_paper_details` 默认条数 20 → 10

旧版本 references 和 citations 各固定 20 条（合计可能 ~134K chars）。v1.1.0 默认改为 10/10（约 30-60K），更安全。

```diff
// 旧 (v1.0.0)
get_paper_details(paper_id="ARXIV:2402.18294")
  → 返回 references × 20, citations × 20

// 新 (v1.1.0) — 默认行为变了
get_paper_details(paper_id="ARXIV:2402.18294")
  → 返回 references × 10, citations × 10
```

**迁移动作**（如果你需要完整列表）：
- 想要旧行为：`get_paper_details(paper_id="...", references_limit=20, citations_limit=20)`
- 想要极致精简（只看摘要）：`get_paper_details(paper_id="...", include_references=false, include_citations=false)`

### 新增可选参数（无破坏，向后兼容）

| 工具 | 新参数 | 旧调用者需要改吗 |
|------|--------|----------------|
| `get_paper_details` | `include_references`, `include_citations`, `references_limit`, `citations_limit` | ❌ 不需要 |
| `get_citations` / `get_paper_details` | `paper_id` 现在接受裸 arXiv ID / 裸 DOI | ❌ 不需要（旧格式仍工作） |
| `search_papers` / `search_arxiv_papers` | `abstract_chars` | ❌ 不需要 |
| `get_author_info` | name search 现在返回 top-5 候选列表 | ❌ 不需要（首位仍是主信息） |

### 升级建议

```bash
cd academic-search-mcp
git pull origin master
npm install   # 无新依赖，但保险起见
npm run build
```

Claude Desktop 配置无需修改（无新增 env vars，无 schema 不兼容）。重启 Claude Desktop 让新版本生效。

---

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
