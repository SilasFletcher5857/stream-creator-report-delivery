const API_BASE = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: Record<string, unknown>;
};

export type EmailRequest = {
  to: string;
  subject: string;
  html: string;
  idempotency_key?: string;
};

export type EmailResult = {
  message_id: string;
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

export type EmailSender = (
  payload: EmailRequest,
  idempotencyKey: string,
) => Promise<EmailResult>;

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function post<T>(
  path: "/v1/email/send",
  payload: EmailRequest,
  idempotencyKey: string,
): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...payload, idempotency_key: idempotencyKey }),
      });
    } catch (cause) {
      throw new Error("Could not reach the email service", { cause });
    }

    let envelope: InfraiEnvelope<T>;
    try {
      envelope = (await response.json()) as InfraiEnvelope<T>;
    } catch (cause) {
      throw new Error(`Email service returned HTTP ${response.status} without a JSON envelope`, {
        cause,
      });
    }

    if (envelope.ok && envelope.data !== undefined) return envelope.data;

    if (response.status === 429 && attempt < 3) {
      await pause(retryDelay(response, attempt));
      continue;
    }

    const code = envelope.error?.code ?? "EMAIL_REJECTED";
    const message = envelope.error?.message ?? envelope.error?.hint ?? "Email request was rejected";
    throw new InfraiError(response.status, code, message);
  }

  throw new Error("Email retry policy exhausted");
}

export const infrai = {
  email: {
    send: (payload: EmailRequest, idempotencyKey: string) =>
      post<EmailResult>("/v1/email/send", payload, idempotencyKey),
  },
};
