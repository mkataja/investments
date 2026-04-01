import { Button, ButtonLink } from "../../components/Button";
import { ErrorAlert } from "../../components/ErrorAlert";
import { InstrumentsTableSkeleton } from "../../components/listPageSkeletons";
import { InstrumentsTable } from "./InstrumentsTable";
import { useInstrumentsList } from "./useInstrumentsList";

export function InstrumentsPage() {
  const {
    initialLoad,
    error,
    notice,
    sortedRows,
    refreshingIds,
    refreshingAll,
    deletingId,
    refreshableCount,
    refreshDistribution,
    refreshAllDistributions,
    removeInstrument,
  } = useInstrumentsList();

  return (
    <div className="w-full min-w-0 page-stack">
      <header className="flex flex-wrap items-center justify-between gap-3 page-header-sticky">
        <h1>Instruments</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={
              initialLoad ||
              refreshableCount === 0 ||
              refreshingAll ||
              refreshingIds.size > 0 ||
              deletingId !== null
            }
            onClick={() => void refreshAllDistributions()}
          >
            {refreshingAll ? "Refreshing all..." : "Refresh all"}
          </Button>
          <ButtonLink to="/instruments/new">New instrument</ButtonLink>
        </div>
      </header>

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}

      {notice ? <p className="banner-notice">{notice}</p> : null}

      {initialLoad ? (
        <InstrumentsTableSkeleton />
      ) : (
        <InstrumentsTable
          sortedRows={sortedRows}
          error={error}
          refreshingIds={refreshingIds}
          refreshingAll={refreshingAll}
          deletingId={deletingId}
          onRefreshRow={refreshDistribution}
          onDelete={removeInstrument}
        />
      )}
    </div>
  );
}
