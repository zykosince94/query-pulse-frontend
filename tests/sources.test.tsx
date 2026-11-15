import { screen, waitFor, within } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import {
  ADMIN_USER,
  backend,
  capabilitiesFor,
  DEMO_USER,
  MISSING_ROLE_FIX,
  makeSource,
  server,
} from "./fake-backend";
import { renderApp } from "./render-app";

type User = ReturnType<typeof renderApp>["user"];

async function fillConnection(user: User, overrides: Partial<Record<string, string>> = {}) {
  const values = {
    Name: "Orders DB",
    Host: "ok.example",
    Database: "shop",
    Username: "monitor",
    Password: "s3cret",
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    const input = await screen.findByLabelText(label);
    await user.clear(input);
    if (value) await user.type(input, value);
  }
}

describe("sources list", () => {
  it("shows a loading state, then an empty state with a call to action", async () => {
    backend.session = ADMIN_USER;
    server.use(
      http.get("/api/sources", async () => {
        await delay(50);
        return HttpResponse.json([]);
      }),
    );
    renderApp("/sources");
    expect(await screen.findByText("Loading data sources…")).toBeInTheDocument();
    expect(await screen.findByText("No data sources yet")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Add source" }).length).toBeGreaterThan(0);
  });

  it("lists sources with engine, location, version and status", async () => {
    backend.session = ADMIN_USER;
    backend.sources = [
      makeSource({ name: "Orders DB" }),
      makeSource({
        name: "Events",
        engine: "mongodb",
        host: "mongo",
        port: 27017,
        status: "degraded",
        server_version: "7.0.12",
      }),
    ];
    renderApp("/sources");
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(
      within(rows[1] as HTMLElement).getByRole("link", { name: "Orders DB" }),
    ).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("PostgreSQL")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("Healthy")).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText("mongo:27017/shop")).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText("Degraded")).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText("7.0.12")).toBeInTheDocument();
  });

  it("shows an error with a retry when the list can't load", { timeout: 10_000 }, async () => {
    backend.session = ADMIN_USER;
    let fail = true;
    let requests = 0;
    server.use(
      http.get("/api/sources", () => {
        requests += 1;
        return fail
          ? HttpResponse.json({ detail: "Database is down" }, { status: 500 })
          : HttpResponse.json([]);
      }),
    );
    const { user } = renderApp("/sources");
    // Server errors are retried twice (with backoff) before the error is shown.
    expect(
      await screen.findByText(
        /Couldn't load data sources: Database is down/,
        {},
        { timeout: 6000 },
      ),
    ).toBeInTheDocument();
    expect(requests).toBe(3);
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No data sources yet")).toBeInTheDocument();
  });

  it("disables adding sources for the read-only demo user", async () => {
    backend.session = DEMO_USER;
    renderApp("/sources");
    await screen.findByText("No data sources yet");
    for (const button of screen.getAllByRole("button", { name: "Add source" })) {
      expect(button).toBeDisabled();
    }
    expect(screen.queryByRole("link", { name: "Add source" })).not.toBeInTheDocument();
  });
});

describe("adding a source (QP-AC-05)", () => {
  it("tests the connection, shows the checklist, then saves", async () => {
    backend.session = ADMIN_USER;
    const { user, router } = renderApp("/sources/new");
    await fillConnection(user);

    const save = screen.getByRole("button", { name: "Save source" });
    expect(save).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText(/Connected to version 16.4/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Capability checklist" })).toBeInTheDocument();
    expect(save).toBeEnabled();

    await user.click(save);
    expect(await screen.findByRole("heading", { name: "Orders DB" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/sources/1");
    expect(backend.sources).toHaveLength(1);
    expect(backend.passwords.get(1)).toBe("s3cret");
  });

  it("shows a failed test and keeps Save disabled", async () => {
    backend.session = ADMIN_USER;
    const { user } = renderApp("/sources/new");
    await fillConnection(user, { Host: "badpass.example" });
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("rejected the username or password");
    expect(screen.getByRole("button", { name: "Save source" })).toBeDisabled();
  });

  it("requires a new test after the connection settings change", async () => {
    backend.session = ADMIN_USER;
    const { user } = renderApp("/sources/new");
    await fillConnection(user);
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    await screen.findByText(/Connected to version/);
    expect(screen.getByRole("button", { name: "Save source" })).toBeEnabled();

    await user.type(screen.getByLabelText("Database"), "2");
    expect(screen.getByRole("button", { name: "Save source" })).toBeDisabled();
    expect(screen.getByText(/settings changed since the last test/)).toBeInTheDocument();

    // Changing only the name doesn't need a new test.
    await user.clear(screen.getByLabelText("Database"));
    await user.type(screen.getByLabelText("Database"), "shop");
    await user.type(screen.getByLabelText("Name"), " primary");
    expect(screen.getByRole("button", { name: "Save source" })).toBeEnabled();
  });

  it("shows capabilities that need fixing, with the exact fix", async () => {
    backend.session = ADMIN_USER;
    const { user } = renderApp("/sources/new");
    await fillConnection(user, { Host: "degraded.example" });
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText(/1 feature is unavailable/)).toBeInTheDocument();
    expect(screen.getByText(MISSING_ROLE_FIX)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save source" })).toBeEnabled();
  });

  it("switches the default port with the engine", async () => {
    backend.session = ADMIN_USER;
    const { user } = renderApp("/sources/new");
    const port = await screen.findByLabelText("Port");
    expect(port).toHaveValue(5432);
    await user.selectOptions(screen.getByLabelText("Engine"), "mongodb");
    expect(port).toHaveValue(27017);
    expect(
      screen.getByText(/Leave blank if the server doesn't require authentication/),
    ).toBeInTheDocument();
  });

  it("shows the read-only notice instead of the form for the demo user", async () => {
    backend.session = DEMO_USER;
    renderApp("/sources/new");
    expect(await screen.findByText(/The demo is read-only/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Host")).not.toBeInTheDocument();
  });

  it("shows the server's message when saving fails", async () => {
    backend.session = ADMIN_USER;
    backend.sources = [makeSource({ name: "Orders DB" })];
    const { user } = renderApp("/sources/new");
    await fillConnection(user);
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    await screen.findByText(/Connected to version/);
    await user.click(screen.getByRole("button", { name: "Save source" }));
    expect(await screen.findByText("A source named 'Orders DB' exists")).toBeInTheDocument();
  });
});

describe("source detail", () => {
  it("shows the connection and the capability checklist with fixes", async () => {
    backend.session = ADMIN_USER;
    backend.sources = [
      makeSource({
        id: 7,
        name: "Orders DB",
        status: "degraded",
        capabilities: capabilitiesFor("degraded.example"),
      }),
    ];
    renderApp("/sources/7");
    expect(await screen.findByRole("heading", { name: "Orders DB" })).toBeInTheDocument();
    expect(screen.getByText("ok.example:5432")).toBeInTheDocument();
    expect(screen.getByText("Saved (encrypted)")).toBeInTheDocument();
    const checklist = screen.getByRole("list", { name: "Capability checklist" });
    expect(within(checklist).getByText(/Statistics for all users' queries/)).toHaveTextContent(
      "unavailable",
    );
    expect(within(checklist).getByText(MISSING_ROLE_FIX)).toBeInTheDocument();
  });

  it("re-checks and shows a failing source's last error", async () => {
    backend.session = ADMIN_USER;
    backend.sources = [makeSource({ id: 3, host: "down.example" })];
    const { user } = renderApp("/sources/3");
    await user.click(await screen.findByRole("button", { name: "Re-check" }));
    expect(await screen.findByText("Failing")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No answer from down.example:5432");
  });

  it("deletes after confirmation", async () => {
    backend.session = ADMIN_USER;
    backend.sources = [makeSource({ id: 4, name: "Old DB" })];
    const { user, router } = renderApp("/sources/4");
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(screen.getByText(/Its settings and saved credentials are removed/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete source" }));
    expect(await screen.findByText("No data sources yet")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/sources");
    expect(backend.sources).toHaveLength(0);
  });

  it("hides write actions from the demo user", async () => {
    backend.session = DEMO_USER;
    backend.sources = [makeSource({ id: 5 })];
    renderApp("/sources/5");
    await screen.findByRole("heading", { name: "Orders DB" });
    for (const name of ["Re-check", "Edit", "Delete"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
  });

  it("says when a source doesn't exist", async () => {
    backend.session = ADMIN_USER;
    renderApp("/sources/99");
    expect(await screen.findByText("This data source doesn't exist.")).toBeInTheDocument();
  });

  it("treats a non-numeric id as not found", async () => {
    backend.session = ADMIN_USER;
    renderApp("/sources/abc");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});

describe("editing a source", () => {
  it("keeps the saved password when the field is left blank", async () => {
    backend.session = ADMIN_USER;
    backend.sources = [makeSource({ id: 2, name: "Orders DB" })];
    backend.passwords.set(2, "stored-secret");
    const { user } = renderApp("/sources/2/edit");

    const password = await screen.findByLabelText("Password");
    expect(password).toHaveValue("");
    expect(screen.getByText(/Leave blank to keep the saved password/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Database"));
    await user.type(screen.getByLabelText("Database"), "sales");
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    await screen.findByText(/Connected to version/);
    expect(backend.lastTestPassword).toBe("stored-secret");

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("sales")).toBeInTheDocument();
    expect(backend.passwords.get(2)).toBe("stored-secret");
  });

  it("sends a new password when one is typed", async () => {
    backend.session = ADMIN_USER;
    backend.sources = [makeSource({ id: 2 })];
    backend.passwords.set(2, "stored-secret");
    const { user } = renderApp("/sources/2/edit");
    await user.type(await screen.findByLabelText("Password"), "n3w");
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    await screen.findByText(/Connected to version/);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("heading", { name: "Orders DB" });
    await waitFor(() => expect(backend.passwords.get(2)).toBe("n3w"));
  });
});
