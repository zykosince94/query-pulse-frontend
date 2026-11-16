import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import {
  ADMIN_USER,
  BAD_KEY,
  backend,
  DEMO_USER,
  makeAnswer,
  makeFinding,
  makeSource,
  server,
} from "./fake-backend";
import { renderApp } from "./render-app";

function seed(user = ADMIN_USER) {
  backend.session = user;
  backend.sources = [makeSource({ id: 1 })];
  backend.findings = [makeFinding({ id: 1 })];
}

function aiOn() {
  backend.ai = {
    ...backend.ai,
    enabled: true,
    provider: "openai",
    model: "test-model",
    key_set: true,
    key_hint: "…a1b2",
  };
}

async function openPanel(user: ReturnType<typeof renderApp>["user"]) {
  await user.click(await screen.findByRole("button", { name: "AI assistant" }));
  return screen.findByRole("region", { name: "AI assistant answers" });
}

describe("Settings (Phase 7)", () => {
  it("shows AI off by default and the read-only collection settings", async () => {
    seed();
    renderApp("/settings");
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(await screen.findByText("Off")).toBeInTheDocument();
    expect(
      screen.getByText("Requests made by this server since it started: 0"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Collection interval")).toBeInTheDocument();
    expect(screen.getByText("14 days")).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toHaveAttribute("type", "password");
  });

  it("turns AI on with a key, which is then shown only by its last four characters", async () => {
    seed();
    const { user } = renderApp("/settings");
    await user.type(await screen.findByLabelText("Model"), "test-model");
    await user.type(screen.getByLabelText("API key"), "sk-live-key-9z8y");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved. AI is on.")).toBeInTheDocument();
    expect(screen.getByText("On")).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toHaveValue("");
    expect(screen.getByText(/A key ending …9z8y is saved, encrypted/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("sk-live-key-9z8y");
  });

  it("explains a refused key and saves nothing", async () => {
    seed();
    const { user } = renderApp("/settings");
    await user.type(await screen.findByLabelText("Model"), "test-model");
    await user.type(screen.getByLabelText("API key"), BAD_KEY);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Not saved: OpenAI rejected the API key/)).toBeInTheDocument();
    expect(backend.ai.key_set).toBe(false);
  });

  it("deletes the saved key, which turns AI off", async () => {
    seed();
    aiOn();
    const { user } = renderApp("/settings");
    await user.click(await screen.findByRole("button", { name: "Delete the key" }));
    expect(await screen.findByText("Off")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete the key" })).not.toBeInTheDocument();
  });

  it("is read-only for the demo user", async () => {
    seed(DEMO_USER);
    aiOn();
    renderApp("/settings");
    expect(await screen.findByText("The demo user can't change settings.")).toBeInTheDocument();
    expect(screen.getByLabelText("Model")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("shows an error when the settings can't load", async () => {
    seed();
    server.use(
      http.get("/api/ai/settings", () => HttpResponse.json({ detail: "nope" }, { status: 403 })),
    );
    renderApp("/settings");
    expect(await screen.findByText(/Couldn't load AI settings: nope/)).toBeInTheDocument();
  });
});

describe("the AI panel on a finding", () => {
  it("says AI is off, links to Settings, and makes no request (QP-AC-26)", async () => {
    seed();
    const { user } = renderApp("/findings");
    const panel = await openPanel(user);
    expect(await within(panel).findByText(/AI is off/)).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.queryByRole("button", { name: "Explain this finding" })).not.toBeInTheDocument();
    expect(backend.aiRequests).toBe(0);
  });

  it("explains with cited claims and marks the answer advisory", async () => {
    seed();
    aiOn();
    const { user } = renderApp("/findings");
    await openPanel(user);
    await user.click(await screen.findByRole("button", { name: "Explain this finding" }));
    expect(
      await screen.findByText("Every lookup by customer reads all 200,000 orders."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("plan:0").length).toBeGreaterThan(0);
    expect(screen.getByText(/^Advisory\./)).toBeInTheDocument();
    expect(screen.getByText(/openai · test-model/)).toBeInTheDocument();
  });

  it("drafts a fix to copy, never to run", async () => {
    seed();
    aiOn();
    const { user } = renderApp("/findings");
    const panel = await openPanel(user);
    await user.click(await within(panel).findByRole("button", { name: "Draft a fix" }));
    expect(
      await within(panel).findByText("CREATE INDEX CONCURRENTLY ON public.orders (customer_id);"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy the drafted SQL" })).toBeInTheDocument();
    expect(screen.getByText("A draft for review. Query Pulse never runs it.")).toBeInTheDocument();
  });

  it("shows a rejected answer as an error, not as advice (QP-AC-27)", async () => {
    seed();
    aiOn();
    backend.aiMode = "rejected";
    const { user } = renderApp("/findings");
    await openPanel(user);
    await user.click(await screen.findByRole("button", { name: "Explain this finding" }));
    expect(await screen.findByText("Explanation: the answer was discarded.")).toBeInTheDocument();
    expect(screen.getByText(/cited evidence that wasn't sent \(plan:9.9\)/)).toBeInTheDocument();
  });

  it("flags claims without evidence", async () => {
    seed();
    aiOn();
    backend.aiMode = "uncited";
    const { user } = renderApp("/findings");
    await openPanel(user);
    await user.click(await screen.findByRole("button", { name: "Explain this finding" }));
    const claim = (await screen.findByText("It will be fast afterwards.")).closest(
      "li",
    ) as HTMLElement;
    expect(within(claim).getByText("Not backed by evidence")).toBeInTheDocument();
  });

  it("shows a provider error", async () => {
    seed();
    aiOn();
    backend.aiMode = "error";
    const { user } = renderApp("/findings");
    await openPanel(user);
    await user.click(await screen.findByRole("button", { name: "Explain this finding" }));
    expect(await screen.findByText(/rate-limiting this key/)).toBeInTheDocument();
  });

  it("lets the demo user read earlier answers and see what is sent, but not ask", async () => {
    seed(DEMO_USER);
    aiOn();
    backend.aiAnswers.set(1, { explain: makeAnswer(1, { current: false }), draft: null });
    const { user } = renderApp("/findings");
    await openPanel(user);
    expect(
      await screen.findByText("Every lookup by customer reads all 200,000 orders."),
    ).toBeInTheDocument();
    expect(screen.getByText(/The evidence has changed since this answer/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Explain this finding" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View what is sent" }));
    const bundle = await screen.findByRole("region", { name: "Evidence bundle" });
    expect(bundle).toHaveTextContent('"id": "fact:table_rows"');
    expect(screen.getByText(/3 evidence items/)).toBeInTheDocument();
  });
});
