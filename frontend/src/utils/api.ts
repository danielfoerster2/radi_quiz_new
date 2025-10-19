export async function parseJson<T = unknown>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return (await response.json()) as T;
    } catch (error) {
      console.warn("Failed to parse JSON response", error);
      return null;
    }
  }
  return null;
}

