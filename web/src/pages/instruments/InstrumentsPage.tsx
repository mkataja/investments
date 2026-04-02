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
    refreshAllProgress,
    backfillAllProgress,
    deletingId,
    refreshableCount,
    refreshDistribution,
    refreshAllDistributions,
    backfillAllYahooPrices,
    backfillingAll,
    backfillingInstrumentId,
    yahooBackfillableCount,
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
              yahooBackfillableCount === 0 ||
              backfillingAll ||
              refreshingAll ||
              refreshingIds.size > 0 ||
              deletingId !== null
            }
            onClick={() => void backfillAllYahooPrices()}
          >
            {backfillingAll
              ? `${backfillAllProgress?.done ?? 0}/${backfillAllProgress?.total ?? 0} backfilled`
              : "Backfill Yahoo prices"}
          </Button>
          <Button
            disabled={
              initialLoad ||
              refreshableCount === 0 ||
              refreshingAll ||
              backfillingAll ||
              refreshingIds.size > 0 ||
              deletingId !== null
            }
            onClick={() => void refreshAllDistributions()}
          >
            {refreshingAll
              ? `${refreshAllProgress?.done ?? 0}/${refreshAllProgress?.total ?? 0} refreshed`
              : "Refresh all"}
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
          backfillingAll={backfillingAll}
          backfillingInstrumentId={backfillingInstrumentId}
          deletingId={deletingId}
          onRefreshRow={refreshDistribution}
          onDelete={removeInstrument}
        />
      )}
    </div>
  );
}
