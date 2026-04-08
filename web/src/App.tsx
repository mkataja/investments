import { useRef } from "react";
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
import { useSlidingUnderlineIndicator } from "./lib/useSlidingUnderlineIndicator";
import { BrokersPage } from "./pages/BrokersPage";
import { ImportPage } from "./pages/ImportPage";
import {
  EditInstrumentPage,
  NewInstrumentPage,
} from "./pages/InstrumentFormPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { InstrumentsPage } from "./pages/instruments/InstrumentsPage";

function navActiveIndex(pathname: string): number {
  if (pathname.startsWith("/portfolio") || pathname === "/") {
    return 0;
  }
  if (pathname.startsWith("/instruments")) {
    return 1;
  }
  if (pathname === "/brokers") {
    return 2;
  }
  return 0;
}

function AppShell() {
  const { pathname } = useLocation();
  const portfolioNavActive =
    pathname.startsWith("/portfolio") || pathname === "/";
  const navRef = useRef<HTMLElement>(null);
  const portfolioRef = useRef<HTMLAnchorElement>(null);
  const instrumentsRef = useRef<HTMLAnchorElement>(null);
  const brokersRef = useRef<HTMLAnchorElement>(null);
  const navIdx = navActiveIndex(pathname);
  const indicator = useSlidingUnderlineIndicator(
    navRef,
    [portfolioRef, instrumentsRef, brokersRef],
    navIdx,
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <nav
        ref={navRef}
        className="sticky top-0 z-20 flex gap-2 border-b border-slate-200 bg-white px-4 sm:px-6"
      >
        {indicator != null && indicator.width > 0 && (
          <div
            className="nav-bar-indicator"
            style={{
              left: indicator.left,
              width: indicator.width,
            }}
            aria-hidden
          />
        )}
        <Link
          ref={portfolioRef}
          to="/portfolio/distributions"
          className={classNames(
            "nav-bar-link",
            portfolioNavActive && "nav-bar-link-active",
          )}
        >
          Portfolio
        </Link>
        <NavLink
          ref={instrumentsRef}
          to="/instruments"
          className={({ isActive }) =>
            classNames("nav-bar-link", isActive && "nav-bar-link-active")
          }
        >
          Instruments
        </NavLink>
        <NavLink
          ref={brokersRef}
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
          <Route
            path="/"
            element={<Navigate to="/portfolio/distributions" replace />}
          />
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
          <Route
            path="/portfolio"
            element={<Navigate to="/portfolio/distributions" replace />}
          />
          <Route path="/portfolio/:section" element={<PortfolioPage />} />
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
