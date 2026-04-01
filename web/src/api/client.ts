const base = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/** Thrown by {@link apiPostFormData} on non-OK responses; {@link body} is set when the response was JSON. */
export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

/** Prefer API JSON `{ "message": "..." }` for display; otherwise status + body text. */
function messageFromErrorResponse(status: number, text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return `Request failed (${status})`;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return `${status} ${trimmed}`;
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "message" in parsed &&
    typeof (parsed as { message: unknown }).message === "string"
  ) {
    const m = (parsed as { message: string }).message.trim();
    if (m.length > 0) {
      return m;
    }
  }
  return `${status} ${trimmed}`;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(messageFromErrorResponse(res.status, text));
  }
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(messageFromErrorResponse(res.status, text));
  }
  return res.json() as Promise<T>;
}

export async function apiPut(path: string, body?: unknown): Promise<void> {
  const res = await fetch(`${base}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(messageFromErrorResponse(res.status, text));
  }
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(messageFromErrorResponse(res.status, text));
  }
  return res.json() as Promise<T>;
}

export async function apiPostFormData<T>(
  path: string,
  form: FormData,
): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    body: form,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = undefined;
    }
    throw new HttpError(
      messageFromErrorResponse(res.status, text),
      res.status,
      body,
    );
  }
  return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${base}${path}`, {
    method: "DELETE",
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(messageFromErrorResponse(res.status, text));
  }
}
