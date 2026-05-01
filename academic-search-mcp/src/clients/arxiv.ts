import { XMLParser } from "fast-xml-parser";
import { ApiError } from "../utils/retry.js";

const BASE = "https://export.arxiv.org/api/query";

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
