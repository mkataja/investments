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
import {
  pathnameIsUnderInstruments,
  pathnameIsUnderPortfolio,
  pattern,
  routes,
} from "./routes";

function navActiveIndex(pathname: string): number {
  if (pathnameIsUnderPortfolio(pathname)) {
    return 0;
  }
  if (pathnameIsUnderInstruments(pathname)) {
    return 1;
  }
  if (pathname === routes.brokers) {
    return 2;
  }
  return 0;
}

function AppShell() {
  const { pathname } = useLocation();
  const portfolioNavActive = pathnameIsUnderPortfolio(pathname);
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
          to={routes.portfolio.distributions}
          className={classNames(
            "nav-bar-link",
            portfolioNavActive && "nav-bar-link-active",
          )}
        >
          Portfolio
        </Link>
        <NavLink
          ref={instrumentsRef}
          to={routes.instruments.list}
          className={({ isActive }) =>
            classNames("nav-bar-link", isActive && "nav-bar-link-active")
          }
        >
          Instruments
        </NavLink>
        <NavLink
          ref={brokersRef}
          to={routes.brokers}
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
            path={pattern.root}
            element={<Navigate to={routes.portfolio.distributions} replace />}
          />
          <Route path={pattern.instrumentsList} element={<InstrumentsPage />} />
          <Route
            path={pattern.instrumentsNew}
            element={<NewInstrumentPage />}
          />
          <Route
            path={pattern.instrumentEdit}
            element={<EditInstrumentPage />}
          />
          <Route path={pattern.brokers} element={<BrokersPage />} />
          <Route path={pattern.portfolioImport} element={<ImportPage />} />
          <Route
            path={pattern.importLegacy}
            element={<Navigate to={routes.portfolio.import} replace />}
          />
          <Route
            path={pattern.portfolioIndex}
            element={<Navigate to={routes.portfolio.distributions} replace />}
          />
          <Route path={pattern.portfolioSection} element={<PortfolioPage />} />
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
