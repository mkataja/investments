import { Link, useParams } from "react-router-dom";
import { ButtonLink } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";
import { CashAccountFormFields } from "../components/instrumentForm/CashAccountFormFields";
import { EditInstrumentMode } from "../components/instrumentForm/EditInstrumentMode";
import { InstrumentKindPicker } from "../components/instrumentForm/InstrumentKindPicker";
import { NewCommoditySection } from "../components/instrumentForm/NewCommoditySection";
import { NewCustomSeligsonSection } from "../components/instrumentForm/NewCustomSeligsonSection";
import { NewYahooEtfStockSection } from "../components/instrumentForm/NewYahooEtfStockSection";
import type { InstrumentFormPageProps } from "../components/instrumentForm/types";
import { useInstrumentFormPage } from "../components/instrumentForm/useInstrumentFormPage";

function InstrumentFormPage(props: InstrumentFormPageProps) {
  const f = useInstrumentFormPage(props);

  if (f.mode === "edit") {
    return (
      <EditInstrumentMode
        initial={f.initial}
        error={f.error}
        holdingsDistributionUrl={f.holdingsDistributionUrl}
        setHoldingsDistributionUrl={f.setHoldingsDistributionUrl}
        providerBreakdownDataUrl={f.providerBreakdownDataUrl}
        setProviderBreakdownDataUrl={f.setProviderBreakdownDataUrl}
        submitEditEtfStock={f.submitEditEtfStock}
        submitEditCommodity={f.submitEditCommodity}
        submitEditCash={f.submitEditCash}
        onClearUrlError={() => f.setError(null)}
        brokersLoading={f.brokersLoading}
        cashBrokers={f.cashBrokers}
        cashBrokerId={f.cashBrokerId}
        setCashBrokerId={f.setCashBrokerId}
        cashDisplayName={f.cashDisplayName}
        setCashDisplayName={f.setCashDisplayName}
        cashCurrency={f.cashCurrency}
        setCashCurrency={f.setCashCurrency}
        cashGeoKey={f.cashGeoKey}
        setCashGeoKey={f.setCashGeoKey}
        commoditySector={f.commoditySector}
        setCommoditySector={f.setCommoditySector}
        commodityCountryIso={f.commodityCountryIso}
        setCommodityCountryIso={f.setCommodityCountryIso}
      />
    );
  }

  return (
    <div className="page-form-max page-stack">
      <header className="page-header-stack">
        <Link to="/instruments" className="action-link">
          ← Instruments
        </Link>
        <h1>New instrument</h1>
        {f.error ? <ErrorAlert>{f.error}</ErrorAlert> : null}
      </header>

      <form onSubmit={(e) => void f.submitNew(e)} className="page-stack">
        <InstrumentKindPicker
          kind={f.kind}
          onKindChange={(value) => {
            f.setKind(value);
            f.setError(null);
            f.setYahooPreviewError(null);
          }}
        />

        {f.kind === "etf" || f.kind === "stock" ? (
          <NewYahooEtfStockSection
            kind={f.kind}
            yahooSymbol={f.yahooSymbol}
            setYahooSymbol={(v) => {
              f.setYahooSymbol(v);
              f.setYahooPreviewError(null);
            }}
            yahooSymbolInputRef={f.yahooSymbolInputRef}
            onPreviewYahoo={f.previewYahoo}
            holdingsDistributionUrl={f.holdingsDistributionUrl}
            setHoldingsDistributionUrl={f.setHoldingsDistributionUrl}
            providerBreakdownDataUrl={f.providerBreakdownDataUrl}
            setProviderBreakdownDataUrl={f.setProviderBreakdownDataUrl}
            yahooPreview={f.yahooPreview}
            yahooPreviewError={f.yahooPreviewError}
          />
        ) : null}

        {f.kind === "commodity" ? (
          <NewCommoditySection
            yahooSymbol={f.yahooSymbol}
            setYahooSymbol={(v) => {
              f.setYahooSymbol(v);
              f.setYahooPreviewError(null);
            }}
            yahooSymbolInputRef={f.yahooSymbolInputRef}
            onPreviewYahoo={f.previewYahoo}
            commoditySector={f.commoditySector}
            setCommoditySector={f.setCommoditySector}
            commodityCountryIso={f.commodityCountryIso}
            setCommodityCountryIso={f.setCommodityCountryIso}
            yahooPreview={f.yahooPreview}
            yahooPreviewError={f.yahooPreviewError}
          />
        ) : null}

        {f.kind === "custom" ? (
          <NewCustomSeligsonSection
            brokersLoading={f.brokersLoading}
            seligsonBrokers={f.seligsonBrokers}
            customBrokerId={f.customBrokerId}
            setCustomBrokerId={f.setCustomBrokerId}
            seligsonFid={f.seligsonFid}
            setSeligsonFid={f.setSeligsonFid}
            seligsonFidInputRef={f.seligsonFidInputRef}
            useCompositeAllocation={f.useCompositeAllocation}
            setUseCompositeAllocation={f.setUseCompositeAllocation}
            compositeTableUrl={f.compositeTableUrl}
            setCompositeTableUrl={f.setCompositeTableUrl}
            compositeTableUrlInputRef={f.compositeTableUrlInputRef}
            onLoadComposition={() => void f.loadCompositeComposition()}
            compositionLoading={f.compositionLoading}
            compositePreview={f.compositePreview}
            compositeFundDisplayName={f.compositeFundDisplayName}
            setCompositeFundDisplayName={f.setCompositeFundDisplayName}
            compositeSelectionByRow={f.compositeSelectionByRow}
            onCompositeSelectionChange={(rowIndex, value) => {
              f.setCompositeSelectionByRow((prev) => ({
                ...prev,
                [rowIndex]: value,
              }));
            }}
            instrumentOptionsForComposite={f.instrumentOptionsForComposite}
            onConfirmCompositeAllocation={() => void f.confirmCompositeCreate()}
            confirmCompositeDisabled={
              f.compositePreview == null ||
              f.compositePreview.rows.length === 0 ||
              f.compositeFundDisplayName.trim() === "" ||
              f.compositePreview.rows.some((_, i) => {
                const v = f.compositeSelectionByRow[i];
                return v == null || v === "";
              })
            }
            onClearCompositeAllocation={f.clearCompositeAllocationState}
          />
        ) : null}

        {f.kind === "cash_account" ? (
          <CashAccountFormFields
            brokersLoading={f.brokersLoading}
            cashBrokers={f.cashBrokers}
            cashBrokerId={f.cashBrokerId}
            setCashBrokerId={f.setCashBrokerId}
            cashDisplayName={f.cashDisplayName}
            setCashDisplayName={f.setCashDisplayName}
            cashDisplayNameInputRef={f.cashDisplayNameInputRef}
            cashCurrency={f.cashCurrency}
            setCashCurrency={f.setCashCurrency}
            cashGeoKey={f.cashGeoKey}
            setCashGeoKey={f.setCashGeoKey}
          />
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={
              !f.kind ||
              (f.brokersLoading &&
                (f.kind === "custom" || f.kind === "cash_account")) ||
              (f.kind === "custom" && f.useCompositeAllocation)
            }
            className="button-primary"
          >
            Create instrument
          </button>
          <Link to="/instruments" className="button-cancel">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

export function NewInstrumentPage() {
  return <InstrumentFormPage mode="new" />;
}

export function EditInstrumentPage() {
  const { id: idParam } = useParams();
  const id = Number.parseInt(idParam ?? "", 10);

  if (!Number.isFinite(id) || id < 1) {
    return (
      <div className="page-form-max page-section">
        <ErrorAlert>Invalid instrument id.</ErrorAlert>
        <ButtonLink to="/instruments">Back to instruments</ButtonLink>
      </div>
    );
  }

  return <InstrumentFormPage mode="edit" instrumentId={id} />;
}
