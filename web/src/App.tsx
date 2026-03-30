import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { BrokersPage } from "./pages/BrokersPage";
import { DevPage } from "./pages/DevPage";
import { EditInstrumentPage } from "./pages/EditInstrumentPage";
import { HomePage } from "./pages/HomePage";
import { ImportPage } from "./pages/ImportPage";
import { InstrumentsPage } from "./pages/InstrumentsPage";
import { NewInstrumentPage } from "./pages/NewInstrumentPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <nav className="border-b border-slate-200 bg-white px-4 sm:px-6 py-3 flex gap-6 text-sm font-medium">
          <Link to="/" className="text-emerald-800 hover:underline">
            Portfolio
          </Link>
          <Link to="/instruments" className="text-emerald-800 hover:underline">
            Instruments
          </Link>
          <Link to="/brokers" className="text-emerald-800 hover:underline">
            Brokers
          </Link>
          <Link to="/settings" className="text-emerald-800 hover:underline">
            Settings
          </Link>
          <Link to="/dev" className="text-emerald-800 hover:underline">
            Data checks
          </Link>
        </nav>
        <main className="w-full min-w-0 px-4 sm:px-6 py-6">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/instruments" element={<InstrumentsPage />} />
            <Route path="/instruments/new" element={<NewInstrumentPage />} />
            <Route
              path="/instruments/:id/edit"
              element={<EditInstrumentPage />}
            />
            <Route path="/brokers" element={<BrokersPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/dev" element={<DevPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
