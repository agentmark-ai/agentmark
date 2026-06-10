// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import {
  TraceDrawerProvider,
  useTraceDrawerContext,
} from "@/sections/traces/trace-drawer/trace-drawer-provider";
import { SessionIoOverview } from "@/sections/traces/trace-drawer/session-io/session-io-overview";
import { SessionDetailsSwitch } from "@/sections/traces/trace-drawer/session-io/session-details-switch";
import { TraceTree } from "@/sections/traces/trace-drawer/trace-tree/trace-tree";
import type { TraceData } from "@/sections/traces/types";

const t = (key: string) => key;

// Three traces shaped like a scraper sale session: each transition is one
// trace whose single root/wrapper span carries the top-level Input/Output
// (set via the SDK's ctx.set_input / set_output). Distinct camelCase tokens
// per field so each card can be asserted independently (underscores/hyphens
// avoided so markdown doesn't mangle them).
const wrapper = (id: string, name: string, input: object, output: object) => ({
  id: `span-${id}`,
  name,
  parentId: null,
  duration: 1000,
  timestamp: 0,
  data: {
    type: "SPAN",
    input: JSON.stringify(input),
    output: JSON.stringify(output),
  },
});

const TRACES: TraceData[] = [
  {
    id: "trace-cal",
    name: "cal_to_sale",
    data: { latency: 1200, status: "0" },
    spans: [
      wrapper("cal", "cal_to_sale", { saleUrl: "urlCalInput" }, { toState: "outCalSale" }),
      // A nested generation span — the non-root drill-in target below. Its own
      // IO must NOT surface in trace-cal's overview card (cards show the trace's
      // top-level/root IO only).
      {
        id: "span-cal-llm",
        name: "chat",
        parentId: "span-cal",
        duration: 900,
        timestamp: 0,
        data: { type: "GENERATION", model: "claude", input: "[]", output: "childOnlyOutput" },
      },
    ],
  },
  {
    id: "trace-day",
    name: "sale_to_day_of",
    data: { latency: 3400, status: "0" },
    spans: [
      wrapper("day", "sale_to_day_of", { saleUrl: "urlDayInput" }, { toState: "outDayOf" }),
    ],
  },
  {
    id: "trace-prices",
    name: "day_of_to_prices",
    data: { latency: 800, status: "0" },
    spans: [
      wrapper("prices", "day_of_to_prices", { saleUrl: "urlPricesInput" }, { toState: "outPrices" }),
    ],
  },
] as unknown as TraceData[];

function renderOverview(extra?: React.ReactNode) {
  return render(
    <TraceDrawerProvider traces={TRACES} sessionId="sale-1" t={t}>
      {extra}
      <SessionIoOverview />
    </TraceDrawerProvider>
  );
}

const card = (root: HTMLElement, traceId: string) =>
  root.querySelector(`[data-trace-id="${traceId}"]`) as HTMLElement | null;

beforeEach(() => cleanup());

describe("SessionIoOverview", () => {
  it("renders one card per trace, each showing its OWN top-level input and output", () => {
    const { container } = renderOverview();

    // All three traces are shown together — the whole point of the view —
    // in session (trace) order.
    const ids = [...container.querySelectorAll("[data-trace-id]")].map((c) =>
      c.getAttribute("data-trace-id")
    );
    expect(ids).toEqual(["trace-cal", "trace-day", "trace-prices"]);

    const cal = card(container, "trace-cal");
    const day = card(container, "trace-day");
    const prices = card(container, "trace-prices");

    // Each card carries its trace name + its own input AND output, not a
    // neighbour's. (Guards against the cards collapsing to one selected span.)
    expect(cal!.textContent).toContain("cal_to_sale");
    expect(cal!.textContent).toContain("urlCalInput");
    expect(cal!.textContent).toContain("outCalSale");

    expect(day!.textContent).toContain("sale_to_day_of");
    expect(day!.textContent).toContain("urlDayInput");
    expect(day!.textContent).toContain("outDayOf");

    expect(prices!.textContent).toContain("day_of_to_prices");
    expect(prices!.textContent).toContain("urlPricesInput");
    expect(prices!.textContent).toContain("outPrices");

    // No card's body bleeds another's IO, nor a nested span's output — cards
    // show each trace's top-level/root IO only.
    expect(cal!.textContent).not.toContain("urlDayInput");
    expect(prices!.textContent).not.toContain("outDayOf");
    expect(cal!.textContent).not.toContain("childOnlyOutput");
  });

  it("highlights only the hovered card, and clears on mouse leave", () => {
    const { container } = renderOverview();

    const cal = card(container, "trace-cal")!;
    const day = card(container, "trace-day")!;

    expect(cal.getAttribute("data-highlighted")).toBe("false");
    expect(day.getAttribute("data-highlighted")).toBe("false");

    fireEvent.mouseEnter(day);
    expect(day.getAttribute("data-highlighted")).toBe("true");
    expect(cal.getAttribute("data-highlighted")).toBe("false");

    fireEvent.mouseLeave(day);
    expect(day.getAttribute("data-highlighted")).toBe("false");
  });

  it("highlights a trace's card when its row is hovered in the TraceTree", () => {
    // Render the tree alongside the overview under one provider — they share
    // hoveredTraceId, so hovering the row must light up the matching card.
    const { container } = renderOverview(<TraceTree />);

    const dayRow = container.querySelector(
      '[data-testid="trace-hover-trace-day"]'
    ) as HTMLElement;
    expect(dayRow).not.toBeNull();

    const day = card(container, "trace-day")!;
    const cal = card(container, "trace-cal")!;
    expect(day.getAttribute("data-highlighted")).toBe("false");

    fireEvent.mouseEnter(dayRow);
    expect(day.getAttribute("data-highlighted")).toBe("true");
    expect(cal.getAttribute("data-highlighted")).toBe("false");

    fireEvent.mouseLeave(dayRow);
    expect(day.getAttribute("data-highlighted")).toBe("false");
  });
});

describe("SessionIoOverview generation fallback (canonical deriveTraceIO semantics)", () => {
  // A trace whose root span records NO I/O (e.g. plain AI-SDK instrumentation,
  // no WebhookRunner root-span recording) plus two generation children. The
  // card must fall back per-field: input from the FIRST generation, output
  // from the LAST — matching shared-utils' deriveTraceIO — instead of empty.
  const FALLBACK_TRACES: TraceData[] = [
    {
      id: "trace-fb",
      name: "ai_sdk_only",
      data: { latency: 500, status: "0" },
      spans: [
        {
          id: "span-fb-root",
          name: "ai_sdk_only",
          parentId: null,
          duration: 500,
          timestamp: 0,
          data: { type: "SPAN" },
        },
        {
          id: "span-fb-gen1",
          name: "chat",
          parentId: "span-fb-root",
          duration: 200,
          timestamp: 10,
          data: {
            type: "GENERATION",
            model: "claude",
            input: JSON.stringify([{ role: "user", content: "firstGenInputToken" }]),
            output: "firstGenOutputToken",
          },
        },
        {
          id: "span-fb-gen2",
          name: "chat",
          parentId: "span-fb-root",
          duration: 200,
          timestamp: 20,
          data: {
            type: "GENERATION",
            model: "claude",
            input: JSON.stringify([{ role: "user", content: "lastGenInputToken" }]),
            output: "lastGenOutputToken",
          },
        },
      ],
    },
  ] as unknown as TraceData[];

  it("fills an IO-less root from its generations: first generation's input, last generation's output", () => {
    const { container } = render(
      <TraceDrawerProvider traces={FALLBACK_TRACES} sessionId="fb-1" t={t}>
        <SessionIoOverview />
      </TraceDrawerProvider>
    );

    const fb = card(container, "trace-fb")!;
    expect(fb.textContent).toContain("firstGenInputToken");
    expect(fb.textContent).toContain("lastGenOutputToken");
    // Per-field, not whole-span: the first generation's OUTPUT and the last
    // generation's INPUT must not leak into the card.
    expect(fb.textContent).not.toContain("firstGenOutputToken");
    expect(fb.textContent).not.toContain("lastGenInputToken");
  });
});

// Drives the provider's selection so we can assert the session-vs-span
// decision the host delegates to SessionDetailsSwitch.
const SelectButton = ({ spanId }: { spanId: string }) => {
  const { onSelectSpan } = useTraceDrawerContext();
  return (
    <button data-testid="select" onClick={() => onSelectSpan(spanId)}>
      select
    </button>
  );
};

describe("SessionDetailsSwitch", () => {
  it("leads with the overview in a session view, then shows span detail once a non-root span is selected", () => {
    const { container, getByTestId, queryByTestId } = render(
      <TraceDrawerProvider traces={TRACES} sessionId="sale-1" t={t}>
        <SelectButton spanId="span-cal-llm" />
        <SessionDetailsSwitch>
          <div data-testid="span-detail">DETAIL</div>
        </SessionDetailsSwitch>
      </TraceDrawerProvider>
    );

    // Default selection is the first trace root → overview (all 3 cards), no detail.
    expect(container.querySelectorAll("[data-trace-id]")).toHaveLength(3);
    expect(queryByTestId("span-detail")).toBeNull();

    // Select the nested generation span → its detail replaces the overview.
    fireEvent.click(getByTestId("select"));
    expect(getByTestId("span-detail").textContent).toBe("DETAIL");
    expect(container.querySelectorAll("[data-trace-id]")).toHaveLength(0);
  });

  it("selecting a trace ROOT keeps the overview (it is not a drill-in)", () => {
    const { container, queryByTestId, getByTestId } = render(
      <TraceDrawerProvider traces={TRACES} sessionId="sale-1" t={t}>
        <SelectButton spanId="trace-day" />
        <SessionDetailsSwitch>
          <div data-testid="span-detail">DETAIL</div>
        </SessionDetailsSwitch>
      </TraceDrawerProvider>
    );

    fireEvent.click(getByTestId("select"));
    expect(container.querySelectorAll("[data-trace-id]")).toHaveLength(3);
    expect(queryByTestId("span-detail")).toBeNull();
  });

  it("renders children (never the overview) outside a session view", () => {
    const { container, getByTestId } = render(
      <TraceDrawerProvider traces={TRACES} t={t}>
        <SessionDetailsSwitch>
          <div data-testid="span-detail">DETAIL</div>
        </SessionDetailsSwitch>
      </TraceDrawerProvider>
    );

    expect(getByTestId("span-detail").textContent).toBe("DETAIL");
    expect(container.querySelectorAll("[data-trace-id]")).toHaveLength(0);
  });
});
