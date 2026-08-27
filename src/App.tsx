import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./routes/Home";
import Channel from "./routes/Channel";
import Leaderboard from "./routes/Leaderboard";
import Resources from "./routes/Resources";
import Settings from "./routes/Settings";
import SignIn from "./routes/SignIn";
import { GlobalTools } from "./webmcp/globalTools";

export default function App() {
  return (
    <Layout>
      <GlobalTools />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/channels/:slug" element={<Channel />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/resources" element={<Resources />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/signin" element={<SignIn />} />
      </Routes>
    </Layout>
  );
}
