import { Link } from "react-router-dom";
import { pageTitle, usePageMeta } from "../lib/head";

export default function NotFound() {
  usePageMeta(pageTitle("Not found"));
  return (
    <div className="mx-auto max-w-lg space-y-4 py-10 text-center">
      <h1 className="text-lg font-semibold">There's nothing at this address.</h1>
      <p className="text-sm text-zinc-400">
        The link may be out of date, or the channel may have been renamed.
      </p>
      <div className="flex justify-center gap-3">
        <Link
          to="/"
          className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
        >
          Latest messages
        </Link>
        <Link to="/channels" className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
          Live chat
        </Link>
      </div>
    </div>
  );
}
