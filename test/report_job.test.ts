import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { processReportJob, ReportJobStore } from "../src/report_job.js";
import type { ReportRequest } from "../src/report_request.js";

const baseRequest: ReportRequest = {
  creatorId: "creator-1042",
  creatorName: "North Pier Sessions",
  recipientEmail: "creator@example.com",
  period: "2026-08",
  playbackMinutes: 18420,
  uniqueViewers: 1268,
  emailReports: true,
};

test("a creator with playback receives one downloadable report", async () => {
  const assetDirectory = await mkdtemp(path.join(tmpdir(), "creator-report-"));
  const deliveries: Array<{ payload: unknown; key: string }> = [];
  const job = await processReportJob(baseRequest, new ReportJobStore(), {
    assetDirectory,
    publicBaseUrl: "https://reports.example.com",
    renderPdf: async () => new Uint8Array([37, 80, 68, 70]),
    sendEmail: async (payload, key) => {
      deliveries.push({ payload, key });
      return { message_id: "msg_1042" };
    },
  });

  assert.equal(job.status, "delivered");
  assert.equal(job.messageId, "msg_1042");
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].key, "creator-report-creator-1042-2026-08");
  assert.deepEqual(await readFile(job.assetPath!), Buffer.from([37, 80, 68, 70]));
});

test("zero playback skips both PDF processing and email delivery", async () => {
  let renderCount = 0;
  let sendCount = 0;
  const job = await processReportJob(
    { ...baseRequest, playbackMinutes: 0 },
    new ReportJobStore(),
    {
      assetDirectory: "/unused",
      publicBaseUrl: "https://reports.example.com",
      renderPdf: async () => {
        renderCount += 1;
        return new Uint8Array();
      },
      sendEmail: async () => {
        sendCount += 1;
        return { message_id: "unused" };
      },
    },
  );

  assert.deepEqual(
    { status: job.status, reason: job.skipReason, renderCount, sendCount },
    { status: "skipped", reason: "no_playback", renderCount: 0, sendCount: 0 },
  );
});
