import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { createAppRouter } from "@/routes/router";
import "@/styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing from index.html");

const { router, queryClient } = createAppRouter();

createRoot(root).render(
  <StrictMode>
    <App router={router} queryClient={queryClient} />
  </StrictMode>,
);
