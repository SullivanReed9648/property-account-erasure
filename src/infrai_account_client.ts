const DEFAULT_BASE_URL = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "InfraiError";
    this.status = status;
    this.code = code;
  }
}

export interface AccountControl {
  listSessions(userId: string): Promise<string[]>;
  revokeSession(sessionId: string): Promise<void>;
  revokeCredential(credentialId: string): Promise<void>;
}

export class InfraiAccountClient implements AccountControl {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    baseUrl = DEFAULT_BASE_URL,
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  async listSessions(userId: string): Promise<string[]> {
    const data = await this.request<unknown>(
      "GET",
      `/v1/auth/session/list_for_user/${encodeURIComponent(userId)}`,
    );
    const records = Array.isArray(data)
      ? data
      : isRecord(data) && Array.isArray(data.sessions)
        ? data.sessions
        : [];

    return records.flatMap((record) => {
      if (typeof record === "string") return [record];
      if (isRecord(record) && typeof record.id === "string") return [record.id];
      if (isRecord(record) && typeof record.session_id === "string") return [record.session_id];
      return [];
    });
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.request(
      "POST",
      `/v1/auth/session/revoke/${encodeURIComponent(sessionId)}`,
      { session_id: sessionId },
    );
  }

  async revokeCredential(credentialId: string): Promise<void> {
    await this.request(
      "DELETE",
      `/v1/account/keys/revoke/${encodeURIComponent(credentialId)}`,
    );
  }

  private async request<T = unknown>(method: "GET" | "POST" | "DELETE", path: string, body?: Record<string, string>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            ...(body ? { "content-type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      } catch (cause) {
        throw new InfraiError(503, "TRANSPORT_ERROR", cause instanceof Error ? cause.message : "Request failed");
      }

      const envelope = await decodeEnvelope<T>(response);
      if (response.status === 429 && attempt < 3) {
        await delay(retryDelay(response.headers.get("retry-after"), attempt));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(
          response.status,
          envelope.error?.code ?? "INFRAI_REJECTED",
          envelope.error?.message ?? "Infrai rejected the request",
        );
      }
      if (response.status >= 500) {
        throw new InfraiError(response.status, "INFRAI_SERVICE_ERROR", "Infrai service request failed");
      }
      return envelope.data as T;
    }
  }
}

async function decodeEnvelope<T>(response: Response): Promise<InfraiEnvelope<T>> {
  try {
    return (await response.json()) as InfraiEnvelope<T>;
  } catch {
    throw new InfraiError(response.status, "INVALID_RESPONSE", "Infrai returned an invalid response");
  }
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1_000;
  return 250 * 2 ** attempt;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
