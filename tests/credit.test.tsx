import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ADMIN_USER, backend } from "./fake-backend";
import { renderApp } from "./render-app";

function expectCredit(scope: HTMLElement) {
  // The sign-in screen has one in the side panel (wide screens) and one under the form (narrow
  // ones); CSS shows one of them, but jsdom renders both.
  const links = within(scope).getAllByRole("link", { name: /zykosince94\.github\.io/ });
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    expect(link).toHaveAttribute("href", "https://zykosince94.github.io");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  }
  expect(scope.textContent).toContain("Developed by Rishabh Pandey");
}

describe("the developer credit", () => {
  it("is on the sign-in screen", async () => {
    renderApp("/");
    await screen.findByRole("button", { name: "Sign in" });
    expectCredit(document.body);
  });

  it("is at the foot of every signed-in page", async () => {
    backend.session = ADMIN_USER;
    renderApp("/findings");
    await screen.findByRole("heading", { level: 1, name: "Findings" });
    expectCredit(screen.getByRole("contentinfo"));
  });
});

describe("the sign-in screen's story", () => {
  it("says what Query Pulse does, and what the AI's part in it is", async () => {
    renderApp("/");
    await screen.findByRole("button", { name: "Sign in" });
    const about = screen.getByRole("region", { name: "About Query Pulse" });
    expect(within(about).getByText("Your database is talking.")).toBeInTheDocument();
    expect(within(about).getByText("We translate.")).toBeInTheDocument();
    // Honest about the AI: optional, sees only redacted evidence, cites it, never runs anything.
    for (const title of ["Rules find it", "AI explains it", "You decide"]) {
      expect(within(about).getByText(title)).toBeInTheDocument();
    }
    expect(within(about).getByText(/An optional assistant/)).toBeInTheDocument();
    expect(within(about).getByText(/redacted evidence bundle/)).toBeInTheDocument();
    expect(within(about).getByText(/never runs a draft for you/)).toBeInTheDocument();
  });

  it("keeps the logo out of the accessibility tree", async () => {
    renderApp("/");
    await screen.findByRole("button", { name: "Sign in" });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    for (const svg of document.querySelectorAll("svg")) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
