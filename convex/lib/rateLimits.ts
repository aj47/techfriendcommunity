import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  postMessage: { kind: "token bucket", rate: 5, period: MINUTE, capacity: 5 },
  summarizeLink: { kind: "fixed window", rate: 3, period: MINUTE },
  emailReply: { kind: "fixed window", rate: 10, period: MINUTE },
});
