import { useMemo, useRef } from "react";
import { NavLink } from "react-router-dom";
import { classNames } from "../../lib/css";
import { useSlidingUnderlineIndicator } from "../../lib/useSlidingUnderlineIndicator";

export type PortfolioSubTab = "distributions" | "holdings" | "transactions";

type PortfolioTabStripProps = {
  activeTab: PortfolioSubTab;
  showTransactionsTab: boolean;
};

export function PortfolioTabStrip({
  activeTab,
  showTransactionsTab,
}: PortfolioTabStripProps) {
  const subTabListRef = useRef<HTMLDivElement>(null);
  const distributionsTabRef = useRef<HTMLAnchorElement>(null);
  const holdingsTabRef = useRef<HTMLAnchorElement>(null);
  const transactionsTabRef = useRef<HTMLAnchorElement>(null);

  const itemRefs = useMemo(
    () =>
      showTransactionsTab
        ? [distributionsTabRef, holdingsTabRef, transactionsTabRef]
        : [distributionsTabRef, holdingsTabRef],
    [showTransactionsTab],
  );

  const subTabIndex =
    activeTab === "distributions"
      ? 0
      : activeTab === "holdings"
        ? 1
        : showTransactionsTab
          ? 2
          : 0;

  const subTabIndicator = useSlidingUnderlineIndicator(
    subTabListRef,
    itemRefs,
    subTabIndex,
  );

  const subTabClass = ({ isActive }: { isActive: boolean }) =>
    classNames("page-subtab", isActive && "page-subtab-active");

  return (
    <div
      ref={subTabListRef}
      className="page-subtabs"
      role="tablist"
      aria-label="Portfolio sections"
    >
      {subTabIndicator != null && subTabIndicator.width > 0 ? (
        <div
          className="page-subtab-indicator"
          style={{
            left: subTabIndicator.left,
            width: subTabIndicator.width,
          }}
          aria-hidden
        />
      ) : null}
      <NavLink
        ref={distributionsTabRef}
        to="/portfolio/distributions"
        role="tab"
        id="portfolio-tab-distributions"
        aria-selected={activeTab === "distributions"}
        className={subTabClass}
      >
        Distributions
      </NavLink>
      <NavLink
        ref={holdingsTabRef}
        to="/portfolio/holdings"
        role="tab"
        id="portfolio-tab-holdings"
        aria-selected={activeTab === "holdings"}
        className={subTabClass}
      >
        Holdings
      </NavLink>
      {showTransactionsTab ? (
        <NavLink
          ref={transactionsTabRef}
          to="/portfolio/transactions"
          role="tab"
          id="portfolio-tab-transactions"
          aria-selected={activeTab === "transactions"}
          className={subTabClass}
        >
          Transactions
        </NavLink>
      ) : null}
    </div>
  );
}
