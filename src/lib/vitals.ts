import { onCLS, onINP, onLCP, type Metric } from "web-vitals";

let started = false;

function pageGroup(path: string): string {
  if (path === "/") return "home";
  if (path === "/channels") return "chat";
  if (path.startsWith("/channels/")) return "channel";
  const name = path.slice(1).split("/")[0];
  return ["resources", "search", "leaderboard", "settings", "signin"].includes(name) ? name : "other";
}

export function startVitals(isAuthenticated: boolean) {
  if (started || window.location.hostname !== "www.techfriendcommunity.com") return;
  started = true;
  const page = pageGroup(window.location.pathname);
  const cohort = isAuthenticated ? "member" : "visitor";
  const device = window.innerWidth < 768 ? "mobile" : window.innerWidth < 1024 ? "tablet" : "desktop";
  const report = ({ name, value }: Metric) => {
    const body = new Blob([JSON.stringify({ name, value, page, device, cohort })], { type: "application/json" });
    navigator.sendBeacon("/api/vitals", body);
  };
  onLCP(report);
  onINP(report);
  onCLS(report);
}
