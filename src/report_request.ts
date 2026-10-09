import { z } from "zod";

export const reportRequestSchema = z.object({
  creatorId: z.string().min(1).max(80),
  creatorName: z.string().min(1).max(120),
  recipientEmail: z.string().email(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  playbackMinutes: z.number().int().nonnegative(),
  uniqueViewers: z.number().int().nonnegative(),
  emailReports: z.boolean(),
});

export type ReportRequest = z.infer<typeof reportRequestSchema>;

export type ReportDecision =
  | { action: "process" }
  | { action: "skip"; reason: "email_opt_out" | "no_playback" };

export function decideReportDelivery(input: ReportRequest): ReportDecision {
  if (!input.emailReports) return { action: "skip", reason: "email_opt_out" };
  if (input.playbackMinutes === 0) return { action: "skip", reason: "no_playback" };
  return { action: "process" };
}
