import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ConnectPage } from "./pages/ConnectPage";
import { HomePage } from "./pages/HomePage";
import { InsightsPage } from "./pages/InsightsPage";
import { ScrapsPage } from "./pages/ScrapsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="connect" element={<ConnectPage />} />
        <Route path="scraps" element={<ScrapsPage />} />
        <Route path="scraps/insights" element={<InsightsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
