import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EmailSender } from "./infrai_email.js";
import { decideReportDelivery, type ReportRequest } from "./report_request.js";
import { renderCreatorReport } from "./report_pdf.js";

export type JobStatus = "queued" | "processing" | "delivered" | "skipped" | "failed";

export type ReportJob = {
  id: string;
  status: JobStatus;
  creatorId: string;
  period: string;
  assetPath?: string;
  downloadToken?: string;
  messageId?: string;
  skipReason?: "email_opt_out" | "no_playback";
};

export class ReportJobStore {
  readonly jobs = new Map<string, ReportJob>();

  create(input: ReportRequest): ReportJob {
    const job: ReportJob = {
      id: randomUUID(),
      status: "queued",
      creatorId: input.creatorId,
      period: input.period,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): ReportJob | undefined {
    return this.jobs.get(id);
  }
}

type Dependencies = {
  sendEmail: EmailSender;
  assetDirectory: string;
  publicBaseUrl: string;
  renderPdf?: (input: ReportRequest) => Promise<Uint8Array>;
};

export async function processReportJob(
  input: ReportRequest,
  store: ReportJobStore,
  dependencies: Dependencies,
): Promise<ReportJob> {
  const job = store.create(input);
  const decision = decideReportDelivery(input);

  if (decision.action === "skip") {
    job.status = "skipped";
    job.skipReason = decision.reason;
    return job;
  }

  job.status = "processing";
  try {
    const pdf = await (dependencies.renderPdf ?? renderCreatorReport)(input);
    await mkdir(dependencies.assetDirectory, { recursive: true });
    const filename = `${job.id}.pdf`;
    job.assetPath = path.join(dependencies.assetDirectory, filename);
    job.downloadToken = randomBytes(24).toString("hex");
    await writeFile(job.assetPath, pdf);

    const downloadUrl = new URL(`/reports/${job.id}/download`, dependencies.publicBaseUrl);
    downloadUrl.searchParams.set("token", job.downloadToken);
    const result = await dependencies.sendEmail(
      {
        to: input.recipientEmail,
        subject: `${input.period} streaming report for ${input.creatorName}`,
        html: `<p>Your ${input.period} streaming report is ready.</p><p><a href="${downloadUrl.toString()}">Download the PDF report</a></p>`,
      },
      `creator-report-${input.creatorId}-${input.period}`,
    );

    job.messageId = result.message_id;
    job.status = "delivered";
    return job;
  } catch (cause) {
    job.status = "failed";
    throw cause;
  }
}
