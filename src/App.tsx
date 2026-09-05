import { Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import ChatShell from "./components/ChatShell";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./routes/Home";
import LiveChat from "./routes/LiveChat";
import Channel from "./routes/Channel";
import Leaderboard from "./routes/Leaderboard";
import NotFound from "./routes/NotFound";
import Resources from "./routes/Resources";
import Search from "./routes/Search";
import Settings from "./routes/Settings";
import SignIn from "./routes/SignIn";
import { isChatShellRoute } from "./lib/appShell";

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
      {isChatShellRoute(location.pathname) ? <ChatShell>{pages}</ChatShell> : pages}
    </Layout>
  );
}
