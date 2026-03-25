import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { SeligsonAdmin } from "./admin/SeligsonAdmin";
import { DevPage } from "./pages/DevPage";
import { HomePage } from "./pages/HomePage";

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <nav className="border-b border-slate-200 bg-white px-6 py-3 flex gap-6 text-sm font-medium">
          <Link to="/" className="text-emerald-800 hover:underline">
            Portfolio
          </Link>
          <Link to="/admin" className="text-emerald-800 hover:underline">
            Seligson funds admin
          </Link>
          <Link to="/dev" className="text-emerald-800 hover:underline">
            Data checks
          </Link>
        </nav>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin/*" element={<SeligsonAdmin />} />
          <Route path="/dev" element={<DevPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
