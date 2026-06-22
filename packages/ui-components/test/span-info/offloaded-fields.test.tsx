// @vitest-environment jsdom

/**
 * OffloadedFields — renders EVERY offloaded span field (Input / Output /
 * OutputObject / ToolCalls), fetched on demand via the host `fetchBlob`:
 * image/audio inline, full text/JSON otherwise, graceful "could not load" on
 * a missing blob, and OutputObject deduped when Output is also offloaded.
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/** jsdom doesn't decode images — simulate natural/rendered dimensions + fire load. */
const fireImageLoad = (img: HTMLImageElement, nat: number, client: number) => {
  Object.defineProperty(img, "naturalWidth", { value: nat, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: nat, configurable: true });
  Object.defineProperty(img, "clientWidth", { value: client, configurable: true });
  Object.defineProperty(img, "clientHeight", { value: client, configurable: true });
  fireEvent.load(img);
};
import { TraceDrawerProvider } from "@/sections/traces/trace-drawer/trace-drawer-provider";
import {
  OffloadedFields,
  parseOffloadedFieldNames,
} from "@/sections/traces/trace-drawer/span-info/tabs/input-output-tab/offloaded-fields";

const t = (key: string) => key;
const OUTPUT_REF = '[{"field":"Output","blob_id":"tnt/app/tr/sp/Output","size":100}]';

const renderWithFetchBlob = (
  blobRefs: string,
  fetchBlob: (path: string) => Promise<string | null>,
) =>
  render(
    <TraceDrawerProvider traces={[]} fetchBlob={fetchBlob} t={t}>
      <OffloadedFields blobRefs={blobRefs} />
    </TraceDrawerProvider>,
  );

describe("OffloadedFields", () => {
  it("renders an <img> for image media in the fetched output", async () => {
    const fetchBlob = vi
      .fn()
      .mockResolvedValue('[{"mimeType":"image/png","base64":"iVBORw0KGgo="}]');

    const { container } = renderWithFetchBlob(OUTPUT_REF, fetchBlob);

    const img = await waitFor(() => {
      const el = container.querySelector('img');
      if (!el) throw new Error("no img yet");
      return el as HTMLImageElement;
    });
    expect(img.getAttribute("src")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(fetchBlob).toHaveBeenCalledWith("tnt/app/tr/sp/Output");
  });

  it("labels an offloaded image output 'assistant' (mirrors the inline output bubble, not 'Output')", async () => {
    const fetchBlob = vi
      .fn()
      .mockResolvedValue('[{"mimeType":"image/png","base64":"iVBORw0KGgo="}]');

    const { container } = renderWithFetchBlob(OUTPUT_REF, fetchBlob);

    await waitFor(() => {
      if (!container.querySelector("img")) throw new Error("no img yet");
    });
    // Output field → "assistant" (the generation's response), never "Output"/"Full output".
    expect(screen.getByText("assistant")).toBeTruthy();
    expect(screen.queryByText("Full output")).toBeNull();
  });

  it("caps the image height so the whole image is visible at once", async () => {
    const fetchBlob = vi
      .fn()
      .mockResolvedValue('[{"mimeType":"image/png","base64":"iVBORw0KGgo="}]');

    const { container } = renderWithFetchBlob(OUTPUT_REF, fetchBlob);

    const img = (await waitFor(() => {
      const el = container.querySelector("img");
      if (!el) throw new Error("no img yet");
      return el as HTMLImageElement;
    })) as HTMLImageElement;

    expect(img.style.maxHeight).toBe("480px");
    expect(img.style.objectFit).toBe("contain");
  });

  it("makes an OVERSIZED image zoomable: Expand affordance + caption, click toggles full size", async () => {
    const fetchBlob = vi
      .fn()
      .mockResolvedValue('[{"mimeType":"image/png","base64":"iVBORw0KGgo="}]');

    const { container } = renderWithFetchBlob(OUTPUT_REF, fetchBlob);
    const img = (await waitFor(() => {
      const el = container.querySelector("img");
      if (!el) throw new Error("no img yet");
      return el as HTMLImageElement;
    })) as HTMLImageElement;

    // 1024² image downscaled into the 480 box → zoom is meaningful.
    fireImageLoad(img, 1024, 480);

    await waitFor(() => expect(screen.getByText("Expand")).toBeTruthy());
    expect(img.style.cursor).toBe("zoom-in");
    expect(screen.getByText(/image\/png · 1024×1024/)).toBeTruthy();

    fireEvent.click(img);
    await waitFor(() => expect(img.style.objectFit).toBe("")); // full 1:1 size
    expect(img.style.maxWidth).toBe("none");
    expect(screen.queryByText("Expand")).toBeNull(); // hidden while zoomed
  });

  it("does NOT make a sub-cap image zoomable (no misleading zoom cursor/affordance)", async () => {
    const fetchBlob = vi
      .fn()
      .mockResolvedValue('[{"mimeType":"image/png","base64":"iVBORw0KGgo="}]');

    const { container } = renderWithFetchBlob(OUTPUT_REF, fetchBlob);
    const img = (await waitFor(() => {
      const el = container.querySelector("img");
      if (!el) throw new Error("no img yet");
      return el as HTMLImageElement;
    })) as HTMLImageElement;

    fireImageLoad(img, 200, 200); // shown 1:1, nothing to zoom

    await waitFor(() => expect(screen.getByText(/image\/png · 200×200/)).toBeTruthy());
    expect(screen.queryByText("Expand")).toBeNull();
    expect(img.style.cursor).toBe("default");
    fireEvent.click(img); // no-op
    expect(img.style.objectFit).toBe("contain"); // unchanged
  });

  it("renders large text in a scrollable block (does not dump the whole payload)", async () => {
    const fetchBlob = vi.fn().mockResolvedValue("a very long non-media answer");
    const { container } = renderWithFetchBlob(OUTPUT_REF, fetchBlob);

    const pre = (await waitFor(() => {
      const el = container.querySelector("pre");
      if (!el) throw new Error("no pre yet");
      return el;
    })) as HTMLElement;
    // The <pre>'s scroll container caps height and scrolls.
    const scroller = pre.parentElement as HTMLElement;
    expect(scroller.style.maxHeight).toBe("360px");
    expect(scroller.style.overflow).toBe("auto");
  });

  it("renders an <audio> player for audio media", async () => {
    const fetchBlob = vi
      .fn()
      .mockResolvedValue('{"mimeType":"audio/mpeg","base64":"SUQzAAA="}');

    const { container } = renderWithFetchBlob(OUTPUT_REF, fetchBlob);

    const audio = await waitFor(() => {
      const el = container.querySelector('audio');
      if (!el) throw new Error("no audio yet");
      return el as HTMLAudioElement;
    });
    expect(audio.getAttribute("src")).toBe("data:audio/mpeg;base64,SUQzAAA=");
  });

  it("shows the full text for a non-media (text) payload", async () => {
    const fetchBlob = vi.fn().mockResolvedValue("a very long non-media answer");

    renderWithFetchBlob(OUTPUT_REF, fetchBlob);

    await waitFor(() => expect(screen.getByText("a very long non-media answer")).toBeTruthy());
  });

  it("shows a graceful message when the blob cannot be loaded", async () => {
    const fetchBlob = vi.fn().mockResolvedValue(null);

    renderWithFetchBlob(OUTPUT_REF, fetchBlob);

    await waitFor(() => expect(screen.getByText(/Could not load/i)).toBeTruthy());
  });

  it("renders the FULL value of an offloaded Input field (gap #1 — not just Output)", async () => {
    const fetchBlob = vi.fn().mockResolvedValue("a very large prompt / RAG context …");
    renderWithFetchBlob('[{"field":"Input","blob_id":"k/in","size":50000}]', fetchBlob);

    await waitFor(() => expect(screen.getByText("a very large prompt / RAG context …")).toBeTruthy());
    expect(fetchBlob).toHaveBeenCalledWith("k/in");
    expect(screen.getByText("input")).toBeTruthy(); // labeled "Input"
  });

  it("labels each offloaded field to match the inline bubble (Input → input, Output → assistant)", async () => {
    const fetchBlob = vi.fn(async (path: string) =>
      path.endsWith("/in") ? "the full input" : "the full output",
    );
    renderWithFetchBlob(
      '[{"field":"Input","blob_id":"k/in","size":1},{"field":"Output","blob_id":"k/out","size":1}]',
      fetchBlob,
    );

    await waitFor(() => expect(screen.getByText("the full input")).toBeTruthy());
    expect(screen.getByText("the full output")).toBeTruthy();
    expect(screen.getByText("input")).toBeTruthy();
    expect(screen.getByText("assistant")).toBeTruthy();
    expect(fetchBlob).toHaveBeenCalledTimes(2);
  });

  it("dedupes OutputObject when Output is also offloaded (same payload, render once)", async () => {
    const fetchBlob = vi.fn().mockResolvedValue("the output");
    renderWithFetchBlob(
      '[{"field":"Output","blob_id":"k/out","size":1},{"field":"OutputObject","blob_id":"k/oo","size":1}]',
      fetchBlob,
    );

    await waitFor(() => expect(screen.getByText("the output")).toBeTruthy());
    expect(screen.getByText("assistant")).toBeTruthy(); // the kept Output section
    expect(screen.queryByText("output")).toBeNull(); // OutputObject's label absent — deduped
    expect(fetchBlob).toHaveBeenCalledTimes(1);
    expect(fetchBlob).toHaveBeenCalledWith("k/out");
  });

  it("renders OutputObject on its own when Output is NOT offloaded (object-only generation)", async () => {
    const fetchBlob = vi.fn().mockResolvedValue('{"answer":"structured"}');
    renderWithFetchBlob('[{"field":"OutputObject","blob_id":"k/oo","size":1}]', fetchBlob);

    await waitFor(() => expect(screen.getByText('{"answer":"structured"}')).toBeTruthy());
    expect(screen.getByText("output")).toBeTruthy(); // OutputObject → "Output"
  });

  it("renders nothing when there are no known offloaded fields", () => {
    const fetchBlob = vi.fn();
    const { container } = renderWithFetchBlob('[]', fetchBlob);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("");
    expect(fetchBlob).not.toHaveBeenCalled();
  });

  it("renders one <img> per image in a multi-image output array", async () => {
    const fetchBlob = vi.fn().mockResolvedValue(
      '[{"mimeType":"image/png","base64":"AAA"},{"mimeType":"image/jpeg","base64":"BBB"}]',
    );
    const { container } = renderWithFetchBlob(OUTPUT_REF, fetchBlob);

    await waitFor(() => expect(container.querySelectorAll('img').length).toBe(2));
    const srcs = Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src'));
    expect(srcs).toEqual(['data:image/png;base64,AAA', 'data:image/jpeg;base64,BBB']);
  });

  it("renders mixed image + audio, and recognizes Vercel's `mediaType` key", async () => {
    const fetchBlob = vi.fn().mockResolvedValue(
      '[{"mimeType":"image/png","base64":"IMG"},{"mediaType":"audio/mpeg","base64":"AUD"}]',
    );
    const { container } = renderWithFetchBlob(OUTPUT_REF, fetchBlob);

    await waitFor(() => expect(container.querySelector('audio')).toBeTruthy());
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,IMG');
    expect(container.querySelector('audio')?.getAttribute('src')).toBe('data:audio/mpeg;base64,AUD');
  });

  it("finds media nested inside an object (recursive walk)", async () => {
    const fetchBlob = vi.fn().mockResolvedValue(
      '{"images":[{"mimeType":"image/webp","base64":"NESTED"}]}',
    );
    const { container } = renderWithFetchBlob(OUTPUT_REF, fetchBlob);

    await waitFor(() => {
      const img = container.querySelector('img');
      if (!img) throw new Error('no img');
      expect(img.getAttribute('src')).toBe('data:image/webp;base64,NESTED');
    });
  });

  it("falls back to text for an empty media array", async () => {
    const fetchBlob = vi.fn().mockResolvedValue('[]');
    const { container } = renderWithFetchBlob(OUTPUT_REF, fetchBlob);

    await waitFor(() => expect(screen.getByText('[]')).toBeTruthy());
    expect(container.querySelector('img')).toBeNull();
  });

  it("falls back to text (no crash) for non-JSON content", async () => {
    const fetchBlob = vi.fn().mockResolvedValue('not valid json {');
    const { container } = renderWithFetchBlob(OUTPUT_REF, fetchBlob);

    await waitFor(() => expect(screen.getByText('not valid json {')).toBeTruthy());
    expect(container.querySelector('img')).toBeNull();
  });
});

describe("parseOffloadedFieldNames", () => {
  it("returns the set of known offloaded field names", () => {
    const refs =
      '[{"field":"Output","blob_id":"a","size":1},{"field":"Input","blob_id":"b","size":1}]';
    expect(parseOffloadedFieldNames(refs)).toEqual(new Set(["Output", "Input"]));
  });

  it("ignores unknown field names", () => {
    const refs = '[{"field":"Output","blob_id":"a","size":1},{"field":"Bogus","blob_id":"b","size":1}]';
    expect(parseOffloadedFieldNames(refs)).toEqual(new Set(["Output"]));
  });

  it("returns an empty set for undefined / malformed / non-array input", () => {
    expect(parseOffloadedFieldNames(undefined)).toEqual(new Set());
    expect(parseOffloadedFieldNames("")).toEqual(new Set());
    expect(parseOffloadedFieldNames("not json")).toEqual(new Set());
    expect(parseOffloadedFieldNames('{"field":"Output"}')).toEqual(new Set());
  });
});
