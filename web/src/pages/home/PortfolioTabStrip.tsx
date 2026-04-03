import { useRef } from "react";
import { classNames } from "../../lib/css";
import { useSlidingUnderlineIndicator } from "../../lib/useSlidingUnderlineIndicator";

export type PortfolioSubTab = "distributions" | "holdings" | "transactions";

type PortfolioTabStripProps = {
  activeTab: PortfolioSubTab;
  onTabChange: (tab: PortfolioSubTab) => void;
};

export function PortfolioTabStrip({
  activeTab,
  onTabChange,
}: PortfolioTabStripProps) {
  const subTabListRef = useRef<HTMLDivElement>(null);
  const distributionsTabRef = useRef<HTMLButtonElement>(null);
  const holdingsTabRef = useRef<HTMLButtonElement>(null);
  const transactionsTabRef = useRef<HTMLButtonElement>(null);

  const subTabIndex =
    activeTab === "distributions" ? 0 : activeTab === "holdings" ? 1 : 2;

  const subTabIndicator = useSlidingUnderlineIndicator(
    subTabListRef,
    [distributionsTabRef, holdingsTabRef, transactionsTabRef],
    subTabIndex,
  );

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
      <button
        ref={distributionsTabRef}
        type="button"
        role="tab"
        id="portfolio-tab-distributions"
        aria-selected={activeTab === "distributions"}
        className={classNames(
          "page-subtab",
          activeTab === "distributions" && "page-subtab-active",
        )}
        onClick={() => onTabChange("distributions")}
      >
        Distributions
      </button>
      <button
        ref={holdingsTabRef}
        type="button"
        role="tab"
        id="portfolio-tab-holdings"
        aria-selected={activeTab === "holdings"}
        className={classNames(
          "page-subtab",
          activeTab === "holdings" && "page-subtab-active",
        )}
        onClick={() => onTabChange("holdings")}
      >
        Holdings
      </button>
      <button
        ref={transactionsTabRef}
        type="button"
        role="tab"
        id="portfolio-tab-transactions"
        aria-selected={activeTab === "transactions"}
        className={classNames(
          "page-subtab",
          activeTab === "transactions" && "page-subtab-active",
        )}
        onClick={() => onTabChange("transactions")}
      >
        Transactions
      </button>
    </div>
  );
}
