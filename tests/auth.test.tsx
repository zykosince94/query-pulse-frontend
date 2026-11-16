import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { ADMIN, backend, server } from "./fake-backend";
import { renderApp } from "./render-app";

async function signInAsAdmin(user: ReturnType<typeof renderApp>["user"]) {
  await user.type(await screen.findByLabelText("Username"), ADMIN.username);
  await user.type(screen.getByLabelText("Password"), ADMIN.password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("sign-in", () => {
  it("sends a signed-out visitor to the sign-in screen", async () => {
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("signs the admin in and shows the app shell", async () => {
    const { user } = renderApp("/");
    await signInAsAdmin(user);

    expect(await screen.findByRole("heading", { name: "Workload" })).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.queryByText("Read-only demo")).not.toBeInTheDocument();
  });

  it("shows the server's message for wrong credentials and stays on sign-in", async () => {
    const { user } = renderApp("/");
    await user.type(await screen.findByLabelText("Username"), "admin");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("disables the submit button until both fields are filled", async () => {
    const { user } = renderApp("/login");
    const submit = await screen.findByRole("button", { name: "Sign in" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("Username"), "admin");
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("Password"), "x");
    expect(submit).toBeEnabled();
  });

  it("returns to the page the visitor originally asked for", async () => {
    const { user, router } = renderApp("/findings");
    await screen.findByRole("heading", { name: "Sign in" });
    expect(router.state.location.search).toEqual({ redirect: "/findings" });

    await signInAsAdmin(user);
    expect(await screen.findByRole("heading", { name: "Findings" })).toBeInTheDocument();
  });

  const BACKSLASH = String.fromCharCode(92);
  it.each([
    "//evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    // Browsers resolve these to //evil.example too (found in code review).
    `/${BACKSLASH}evil.example`,
    `/${BACKSLASH}/evil.example`,
    "/\t/evil.example",
    "/\n/evil.example",
  ])("ignores a redirect that leaves the site (%s)", async (target) => {
    const { user, router } = renderApp(`/login?redirect=${encodeURIComponent(target)}`);
    await signInAsAdmin(user);
    expect(await screen.findByRole("heading", { name: "Workload" })).toBeInTheDocument();
    expect(router.state.location.href).toBe("/");
  });

  it("skips the sign-in screen for someone already signed in", async () => {
    backend.session = { username: "admin", role: "admin", read_only: false };
    renderApp("/login");
    expect(await screen.findByRole("heading", { name: "Workload" })).toBeInTheDocument();
  });
});

describe("demo user", () => {
  it("offers 'Try the demo' and opens a read-only session", async () => {
    const { user } = renderApp("/");
    await user.click(await screen.findByRole("button", { name: "Try the demo" }));

    expect(await screen.findByText("Read-only demo")).toBeInTheDocument();
    expect(screen.getByText("demo")).toBeInTheDocument();
  });

  it("hides 'Try the demo' when the demo is disabled", async () => {
    backend.demoEnabled = false;
    renderApp("/");
    await screen.findByRole("heading", { name: "Sign in" });
    // Wait for the config request to settle before asserting absence.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Try the demo" })).not.toBeInTheDocument(),
    );
  });
});

describe("app shell", () => {
  it("signs out back to the sign-in screen", async () => {
    backend.session = { username: "admin", role: "admin", read_only: false };
    const { user } = renderApp("/");
    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(backend.session).toBeNull();
  });

  it("navigates between sections and marks the current one", async () => {
    backend.session = { username: "admin", role: "admin", read_only: false };
    const { user } = renderApp("/");
    await screen.findByRole("heading", { name: "Workload" });

    await user.click(screen.getByRole("link", { name: "Data sources" }));
    expect(await screen.findByRole("heading", { name: "Data sources" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Data sources" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows a not-found page for unknown paths", async () => {
    backend.session = { username: "admin", role: "admin", read_only: false };
    renderApp("/no-such-page");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });

  it("explains when the backend is unreachable and recovers on retry", async () => {
    server.use(http.get("/api/auth/me", () => HttpResponse.error()));
    const { user } = renderApp("/");
    expect(
      await screen.findByRole("heading", { name: "Can't reach the Query Pulse server" }),
    ).toBeInTheDocument();

    server.resetHandlers();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("redirect after sign-in keeps same-site detail", () => {
  it("preserves the query string and hash of the requested page", async () => {
    const { user, router } = renderApp("/login?redirect=%2Ffindings%3Fstatus%3Ddismissed%23top");
    await user.type(await screen.findByLabelText("Username"), ADMIN.username);
    await user.type(screen.getByLabelText("Password"), ADMIN.password);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Findings" })).toBeInTheDocument();
    expect(router.state.location.href).toBe("/findings?status=dismissed#top");
  });
});
