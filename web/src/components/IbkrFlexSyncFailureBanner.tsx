import { Link } from "react-router-dom";
import { useIbkrFlexSyncStatus } from "../lib/ibkrFlexSyncStatus";
import { routes } from "../routes";

export function IbkrFlexSyncFailureBanner() {
  const { status } = useIbkrFlexSyncStatus();
  const lastError = status?.lastError ?? null;
  if (lastError === null) {
    return null;
  }
  return (
    <div role="alert" className="banner-error">
      IBKR sync failed: {lastError.message}{" "}
      <Link to={routes.portfolio.import} className="underline">
        Open import
      </Link>
    </div>
  );
}
