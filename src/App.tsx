import { Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./routes/Home";
import Channel from "./routes/Channel";
import Channels from "./routes/Channels";
import Leaderboard from "./routes/Leaderboard";
import NotFound from "./routes/NotFound";
import Resources from "./routes/Resources";
import Search from "./routes/Search";
import Settings from "./routes/Settings";
import SignIn from "./routes/SignIn";
import { GlobalTools } from "./webmcp/globalTools";

export default function App() {
  const location = useLocation();
  return (
    <Layout>
      <GlobalTools />
      {/* Keyed by path so navigating away from a broken page clears the error. */}
      <ErrorBoundary key={location.pathname}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/channels" element={<Channels />} />
          <Route path="/channels/:slug" element={<Channel />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/search" element={<Search />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
    </Layout>
  );
}
