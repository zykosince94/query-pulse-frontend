import { createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/App";
import { createAppRouter } from "@/routes/router";

/** Render the whole app (real router, real queries) at `path`, against the fake backend. */
export function renderApp(path = "/") {
  const history = createMemoryHistory({ initialEntries: [path] });
  const { router, queryClient } = createAppRouter({ history });
  const user = userEvent.setup();
  const view = render(<App router={router} queryClient={queryClient} />);
  return { ...view, user, router };
}
