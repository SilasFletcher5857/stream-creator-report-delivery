import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReportRequest } from "./report_request.js";

export async function renderCreatorReport(input: ReportRequest): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);

  page.drawText("Stream performance report", {
    x: 54,
    y: 720,
    size: 24,
    font: bold,
    color: rgb(0.08, 0.13, 0.18),
  });
  page.drawText(`${input.creatorName} | ${input.period}`, {
    x: 54,
    y: 686,
    size: 12,
    font: regular,
    color: rgb(0.3, 0.36, 0.4),
  });
  page.drawText(`Playback minutes: ${input.playbackMinutes.toLocaleString("en-US")}`, {
    x: 54,
    y: 620,
    size: 16,
    font: bold,
  });
  page.drawText(`Unique viewers: ${input.uniqueViewers.toLocaleString("en-US")}`, {
    x: 54,
    y: 586,
    size: 16,
    font: bold,
  });

  return document.save();
}
