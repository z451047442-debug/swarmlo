import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import Index from "./pages/Index";
import { Toaster } from "./components/ui/toaster";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

interface WidgetConfig {
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  cardBackgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  defaultGoal?: string;
}

declare global {
  interface Window {
    SwarmloResearchWidgetConfig?: WidgetConfig;
    SwarmloResearchWidget?: {
      init: (containerId?: string) => void;
      version: string;
    };
  }
}

/**
 * "#rrggbb" / "#rgb" → "h s% l%" HSL 三元组。
 * 设计系统的颜色类（如 text-primary）走 hsl(var(--primary))，
 * 因此注入 hex 时必须同步生成三元组，否则第三方嵌入时 primary 类全部失效。
 */
function hexToHslTriplet(hex: string): string {
  let m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) {
    const short = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
    if (!short) return "";
    m = ["", ...short.slice(1).map((ch) => ch + ch)];
  }
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** hex 直接注入 + 同步生成 hsl 三元组，两套消费方式都有效 */
function applyWidgetColor(container: HTMLElement, property: string, hslProperty: string, value: string | undefined): void {
  if (!value) return;
  container.style.setProperty(property, value);
  const triplet = hexToHslTriplet(value);
  if (triplet) container.style.setProperty(hslProperty, triplet);
}

// Widget initialization function
function initSwarmloResearchWidget(containerId: string = "swarmlo-research-widget-container"): void {
  console.log("[Swarmlo Research] Starting initialization...");

  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`[Swarmlo Research] Container with id "${containerId}" not found`);
    return;
  }

  console.log("[Swarmlo Research] Container found:", containerId);

  // Apply widget config if provided
  const config = window.SwarmloResearchWidgetConfig;
  if (config) {
    console.log("[Swarmlo Research] Applying configuration:", config);
    applyWidgetColor(container, "--primary", "--primary-hsl", config.primaryColor);
    applyWidgetColor(container, "--accent", "--accent-hsl", config.accentColor);
    applyWidgetColor(container, "--background", "--background-hsl", config.backgroundColor);
    applyWidgetColor(container, "--card", "--card-hsl", config.cardBackgroundColor);
    applyWidgetColor(container, "--foreground", "--foreground-hsl", config.textColor);
    if (config.fontFamily) container.style.fontFamily = config.fontFamily;
  }

  try {
    const root = createRoot(container);
    root.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(
          BrowserRouter,
          null,
          React.createElement(
            QueryClientProvider,
            { client: queryClient },
            React.createElement(Index, { defaultGoal: config?.defaultGoal }),
            React.createElement(Toaster, null)
          )
        )
      )
    );

    console.log("[Swarmlo Research] ✅ Successfully initialized and rendered");
  } catch (error) {
    console.error("[Swarmlo Research] ❌ Initialization error:", error);
  }
}

// Auto-initialize on DOM ready
function autoInit(): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      console.log("[Swarmlo Research] DOM ready, auto-initializing...");
      initSwarmloResearchWidget();
    });
  } else {
    console.log("[Swarmlo Research] DOM already loaded, initializing...");
    // Use setTimeout to ensure script has fully loaded
    setTimeout(() => initSwarmloResearchWidget(), 0);
  }
}

// Initialize only in browser environment
if (typeof window !== "undefined") {
  // Expose global API
  window.SwarmloResearchWidget = {
    init: initSwarmloResearchWidget,
    version: "1.0.0",
  };
  
  console.log("[Swarmlo Research] API exposed on window.SwarmloResearchWidget");
  
  // Auto-initialize
  autoInit();
}

export default initSwarmloResearchWidget;
