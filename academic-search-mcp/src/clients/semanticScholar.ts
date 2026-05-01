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
