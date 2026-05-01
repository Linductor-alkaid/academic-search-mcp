---
name: academic-search
description: 学术论文搜索工具集，覆盖 Robotics + RL 领域。可搜索论文、查看详情、获取引用列表、查询作者信息、查看期刊/会议影响因子。数据源：Semantic Scholar、arXiv、OpenAlex。
type: reference
---

# Academic Search MCP — 使用指南

## 可用工具

| 工具 | 数据源 | 核心用途 |
|------|--------|---------|
| `search_papers` | Semantic Scholar | 关键词搜索，支持年份/领域过滤 |
| `get_paper_details` | Semantic Scholar | 论文完整信息 + 参考文献 + 被引列表 |
| `search_arxiv_papers` | arXiv | 预印本搜索，支持分类过滤，返回 PDF 链接 |
| `get_journal_metrics` | OpenAlex | 期刊/会议影响因子、h-index |
| `get_author_info` | Semantic Scholar | 作者 h-index、引用数、代表作 |
| `get_citations` | Semantic Scholar | 引用某篇论文的论文列表（按引用数排序） |

---

## 工具详细用法

### `search_papers` — 论文关键词搜索

```
query: "robot manipulation reinforcement learning"
year_start: 2022          # 可选
year_end: 2025            # 可选
fields_of_study: "Computer Science"  # 默认值
limit: 20                 # 1-100，默认 20
```

**典型场景：**
- 搜索某个方向的近期论文
- 找某个方法/模型的原始论文（用于获取 paper_id）
- 按年份范围筛选

**返回的 paper_id 格式：**
- Semantic Scholar ID（纯数字字符串，如 `204e3073870fae3d05bcbc2f6a8e263d9b72e776`）
- 也可用 `DOI:10.1109/xxx` 或 `ARXIV:2301.xxxxx` 格式传给其他工具

---

### `get_paper_details` — 论文完整详情

```
paper_id: "ARXIV:1801.01290"        # Soft Actor-Critic
# 或
paper_id: "DOI:10.1109/ICRA.2019.8793493"
# 或
paper_id: "204e3073870fae3d05bcbc2f6a8e263d9b72e776"  # S2 ID
```

返回：完整摘要、PDF 链接、参考文献（前20条）、被引论文（前20条）

---

### `search_arxiv_papers` — arXiv 预印本搜索

```
query: "diffusion policy robot"
categories: ["cs.RO", "cs.LG"]   # 默认 ["cs.RO"]
max_results: 20
date_from: "2024-01-01"           # 可选，YYYY-MM-DD
```

**常用 arXiv 分类：**
- `cs.RO` — 机器人学
- `cs.LG` — 机器学习
- `cs.AI` — 人工智能
- `eess.SY` — 系统与控制
- `cs.CV` — 计算机视觉

返回直接可用的 PDF 链接（`https://arxiv.org/pdf/{id}`）

---

### `get_journal_metrics` — 期刊/会议指标

```
venue_name: "ICRA"
# 或
venue_name: "Nature Robotics"
# 或
venue_name: "IEEE Transactions on Robotics"
```

返回：影响因子（2年均值）、h-index、收录论文数、总被引次数

**注意：** 需要配置 `OPENALEX_API_KEY` 环境变量，否则每日仅 100 次请求。

---

### `get_author_info` — 作者信息

```
author_name: "Sergey Levine"
# 或（更精确）
author_id: "2145648832"   # Semantic Scholar 作者 ID
```

返回：h-index、总引用数、论文数、机构、代表作（前10篇，按引用数排序）

**获取精确 author_id：** 先用 `search_papers` 找到该作者的论文，返回结果中 `authors` 数组包含 `authorId`。

---

### `get_citations` — 引用列表

```
paper_id: "ARXIV:1801.01290"
limit: 50    # 默认 20，最多 100
```

返回引用该论文的论文列表，按 citation_count 降序排列，适合找某个方法的后续工作。

---

## 典型工作流

### 工作流 1：调研某个方向

```
1. search_papers(query="...", year_start=2022, limit=20)
   → 获取概览，找到关键论文的 paper_id

2. get_paper_details(paper_id="...")
   → 深入了解某篇论文，查看它引用了哪些工作

3. get_citations(paper_id="...", limit=50)
   → 找到该论文的后续工作
```

### 工作流 2：评估期刊/会议

```
1. get_journal_metrics(venue_name="ICRA")
2. get_journal_metrics(venue_name="CoRL")
3. get_journal_metrics(venue_name="IEEE Transactions on Robotics")
   → 对比影响因子和 h-index
```

### 工作流 3：了解某位研究者

```
1. get_author_info(author_name="Pieter Abbeel")
   → 获取 h-index、代表作列表

2. get_paper_details(paper_id="<代表作 ID>")
   → 深入了解其核心工作
```

### 工作流 4：追踪最新预印本

```
search_arxiv_papers(
  query="robot learning",
  categories=["cs.RO", "cs.LG"],
  date_from="2025-01-01",
  max_results=30
)
```

---

## 错误处理

| 错误 | 原因 | 解决方法 |
|------|------|---------|
| `HTTP 429` | Semantic Scholar 限速 | 申请 S2_API_KEY，或稍后重试 |
| `HTTP 404` | paper_id 格式错误 | 检查格式：`DOI:10.xxx` / `ARXIV:2301.xxxxx` |
| `未找到期刊` | 名称不匹配 | 尝试全称或缩写，如 "ICRA" 或 "International Conference on Robotics and Automation" |
| OpenAlex 无数据 | 该期刊未被收录 | 换用 Semantic Scholar 的 venue 字段估算 |

---

## 环境变量

| 变量 | 必填 | 获取方式 |
|------|------|---------|
| `OPENALEX_API_KEY` | 强烈建议 | [openalex.org/settings/api](https://openalex.org/settings/api) |
| `S2_API_KEY` | 可选 | [semanticscholar.org/product/api](https://www.semanticscholar.org/product/api#api-key-form) |
