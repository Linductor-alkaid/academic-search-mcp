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

  if (!process.env.OPENALEX_API_KEY) {
    console.warn("[openAlex] OPENALEX_API_KEY not set; requests may be rate-limited (100 credits/day)");
  }

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
  }));

  return results;
}
