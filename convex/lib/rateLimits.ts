import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  postMessage: { kind: "token bucket", rate: 5, period: MINUTE, capacity: 5 },
  summarizeLink: { kind: "fixed window", rate: 3, period: MINUTE },
  emailReply: { kind: "fixed window", rate: 10, period: MINUTE },
  // Mirrors the Discord bot's GIF_LIMIT_PER_WINDOW=1 over GIF_TIME_WINDOW=5min
  // (gif_limiter.py). The bot polices GIFs per member, but it never sees a
  // webhook post, so without this the email route is a way around its limit.
  // A one-token bucket refilling over the window is the closest shape to the
  // bot's sliding window that the limiter offers.
  emailGif: { kind: "token bucket", rate: 1, period: 5 * MINUTE, capacity: 1 },
});
