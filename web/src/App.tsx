import { useCallback, useLayoutEffect, useRef, useState } from "react";
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
import { InstrumentsPage } from "./pages/instruments";

function navActiveIndex(pathname: string): number {
  if (pathname === "/" || pathname.startsWith("/portfolio")) {
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
    pathname === "/" || pathname.startsWith("/portfolio");
  const navRef = useRef<HTMLElement>(null);
  const portfolioRef = useRef<HTMLAnchorElement>(null);
  const instrumentsRef = useRef<HTMLAnchorElement>(null);
  const brokersRef = useRef<HTMLAnchorElement>(null);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);

  const updateIndicator = useCallback(() => {
    const nav = navRef.current;
    const refs = [portfolioRef, instrumentsRef, brokersRef];
    const idx = navActiveIndex(pathname);
    const el = refs[idx]?.current;
    if (!nav || !el) {
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setIndicator({
      left: elRect.left - navRect.left,
      width: elRect.width,
    });
  }, [pathname]);

  useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) {
      return;
    }
    const ro = new ResizeObserver(() => {
      updateIndicator();
    });
    ro.observe(nav);
    window.addEventListener("resize", updateIndicator);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateIndicator);
    };
  }, [updateIndicator]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <nav
        ref={navRef}
        className="relative flex gap-2 border-b border-slate-200 bg-white px-4 sm:px-6"
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
          to="/"
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
