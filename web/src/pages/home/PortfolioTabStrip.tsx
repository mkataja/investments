import { useRef } from "react";
import { NavLink } from "react-router-dom";
import { classNames } from "../../lib/css";
import { useSlidingUnderlineIndicator } from "../../lib/useSlidingUnderlineIndicator";
import { type PortfolioSection, routes } from "../../routes";

type PortfolioTabStripProps = {
  activeTab: PortfolioSection;
};

export function PortfolioTabStrip({ activeTab }: PortfolioTabStripProps) {
  const subTabListRef = useRef<HTMLDivElement>(null);
  const distributionsTabRef = useRef<HTMLAnchorElement>(null);
  const holdingsTabRef = useRef<HTMLAnchorElement>(null);
  const transactionsTabRef = useRef<HTMLAnchorElement>(null);

  const itemRefs = [
    distributionsTabRef,
    holdingsTabRef,
    transactionsTabRef,
  ] as const;

  const subTabIndex =
    activeTab === "distributions" ? 0 : activeTab === "holdings" ? 1 : 2;

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
        to={routes.portfolio.distributions}
        role="tab"
        id="portfolio-tab-distributions"
        aria-selected={activeTab === "distributions"}
        className={subTabClass}
      >
        Distributions
      </NavLink>
      <NavLink
        ref={holdingsTabRef}
        to={routes.portfolio.holdings}
        role="tab"
        id="portfolio-tab-holdings"
        aria-selected={activeTab === "holdings"}
        className={subTabClass}
      >
        Holdings
      </NavLink>
      <NavLink
        ref={transactionsTabRef}
        to={routes.portfolio.transactions}
        role="tab"
        id="portfolio-tab-transactions"
        aria-selected={activeTab === "transactions"}
        className={subTabClass}
      >
        Transactions
      </NavLink>
    </div>
  );
}
