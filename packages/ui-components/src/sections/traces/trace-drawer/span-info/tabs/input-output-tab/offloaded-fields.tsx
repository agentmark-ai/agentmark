import { useEffect, useMemo, useState } from "react";
import { Box, Skeleton, Typography } from "@mui/material";
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
 * Human label per offloaded field. Also gates which fields we render. The inline
 * preview for these fields is suppressed upstream (see `OutputAccordion`), so the
 * value rendered here IS the field — hence the plain name, not "Full output".
 */
const FIELD_LABEL: Record<string, string> = {
  Input: "Input",
  Output: "Output",
  OutputObject: "Output object",
  ToolCalls: "Tool calls",
};

const FIELD_ORDER = ["Input", "Output", "OutputObject", "ToolCalls"];

/** Icon per field for the section header (overridden by media kind below). */
const FIELD_ICON: Record<string, string> = {
  Input: "mdi:message-text",
  Output: "mdi:robot",
  OutputObject: "mdi:code-json",
  ToolCalls: "mdi:tools",
};

/**
 * A rendered image, capped to {@link MEDIA_MAX_HEIGHT} so the whole image is
 * visible at once. Click to toggle full (1:1) size, which scrolls within the
 * same bounded box rather than blowing out the drawer.
 */
const MediaImage = ({ src, alt }: { src: string; alt: string }) => {
  const [zoomed, setZoomed] = useState(false);
  return (
    <Box sx={{ maxHeight: MEDIA_MAX_HEIGHT, overflow: zoomed ? "auto" : "hidden" }}>
      <img
        src={src}
        alt={alt}
        onClick={() => setZoomed((z) => !z)}
        title={zoomed ? "Click to fit" : "Click to view full size"}
        style={
          zoomed
            ? { maxWidth: "none", borderRadius: 4, cursor: "zoom-out", display: "block" }
            : {
                maxWidth: "100%",
                maxHeight: MEDIA_MAX_HEIGHT,
                objectFit: "contain",
                borderRadius: 4,
                cursor: "zoom-in",
                display: "block",
              }
        }
      />
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
        .filter((r) => r && typeof r.field === "string" && r.field in FIELD_LABEL)
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
 * matches the inline output bubble. Image/audio render inline (height-capped,
 * click an image to view full size); large text / JSON / tool calls render in a
 * scrollable block so a big payload never blows out the drawer.
 */
const OffloadedField = ({ field, blobId }: { field: string; blobId: string }) => {
  const { fetchBlob } = useTraceDrawerContext();
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

  const label = FIELD_LABEL[field] ?? field;

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
              <MediaImage key={i} src={`data:${m.mime};base64,${m.base64}`} alt={`${field} media`} />
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
 * per offloaded field — Input / Output / OutputObject / ToolCalls — with media
 * rendered inline (unlabeled) and text/JSON shown in full under the field label.
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
    const known = refs.filter((r) => r && typeof r.blob_id === "string" && r.field in FIELD_LABEL);
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
