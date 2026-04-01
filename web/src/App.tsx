import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { classNames } from "./lib/css";
import { BrokersPage } from "./pages/BrokersPage";
import { HomePage } from "./pages/HomePage";
import { ImportPage } from "./pages/ImportPage";
import {
  EditInstrumentPage,
  NewInstrumentPage,
} from "./pages/InstrumentFormPage";
import { InstrumentsPage } from "./pages/InstrumentsPage";

function AppShell() {
  const { pathname } = useLocation();
  const portfolioNavActive =
    pathname === "/" || pathname.startsWith("/portfolio");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <nav className="flex gap-2 border-b border-slate-200 bg-white px-4 sm:px-6">
        <Link
          to="/"
          className={classNames(
            "nav-bar-link",
            portfolioNavActive && "nav-bar-link-active",
          )}
        >
          Portfolio
        </Link>
        <NavLink
          to="/instruments"
          className={({ isActive }) =>
            classNames("nav-bar-link", isActive && "nav-bar-link-active")
          }
        >
          Instruments
        </NavLink>
        <NavLink
          to="/brokers"
          end
          className={({ isActive }) =>
            classNames("nav-bar-link", isActive && "nav-bar-link-active")
          }
        >
          Brokers
        </NavLink>
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
          <Route path="/portfolio/import" element={<ImportPage />} />
          <Route
            path="/import"
            element={<Navigate to="/portfolio/import" replace />}
          />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
