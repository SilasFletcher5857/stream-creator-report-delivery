const serviceUrl = process.env.REPORT_SERVICE_URL ?? "http://localhost:3000";
const recipientEmail = process.env.REPORT_RECIPIENT_EMAIL;
if (!recipientEmail) throw new Error("REPORT_RECIPIENT_EMAIL is required");

const response = await fetch(`${serviceUrl}/reports`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    creatorId: "creator-1042",
    creatorName: "North Pier Sessions",
    recipientEmail,
    period: "2026-08",
    playbackMinutes: 18420,
    uniqueViewers: 1268,
    emailReports: true,
  }),
});

const result: unknown = await response.json();
console.log(result);
if (!response.ok) process.exitCode = 1;
