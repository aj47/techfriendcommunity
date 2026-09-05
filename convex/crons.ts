import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Email digests via AgentMail.
crons.daily("daily channel digests", { hourUTC: 14, minuteUTC: 0 }, internal.email.sendDigests, { cadence: "daily" });
crons.weekly("weekly channel digests", { dayOfWeek: "monday", hourUTC: 14, minuteUTC: 30 }, internal.email.sendDigests, { cadence: "weekly" });

// Bound the raw message log. Runs at a quiet hour, clear of both the digests
// above and the bot's 00:00 UTC daily summarisation.
crons.daily("message retention sweep", { hourUTC: 9, minuteUTC: 0 }, internal.retention.enforceRetention, {});
crons.daily("processed email sweep", { hourUTC: 9, minuteUTC: 30 }, internal.retention.sweepProcessedEmails, {});

export default crons;
