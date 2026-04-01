import type { ComponentPropsWithRef } from "react";

const PORTFOLIO_EMERGENCY_FUND_NOTE =
  "Emergency fund is the part of your savings you treat as reserved — not as portfolio investments. The asset mix considers only the cash above the emergency fund buffer as cash assets.";

export function PortfolioFormDivider() {
  return <hr className="border-slate-200 w-full" />;
}

type PortfolioFormNameFieldProps = {
  name: string;
  onNameChange: (value: string) => void;
  inputRef?: ComponentPropsWithRef<"input">["ref"];
};

export function PortfolioFormNameField({
  name,
  onNameChange,
  inputRef,
}: PortfolioFormNameFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="block text-sm">
        Name
        <input
          ref={inputRef}
          className="mt-1 block w-full border border-slate-300 rounded px-2 py-1"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          autoComplete="off"
        />
      </label>
    </div>
  );
}

type PortfolioFormEmergencyFundBlockProps = {
  value: string;
  onChange: (value: string) => void;
};

export function PortfolioFormEmergencyFundBlock({
  value,
  onChange,
}: PortfolioFormEmergencyFundBlockProps) {
  return (
    <>
      <PortfolioFormDivider />
      <div className="field-note-stack gap-2">
        <label className="block text-sm">
          Emergency fund (EUR)
          <input
            className="mt-1 block w-full border border-slate-300 rounded px-2 py-1 tabular-nums"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
        <p className="text-sm text-slate-600 leading-relaxed">
          {PORTFOLIO_EMERGENCY_FUND_NOTE}
        </p>
      </div>
    </>
  );
}

type PortfolioFormBenchmarkTotalFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

export function PortfolioFormBenchmarkTotalField({
  value,
  onChange,
}: PortfolioFormBenchmarkTotalFieldProps) {
  return (
    <label className="block text-sm max-w-xs">
      Synthetic portfolio value total value (EUR)
      <input
        className="mt-1 block w-full border border-slate-300 rounded px-2 py-1 tabular-nums"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
