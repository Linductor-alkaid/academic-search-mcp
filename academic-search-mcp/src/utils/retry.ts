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
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetchWithRetry(() =>
      fetch(url, { headers, signal: controller.signal })
    );
    return res.json() as Promise<T>;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new ApiError("请求超时（30s），请检查网络连接", 0);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
