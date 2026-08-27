import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Email digests via AgentMail.
crons.daily("daily channel digests", { hourUTC: 14, minuteUTC: 0 }, internal.email.sendDigests, { cadence: "daily" });
crons.weekly("weekly channel digests", { dayOfWeek: "monday", hourUTC: 14, minuteUTC: 30 }, internal.email.sendDigests, { cadence: "weekly" });

// Post last week's top members into Discord (needs ANNOUNCE_CHANNEL_SLUG).
crons.weekly("weekly leaderboard announcement", { dayOfWeek: "monday", hourUTC: 15, minuteUTC: 0 }, internal.discordOut.announceWeekly, {});

export default crons;
