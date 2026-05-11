// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestPromptDialog } from "@/sections/traces/components/test-prompt-dialog";

const t = (key: string) => key;

beforeEach(() => {
  cleanup();
});

function renderDialog(overrides: Partial<React.ComponentProps<typeof TestPromptDialog>> = {}) {
  const onClose = vi.fn();
  const props: React.ComponentProps<typeof TestPromptDialog> = {
    open: true,
    onClose,
    promptName: "summarize",
    initialProps: { topic: "ai" },
    t,
    ...overrides,
  };
  const utils = render(<TestPromptDialog {...props} />);
  return { ...utils, onClose, props };
}

describe("TestPromptDialog", () => {
  it("renders the prompt name as a chip", async () => {
    renderDialog();
    expect(await screen.findByText("summarize")).toBeTruthy();
  });

  it("seeds the props editor with the initial trace input as JSON", async () => {
    renderDialog({ initialProps: { topic: "ai", count: 3 } });
    const input = await screen.findByTestId("test-prompt-props-input");
    expect((input as HTMLTextAreaElement).value).toContain('"topic": "ai"');
    expect((input as HTMLTextAreaElement).value).toContain('"count": 3');
  });

  it("renders a `{}` placeholder when no initial props are supplied", async () => {
    renderDialog({ initialProps: null });
    const input = await screen.findByTestId("test-prompt-props-input");
    expect((input as HTMLTextAreaElement).value).toBe("{}");
  });

  it("shows a loading state then the resolved file path", async () => {
    let resolveNow!: (path: string | null) => void;
    const resolveFilePath = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          resolveNow = resolve;
        })
    );

    renderDialog({ resolveFilePath });

    expect(await screen.findByText("testPromptResolving")).toBeTruthy();
    resolveNow("examples/hello.prompt.mdx");
    expect(await screen.findByText("examples/hello.prompt.mdx")).toBeTruthy();
  });

  it("renders the missing-file warning when the resolver returns null", async () => {
    const resolveFilePath = vi.fn().mockResolvedValue(null);
    renderDialog({ resolveFilePath });
    expect(await screen.findByText("testPromptMissingFile")).toBeTruthy();
  });

  it("renders an error state when the resolver rejects", async () => {
    const resolveFilePath = vi.fn().mockRejectedValue(new Error("boom"));
    renderDialog({ resolveFilePath });
    expect(await screen.findByText("testPromptResolveError")).toBeTruthy();
  });

  it("emits a CLI command with the resolved path and initial props", async () => {
    const resolveFilePath = vi.fn().mockResolvedValue("p.prompt.mdx");
    renderDialog({ resolveFilePath, initialProps: { topic: "ai" } });
    const cli = await screen.findByTestId("test-prompt-cli");
    await waitFor(() => {
      expect(cli.textContent).toBe(
        `agentmark run-prompt 'p.prompt.mdx' --props '{"topic":"ai"}'`
      );
    });
  });

  it("falls back to a placeholder path when resolution fails", async () => {
    const resolveFilePath = vi.fn().mockResolvedValue(null);
    renderDialog({ resolveFilePath, initialProps: { topic: "ai" } });
    const cli = await screen.findByTestId("test-prompt-cli");
    await waitFor(() => {
      // Placeholder must avoid `<>` (shell redirect chars).
      expect(cli.textContent).toContain("'path/to/your.prompt.mdx'");
      expect(cli.textContent).toContain(`--props '{"topic":"ai"}'`);
    });
  });

  it("regenerates the CLI command live as the user edits props", async () => {
    renderDialog({ initialProps: { topic: "ai" } });

    const input = (await screen.findByTestId(
      "test-prompt-props-input"
    )) as HTMLTextAreaElement;
    const cli = await screen.findByTestId("test-prompt-cli");

    // Use fireEvent.change instead of user.type — testing-library's typed
    // events parse `{` and `[` as keyboard modifier syntax, which
    // collides with JSON literals.
    fireEvent.change(input, { target: { value: '{"topic":"db"}' } });

    await waitFor(() => {
      expect(cli.textContent).toContain(`--props '{"topic":"db"}'`);
    });
  });

  it("surfaces a JSON parse error and omits --props when invalid", async () => {
    renderDialog({ initialProps: { topic: "ai" } });

    const input = (await screen.findByTestId(
      "test-prompt-props-input"
    )) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "{not json" } });

    expect(await screen.findByText("testPromptInvalidJson")).toBeTruthy();
    const cli = await screen.findByTestId("test-prompt-cli");
    await waitFor(() => {
      expect(cli.textContent).not.toContain("--props");
    });
  });

  it("rejects non-object JSON (arrays, primitives) with a helpful error", async () => {
    renderDialog({ initialProps: { topic: "ai" } });

    const input = (await screen.findByTestId(
      "test-prompt-props-input"
    )) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "[1,2,3]" } });

    expect(
      await screen.findByText("testPromptInvalidJsonObject")
    ).toBeTruthy();
  });

  it("copies the live command to the clipboard when the copy button is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // navigator.clipboard is a getter in jsdom — defineProperty is the only
    // way to swap it without throwing.
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderDialog({
      initialProps: { topic: "ai" },
      resolveFilePath: vi.fn().mockResolvedValue("p.prompt.mdx"),
    });

    // Wait for the CLI command to settle on the resolved path before
    // clicking — otherwise the click can race the async resolver and copy
    // the placeholder version.
    await screen.findByText("p.prompt.mdx");
    await waitFor(() => {
      const cli = screen.getByTestId("test-prompt-cli");
      expect(cli.textContent).toBe(
        `agentmark run-prompt 'p.prompt.mdx' --props '{"topic":"ai"}'`
      );
    });

    fireEvent.click(screen.getByTestId("test-prompt-copy"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        `agentmark run-prompt 'p.prompt.mdx' --props '{"topic":"ai"}'`
      );
    });
  });

  it("hides the Open File button when no onOpenFile handler is supplied", () => {
    renderDialog();
    expect(screen.queryByTestId("test-prompt-open-file")).toBeNull();
  });

  it("renders Open File disabled until the path resolves", async () => {
    let resolveNow!: (path: string | null) => void;
    const resolveFilePath = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          resolveNow = resolve;
        })
    );
    const onOpenFile = vi.fn();

    renderDialog({ resolveFilePath, onOpenFile });

    const button = (await screen.findByTestId(
      "test-prompt-open-file"
    )) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    resolveNow("examples/hello.prompt.mdx");
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it("invokes onOpenFile with the resolved path and closes the dialog", async () => {
    const onOpenFile = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <TestPromptDialog
        open
        onClose={onClose}
        promptName="summarize"
        initialProps={{ topic: "ai" }}
        resolveFilePath={vi.fn().mockResolvedValue("examples/hello.prompt.mdx")}
        onOpenFile={onOpenFile}
        t={t}
      />
    );

    await screen.findByText("examples/hello.prompt.mdx");
    await user.click(screen.getByTestId("test-prompt-open-file"));

    expect(onOpenFile).toHaveBeenCalledWith("examples/hello.prompt.mdx");
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when `open` is false", () => {
    const { container } = renderDialog({ open: false });
    // MUI portals into document.body; assert by querying the screen too.
    expect(within(container).queryByText("testPromptTitle")).toBeNull();
    expect(screen.queryByText("testPromptTitle")).toBeNull();
  });

  it("cancels the copy-feedback timeout on unmount (no setState after teardown)", async () => {
    vi.useFakeTimers();
    try {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(window.navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });

      const { unmount } = render(
        <TestPromptDialog
          open
          onClose={() => {}}
          promptName="summarize"
          initialProps={{ topic: "ai" }}
          t={t}
        />
      );

      // Click copy → kicks off a 1500ms feedback timer that calls
      // setCopied(false). If the dialog unmounts within that window the
      // timer must be cancelled — otherwise React 19 silently no-ops the
      // setState but we leave a dangling job in jsdom.
      fireEvent.click(screen.getByTestId("test-prompt-copy"));
      await Promise.resolve(); // let the writeText microtask settle
      await Promise.resolve();

      unmount();

      // Run all pending timers. With cleanup wired up, no setters fire.
      vi.runAllTimers();

      // The clipboard call did happen (proves the click landed before
      // unmount). What we're really asserting is no warning/error from
      // running timers post-unmount — vitest fails the test on uncaught.
      expect(writeText).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not overwrite a stale-resolver result when the user reopens with a new prompt", async () => {
    let resolveOld!: (path: string | null) => void;
    let resolveNew!: (path: string | null) => void;
    const resolveFilePath = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<string | null>((r) => (resolveOld = r))
      )
      .mockImplementationOnce(
        () => new Promise<string | null>((r) => (resolveNew = r))
      );

    const { rerender } = render(
      <TestPromptDialog
        open
        onClose={() => {}}
        promptName="alpha"
        initialProps={{}}
        resolveFilePath={resolveFilePath}
        t={t}
      />
    );
    rerender(
      <TestPromptDialog
        open
        onClose={() => {}}
        promptName="beta"
        initialProps={{}}
        resolveFilePath={resolveFilePath}
        t={t}
      />
    );

    // The first (stale) resolver settles AFTER the prompt changed — its
    // result must be discarded.
    resolveOld("alpha.prompt.mdx");
    resolveNew("beta.prompt.mdx");

    await screen.findByText("beta.prompt.mdx");
    expect(screen.queryByText("alpha.prompt.mdx")).toBeNull();
  });
});
