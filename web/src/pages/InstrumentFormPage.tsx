import type { KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ButtonLink } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { CashAccountFormFields } from "../components/instrumentForm/CashAccountFormFields";
import { EditInstrumentMode } from "../components/instrumentForm/EditInstrumentMode";
import { InstrumentKindPicker } from "../components/instrumentForm/InstrumentKindPicker";
import { NewCommoditySection } from "../components/instrumentForm/NewCommoditySection";
import { NewCustomSeligsonSection } from "../components/instrumentForm/NewCustomSeligsonSection";
import { NewYahooEtfStockSection } from "../components/instrumentForm/NewYahooEtfStockSection";
import type { InstrumentFormPageProps } from "../components/instrumentForm/types";
import { useInstrumentFormPage } from "../components/instrumentForm/useInstrumentFormPage";

function preventEnterFromSubmittingForm(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== "Enter") {
    return;
  }
  const t = e.target;
  if (t === e.currentTarget) {
    return;
  }
  if (t instanceof HTMLButtonElement && t.type === "submit") {
    return;
  }
  if (t instanceof HTMLInputElement && t.type !== "submit") {
    e.preventDefault();
  }
  if (t instanceof HTMLSelectElement) {
    e.preventDefault();
  }
}

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

      <form
        onSubmit={(e) => void f.submitNew(e)}
        onKeyDown={preventEnterFromSubmittingForm}
        className="page-stack"
        aria-busy={f.mode === "new" && f.createSubmitting}
      >
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
            seligsonFundPageUrl={f.seligsonFundPageUrl}
            setSeligsonFundPageUrl={f.setSeligsonFundPageUrl}
            seligsonFundPageUrlInputRef={f.seligsonFundPageUrlInputRef}
            seligsonCompositePreview={f.seligsonCompositePreview}
            seligsonCompositePreviewLoading={f.seligsonCompositePreviewLoading}
            seligsonCompositePreviewError={f.seligsonCompositePreviewError}
            seligsonCompositeMappedRows={f.seligsonCompositeMappedRows}
            setSeligsonCompositeMappedRows={f.setSeligsonCompositeMappedRows}
            seligsonCompositeInstrumentOptions={
              f.seligsonCompositeInstrumentOptions
            }
            seligsonCompositeInstrumentOptionsLoading={
              f.seligsonCompositeInstrumentOptionsLoading
            }
            seligsonCompositeInstrumentOptionsError={
              f.seligsonCompositeInstrumentOptionsError
            }
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
              f.createSubmitting ||
              !f.kind ||
              (f.brokersLoading &&
                (f.kind === "custom" || f.kind === "cash_account")) ||
              (f.kind === "custom" && !f.canSubmitCustomSeligson)
            }
            className="button-primary gap-2"
            aria-busy={f.createSubmitting}
          >
            {f.createSubmitting ? (
              <>
                <LoadingSpinner
                  decorative
                  className="h-4 w-4 shrink-0 text-white"
                />
                <span>Creating...</span>
              </>
            ) : (
              "Create instrument"
            )}
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
