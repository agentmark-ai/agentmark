import { useEffect, useMemo, useState } from "react";
import { Box, Skeleton, Typography } from "@mui/material";
import { Iconify } from "@/components";
import { useTraceDrawerContext } from "../../../trace-drawer-provider";
import { OutputSection } from "../output-section";

/** Max on-screen height for a rendered image / scrollable text block (px). */
const MEDIA_MAX_HEIGHT = 480;
const TEXT_MAX_HEIGHT = 360;

/** Pointer recorded in SpanData.data.blobRefs for an offloaded field. */
interface BlobRef {
  field: string;
  blob_id: string;
  size: number;
}

interface MediaItem {
  mime: string;
  base64: string;
}

/**
 * Translation key per offloaded field — mirrors the inline output bubble's
 * labels (see `OutputAccordion`) so the same value reads identically whether or
 * not it was offloaded: a generation's response shows as "Assistant", an object
 * as "Output", tool calls as "Tool", input as "Input". Keyed off the ClickHouse
 * column the blob rehydrates into. Also gates which fields render.
 */
const FIELD_LABEL_KEY: Record<string, string> = {
  Input: "input",
  Output: "assistant",
  OutputObject: "output",
  ToolCalls: "tool",
};

const FIELD_ORDER = ["Input", "Output", "OutputObject", "ToolCalls"];

/** Icon per field for the section header (overridden by media kind below). */
const FIELD_ICON: Record<string, string> = {
  Input: "mdi:message-text",
  Output: "mdi:robot",
  OutputObject: "mdi:code-json",
  ToolCalls: "mdi:tools",
};

/** Approximate decoded byte size of a base64 string, formatted for display. */
function humanByteSize(base64: string): string {
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes >= 1_000_000) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * A rendered image inside a framed, transparency-aware container, capped to
 * {@link MEDIA_MAX_HEIGHT} so the whole image is visible at once. When (and only
 * when) the image is actually downscaled to fit the cap, an "Expand" affordance
 * appears and clicking toggles full (1:1) size, scrolling within the bounded box
 * rather than blowing out the drawer. A caption shows type, dimensions, and size.
 */
const MediaImage = ({ mime, base64, alt }: { mime: string; base64: string; alt: string }) => {
  const [zoomed, setZoomed] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [zoomable, setZoomable] = useState(false);

  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    setDims({ w: el.naturalWidth, h: el.naturalHeight });
    // Zoom only does something when the image is being scaled down to fit the
    // cap. A small image (already shown 1:1) is not zoomable — no misleading cursor.
    setZoomable(el.clientWidth > 0 && (el.naturalWidth > el.clientWidth || el.naturalHeight > el.clientHeight));
  };

  const caption = dims ? `${mime} · ${dims.w}×${dims.h} · ${humanByteSize(base64)}` : mime;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, alignItems: "flex-start" }}>
      <Box
        sx={{
          position: "relative",
          display: "inline-block",
          maxWidth: "100%",
          maxHeight: MEDIA_MAX_HEIGHT,
          overflow: zoomed ? "auto" : "hidden",
          borderRadius: 1,
          border: "1px solid",
          borderColor: "divider",
          // Checkerboard so transparent PNGs are visible instead of lost on white.
          backgroundColor: "background.paper",
          backgroundImage:
            "linear-gradient(45deg,rgba(0,0,0,0.06) 25%,transparent 25%,transparent 75%,rgba(0,0,0,0.06) 75%),linear-gradient(45deg,rgba(0,0,0,0.06) 25%,transparent 25%,transparent 75%,rgba(0,0,0,0.06) 75%)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0,8px 8px",
        }}
      >
        <img
          src={`data:${mime};base64,${base64}`}
          alt={alt}
          onLoad={onLoad}
          onClick={zoomable ? () => setZoomed((z) => !z) : undefined}
          title={zoomable ? (zoomed ? "Click to fit" : "Click to view full size") : undefined}
          style={
            zoomed
              ? { maxWidth: "none", display: "block", cursor: "zoom-out" }
              : {
                  maxWidth: "100%",
                  maxHeight: MEDIA_MAX_HEIGHT,
                  objectFit: "contain",
                  display: "block",
                  cursor: zoomable ? "zoom-in" : "default",
                }
          }
        />
        {zoomable && !zoomed && (
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              top: 6,
              right: 6,
              display: "flex",
              alignItems: "center",
              gap: 0.25,
              px: 0.5,
              py: 0.25,
              borderRadius: 0.5,
              bgcolor: "rgba(0,0,0,0.6)",
              color: "#fff",
              fontSize: 11,
              lineHeight: 1,
              pointerEvents: "none",
            }}
          >
            <Iconify icon="mdi:arrow-expand-all" width={12} />
            Expand
          </Box>
        )}
      </Box>
      {dims && (
        <Typography variant="caption" color="text.secondary">
          {caption}
        </Typography>
      )}
    </Box>
  );
};

/**
 * Parse the span's `blobRefs` JSON into the set of offloaded field names
 * (Input/Output/OutputObject/ToolCalls). Used by the preview renderers to
 * suppress the truncated inline preview for any field whose full value is
 * rendered here instead. Returns an empty set on missing/malformed input.
 */
export function parseOffloadedFieldNames(blobRefs?: string): Set<string> {
  if (!blobRefs) return new Set();
  try {
    const parsed = JSON.parse(blobRefs);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed
        .filter((r) => r && typeof r.field === "string" && r.field in FIELD_LABEL_KEY)
        .map((r) => r.field as string),
    );
  } catch {
    return new Set();
  }
}

/**
 * Walk an arbitrary parsed payload and collect every `{ mimeType|mediaType,
 * base64 }` leaf — covers image generation (array of items) and speech
 * generation (single item), wherever they sit in the payload shape.
 */
function collectMedia(value: unknown, acc: MediaItem[] = []): MediaItem[] {
  if (!value || typeof value !== "object") return acc;
  if (Array.isArray(value)) {
    for (const v of value) collectMedia(v, acc);
    return acc;
  }
  const obj = value as Record<string, unknown>;
  const mime = obj.mimeType ?? obj.mediaType;
  if (typeof mime === "string" && typeof obj.base64 === "string") {
    acc.push({ mime, base64: obj.base64 });
    return acc;
  }
  for (const v of Object.values(obj)) collectMedia(v, acc);
  return acc;
}

/**
 * Renders ONE offloaded field's full value, fetched on demand from object
 * storage via the host `fetchBlob`, inside the shared collapsible section so it
 * matches the inline output bubble (same header label — Assistant / Output /
 * Tool / Input). Image/audio render inline (height-capped, framed, captioned);
 * large text / JSON / tool calls render in a scrollable block so a big payload
 * never blows out the drawer.
 */
const OffloadedField = ({ field, blobId }: { field: string; blobId: string }) => {
  const { fetchBlob, t } = useTraceDrawerContext();
  const [state, setState] = useState<{ loading: boolean; content?: string; error?: boolean }>({
    loading: false,
  });

  useEffect(() => {
    if (!blobId || !fetchBlob) return;
    let cancelled = false;
    setState({ loading: true });
    fetchBlob(blobId)
      .then((content) => {
        if (cancelled) return;
        setState({ loading: false, content: content ?? undefined, error: content == null });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [blobId, fetchBlob]);

  const label = t(FIELD_LABEL_KEY[field] ?? "output");

  let body: React.ReactNode;
  let icon = FIELD_ICON[field] ?? "mdi:robot";

  if (state.loading) {
    body = <Skeleton variant="rounded" height={120} />;
  } else if (state.error || state.content == null) {
    body = (
      <Typography variant="body2" color="text.secondary">
        Could not load the full {label.toLowerCase()}.
      </Typography>
    );
  } else {
    let media: MediaItem[] = [];
    try {
      media = collectMedia(JSON.parse(state.content));
    } catch {
      /* not JSON — show as text */
    }
    if (media.length > 0) {
      // Header icon reflects the media kind (first item wins for a mixed array).
      icon = media[0]!.mime.startsWith("audio/") ? "mdi:volume-high" : "mdi:image";
      body = (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {media.map((m, i) =>
            m.mime.startsWith("image/") ? (
              <MediaImage key={i} mime={m.mime} base64={m.base64} alt={`${field} media`} />
            ) : m.mime.startsWith("audio/") ? (
              <audio key={i} controls src={`data:${m.mime};base64,${m.base64}`} />
            ) : null,
          )}
        </Box>
      );
    } else {
      body = (
        <Box style={{ maxHeight: TEXT_MAX_HEIGHT, overflow: "auto" }}>
          <Box
            component="pre"
            sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, m: 0 }}
          >
            {state.content}
          </Box>
        </Box>
      );
    }
  }

  return (
    <OutputSection title={label} icon={icon}>
      {body}
    </OutputSection>
  );
};

/**
 * Renders the FULL value of every span field that was offloaded to object
 * storage at ingest (the inline column holds only an 8KB preview). One section
 * per offloaded field, labeled to match the inline output bubble (Assistant /
 * Output / Tool / Input), with media rendered inline and text/JSON shown in full.
 *
 * `OutputObject` is derived from `Output` (the normalizer JSON-parses it), so
 * when both are offloaded we drop `OutputObject` to avoid rendering the same
 * payload twice; if only `OutputObject` is offloaded (e.g. an object-only
 * generation) it still renders.
 */
export const OffloadedFields = ({ blobRefs }: { blobRefs: string }) => {
  const fields = useMemo<BlobRef[]>(() => {
    let refs: BlobRef[];
    try {
      const parsed = JSON.parse(blobRefs);
      refs = Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
    const known = refs.filter(
      (r) => r && typeof r.blob_id === "string" && r.field in FIELD_LABEL_KEY,
    );
    const hasOutput = known.some((r) => r.field === "Output");
    const deduped = known.filter((r) => !(r.field === "OutputObject" && hasOutput));
    return deduped.sort((a, b) => FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field));
  }, [blobRefs]);

  if (fields.length === 0) return null;

  return (
    <>
      {fields.map((r) => (
        <OffloadedField key={r.field} field={r.field} blobId={r.blob_id} />
      ))}
    </>
  );
};
