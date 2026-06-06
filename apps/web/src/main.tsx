import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearSessionToken, setUnauthorizedHandler } from "@/lib/api";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

// Dead/expired session → drop the cached user + token, return to login.
setUnauthorizedHandler(() => {
  clearSessionToken();
  queryClient.setQueryData(["me"], null);
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
