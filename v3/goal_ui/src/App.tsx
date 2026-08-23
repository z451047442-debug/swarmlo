import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useI18n } from "@/i18n";
import Index from "./pages/Index";
import Demo from "./pages/Demo";
import Agents from "./pages/Agents";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const { lang, setLang } = useI18n();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/demo" element={<Demo />} />
            <Route path="/agents" element={<Agents />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <button
          onClick={() => setLang(lang === "en" ? "zh" : "en")}
          aria-label="切换语言 / Toggle language"
          className="fixed top-3 right-3 z-[100] rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80"
          style={{
            backgroundColor: "rgba(26, 26, 26, 0.85)",
            borderColor: "rgba(139, 92, 246, 0.5)",
            color: "#f5f5f5",
          }}
        >
          {lang === "en" ? "中文" : "EN"}
        </button>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
