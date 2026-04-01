import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./lib/chart/registerChartJs";
import "./css/index.css";
import "react-loading-skeleton/dist/skeleton.css";

const el = document.getElementById("root");
if (!el) {
  throw new Error("root element missing");
}

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
