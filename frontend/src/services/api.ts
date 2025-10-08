export type ApiFetchOptions = RequestInit & {
  json?: Record<string, unknown> | Array<unknown>;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { json, headers, ...rest } = options;
  const mergedHeaders = new Headers(headers);
  if (json !== undefined && !mergedHeaders.has("Content-Type")) {
    mergedHeaders.set("Content-Type", "application/json");
  }

  const payload: RequestInit = {
    credentials: "include",
    headers: mergedHeaders,
    ...rest,
  };

  if (json !== undefined) {
    payload.body = JSON.stringify(json);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, payload);
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      isJson && data && typeof data === "object" && "error" in data
        ? (data as { error: string }).error
        : response.statusText || "Unexpected error";
    throw new Error(message);
  }

  return data as T;
}
