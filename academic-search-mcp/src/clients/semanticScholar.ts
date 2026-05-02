import { fetchJson, ApiError } from "../utils/retry.js";

const BASE = "https://api.semanticscholar.org/graph/v1";

let s2KeyInvalid = false;

function s2Headers(): Record<string, string> {
  const key = process.env.S2_API_KEY;
  if (!key || s2KeyInvalid) return {};
  return { "x-api-key": key };
}

async function fetchS2Json<T>(url: string): Promise<T> {
  try {
    return await fetchJson<T>(url, s2Headers());
  } catch (err) {
    if (
      err instanceof ApiError &&
      (err.statusCode === 401 || err.statusCode === 403) &&
      !s2KeyInvalid &&
      process.env.S2_API_KEY
    ) {
      s2KeyInvalid = true;
      console.warn("[semanticScholar] S2_API_KEY 无效，已降级为无认证访问");
      return fetchJson<T>(url, {});
    }
    throw err;
  }
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

  const data = await fetchS2Json<{ data: S2Paper[]; total: number }>(url.toString());
  return data.data ?? [];
}

export async function getPaper(paperId: string): Promise<S2PaperDetail> {
  const url = `${BASE}/paper/${encodeURIComponent(paperId)}?fields=${PAPER_DETAIL_FIELDS}&limit=20`;
  return fetchS2Json<S2PaperDetail>(url);
}

export async function getPaperCitations(
  paperId: string,
  limit = 20
): Promise<S2Paper[]> {
  const url = `${BASE}/paper/${encodeURIComponent(paperId)}/citations?fields=${PAPER_FIELDS}&limit=${limit}`;
  const data = await fetchS2Json<{ data: Array<{ citingPaper: S2Paper }> }>(url);
  return (data.data ?? [])
    .map((d) => d.citingPaper)
    .sort((a, b) => b.citationCount - a.citationCount);
}

export async function getAuthorById(authorId: string): Promise<S2AuthorDetail> {
  const fields = "name,hIndex,citationCount,paperCount,affiliations,papers.title,papers.year,papers.citationCount,papers.externalIds";
  const url = `${BASE}/author/${encodeURIComponent(authorId)}?fields=${fields}`;
  return fetchS2Json<S2AuthorDetail>(url);
}

export async function searchAuthor(name: string): Promise<S2AuthorDetail | null> {
  const url = new URL(`${BASE}/author/search`);
  url.searchParams.set("query", name);
  url.searchParams.set("fields", "name,hIndex,citationCount,paperCount,affiliations,papers.title,papers.year,papers.citationCount,papers.externalIds");
  url.searchParams.set("limit", "1");

  const data = await fetchS2Json<{ data: S2AuthorDetail[] }>(url.toString());
  return data.data?.[0] ?? null;
}
