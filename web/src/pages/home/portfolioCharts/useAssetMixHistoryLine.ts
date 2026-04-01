import type { ChartData, ChartOptions } from "chart.js";
import { useMemo } from "react";
import type { AssetMixHistoryPoint } from "../types";

export function useAssetMixHistoryLine(points: AssetMixHistoryPoint[]) {
  return useMemo(() => {
    const data: ChartData<"line"> = {
      labels: points.map((p) => p.date),
      datasets: [
        {
          label: "Equities",
          data: points.map((p) => p.equitiesEur),
          borderColor: "rgb(30 64 175)",
          backgroundColor: "rgba(30, 64, 175, 0.15)",
          tension: 0.15,
          fill: false,
        },
        {
          label: "Cash",
          data: points.map((p) => p.cashEur),
          borderColor: "rgb(21 128 61)",
          backgroundColor: "rgba(21, 128, 61, 0.12)",
          tension: 0.15,
          fill: false,
        },
      ],
    };
    const formatEur = (n: number) =>
      `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} EUR`;
    const options: ChartOptions<"line"> = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { maxRotation: 45, minRotation: 0 },
        },
        y: {
          min: 0,
          ticks: {
            callback: (tickValue) => {
              const v =
                typeof tickValue === "number" ? tickValue : Number(tickValue);
              if (!Number.isFinite(v)) {
                return "";
              }
              if (v >= 1_000_000) {
                return `${(v / 1_000_000).toFixed(1)}M`;
              }
              if (v >= 1000) {
                return `${(v / 1000).toFixed(0)}k`;
              }
              return String(v);
            },
          },
        },
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const n = ctx.parsed.y;
              if (typeof n !== "number" || !Number.isFinite(n)) {
                return ctx.dataset.label ?? "";
              }
              return `${ctx.dataset.label ?? ""}: ${formatEur(n)}`;
            },
          },
        },
      },
    };
    return { data, options };
  }, [points]);
}
