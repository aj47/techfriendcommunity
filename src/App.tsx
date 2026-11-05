import { lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./routes/Home";
import NotFound from "./routes/NotFound";
import { isChatShellRoute } from "./lib/appShell";

// The home page is the common entry point. Load the chat shell and the other
// screens only when someone visits them, keeping their code off the first load.
const ChatShell = lazy(() => import("./components/ChatShell"));
const LiveChat = lazy(() => import("./routes/LiveChat"));
const Channel = lazy(() => import("./routes/Channel"));
const Leaderboard = lazy(() => import("./routes/Leaderboard"));
const Resources = lazy(() => import("./routes/Resources"));
const Search = lazy(() => import("./routes/Search"));
const Settings = lazy(() => import("./routes/Settings"));
const SignIn = lazy(() => import("./routes/SignIn"));

export default function App() {
  const location = useLocation();
  const pages = (
    // Keyed by path so navigating away from a broken page clears the error.
    <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/channels" element={<LiveChat />} />
        <Route path="/channels/:slug" element={<Channel />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/resources" element={<Resources />} />
        <Route path="/search" element={<Search />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );

  // The shell wraps the routes from outside rather than being a layout route,
  // so it sits above the path-keyed ErrorBoundary: as a layout route it would
  // be inside that key and get torn down and rebuilt on every navigation,
  // flashing the rail and the recap back to "Loading…" each time you changed
  // channel. Out here it is the same element in the same position, so React
  // keeps it mounted and only the middle pane changes.
  return (
    <Layout>
      <Suspense fallback={<p className="px-4 py-6 text-sm text-zinc-500">Loading…</p>}>
        {isChatShellRoute(location.pathname) ? <ChatShell>{pages}</ChatShell> : pages}
      </Suspense>
    </Layout>
  );
}
