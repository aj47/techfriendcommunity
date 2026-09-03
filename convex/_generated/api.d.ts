/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as channels from "../channels.js";
import type * as crons from "../crons.js";
import type * as discordIngest from "../discordIngest.js";
import type * as discordOut from "../discordOut.js";
import type * as email from "../email.js";
import type * as gif from "../gif.js";
import type * as http from "../http.js";
import type * as lib_ogImage from "../lib/ogImage.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_requireUser from "../lib/requireUser.js";
import type * as lib_sanitizeEmailReply from "../lib/sanitizeEmailReply.js";
import type * as lib_slug from "../lib/slug.js";
import type * as lib_urls from "../lib/urls.js";
import type * as links from "../links.js";
import type * as messages from "../messages.js";
import type * as og_card from "../og/card.js";
import type * as og_data from "../og/data.js";
import type * as og_image from "../og/image.js";
import type * as og_render from "../og/render.js";
import type * as og_routes from "../og/routes.js";
import type * as og_text from "../og/text.js";
import type * as points from "../points.js";
import type * as retention from "../retention.js";
import type * as staticSite from "../staticSite.js";
import type * as summaries from "../summaries.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  channels: typeof channels;
  crons: typeof crons;
  discordIngest: typeof discordIngest;
  discordOut: typeof discordOut;
  email: typeof email;
  gif: typeof gif;
  http: typeof http;
  "lib/ogImage": typeof lib_ogImage;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/requireUser": typeof lib_requireUser;
  "lib/sanitizeEmailReply": typeof lib_sanitizeEmailReply;
  "lib/slug": typeof lib_slug;
  "lib/urls": typeof lib_urls;
  links: typeof links;
  messages: typeof messages;
  "og/card": typeof og_card;
  "og/data": typeof og_data;
  "og/image": typeof og_image;
  "og/render": typeof og_render;
  "og/routes": typeof og_routes;
  "og/text": typeof og_text;
  points: typeof points;
  retention: typeof retention;
  staticSite: typeof staticSite;
  summaries: typeof summaries;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  firecrawl: import("@firecrawl/firecrawl-convex/_generated/component.js").ComponentApi<"firecrawl">;
  agentmail: import("@agentmail/convex/_generated/component.js").ComponentApi<"agentmail">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
