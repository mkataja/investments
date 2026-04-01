import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { BrokersPage } from "./pages/BrokersPage";
import { HomePage } from "./pages/HomePage";
import { ImportPage } from "./pages/ImportPage";
import {
  EditInstrumentPage,
  NewInstrumentPage,
} from "./pages/InstrumentFormPage";
import { InstrumentsPage } from "./pages/InstrumentsPage";

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <nav className="flex gap-6 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <Link to="/" className="nav-bar-link">
            Portfolio
          </Link>
          <Link to="/instruments" className="nav-bar-link">
            Instruments
          </Link>
          <Link to="/brokers" className="nav-bar-link">
            Brokers
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
            <Route path="/import" element={<ImportPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
