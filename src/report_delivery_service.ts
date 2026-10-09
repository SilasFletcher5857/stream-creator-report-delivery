import { createReadStream } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { stat } from "node:fs/promises";
import path from "node:path";
import { ZodError } from "zod";
import { infrai, InfraiError } from "./infrai_email.js";
import { processReportJob, ReportJobStore } from "./report_job.js";
import { reportRequestSchema } from "./report_request.js";

const port = Number(process.env.PORT ?? 3000);
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;
const assetDirectory = path.resolve(process.env.REPORT_ASSET_DIR ?? ".reports");
const store = new ReportJobStore();

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", publicBaseUrl);

  if (request.method === "POST" && url.pathname === "/reports") {
    try {
      const input = reportRequestSchema.parse(await readJson(request));
      const job = await processReportJob(input, store, {
        sendEmail: infrai.email.send,
        assetDirectory,
        publicBaseUrl,
      });
      json(response, job.status === "skipped" ? 200 : 201, job);
    } catch (error) {
      if (error instanceof ZodError) {
        json(response, 400, { error: "invalid_report_request", issues: error.issues });
      } else if (error instanceof SyntaxError) {
        json(response, 400, { error: "invalid_json" });
      } else if (error instanceof InfraiError) {
        const status = error.status >= 400 && error.status < 500 ? error.status : 502;
        json(response, status, { error: error.code, message: error.message });
      } else {
        json(response, 500, { error: "report_processing_failed" });
      }
    }
    return;
  }

  const match = url.pathname.match(/^\/reports\/([^/]+)\/download$/);
  if (request.method === "GET" && match) {
    const job = store.get(match[1]);
    if (!job?.assetPath || url.searchParams.get("token") !== job.downloadToken) {
      json(response, 404, { error: "report_not_found" });
      return;
    }

    try {
      const file = await stat(job.assetPath);
      response.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": file.size,
        "Content-Disposition": `attachment; filename="stream-report-${job.period}.pdf"`,
      });
      createReadStream(job.assetPath).pipe(response);
    } catch {
      json(response, 404, { error: "report_not_found" });
    }
    return;
  }

  json(response, 404, { error: "route_not_found" });
});

server.listen(port, () => {
  console.log(`Report delivery service listening on ${publicBaseUrl}`);
});
