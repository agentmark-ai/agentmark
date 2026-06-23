// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { VariablesView } from "@/sections/traces/trace-drawer/span-info/tabs/input-output-tab/variables-view";

beforeEach(() => {
  cleanup();
});

describe("VariablesView", () => {
  it("renders the template variables as a JSON panel labeled Variables", () => {
    const { container } = render(
      <VariablesView
        variables={{ ticket: "I was charged twice", priority: "high" }}
      />
    );
    // The "Variables" lens label (distinct from the "Messages" view).
    expect(container.textContent).toContain("Variables");
    // The props are rendered as JSON — both keys and values present.
    expect(container.textContent).toContain("ticket");
    expect(container.textContent).toContain("I was charged twice");
    expect(container.textContent).toContain("priority");
    expect(container.textContent).toContain("high");
  });
});
