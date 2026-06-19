import { useEffect, useMemo, useState } from "react";
import { Box, Skeleton, Typography } from "@mui/material";
import { useTraceDrawerContext } from "../../../trace-drawer-provider";

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

/** Human label per offloaded field. Also gates which fields we render. */
const FIELD_LABEL: Record<string, string> = {
  Input: "Full input",
  Output: "Full output",
  OutputObject: "Full output object",
  ToolCalls: "Full tool calls",
};

const FIELD_ORDER = ["Input", "Output", "OutputObject", "ToolCalls"];

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
 * storage via the host `fetchBlob`. Image/audio render inline; everything else
 * (large text, JSON object, tool calls) renders as full text.
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

  let body: React.ReactNode;
  if (state.loading) {
    body = <Skeleton variant="rounded" height={120} />;
  } else if (state.error || state.content == null) {
    body = (
      <Typography variant="body2" color="text.secondary">
        Could not load the full {(FIELD_LABEL[field] ?? field).replace(/^Full /, "")}.
      </Typography>
    );
  } else {
    let media: MediaItem[] = [];
    try {
      media = collectMedia(JSON.parse(state.content));
    } catch {
      /* not JSON — show as text */
    }
    body =
      media.length > 0 ? (
        media.map((m, i) =>
          m.mime.startsWith("image/") ? (
            <img
              key={i}
              src={`data:${m.mime};base64,${m.base64}`}
              alt={`${field} media`}
              style={{ maxWidth: "100%", borderRadius: 4 }}
            />
          ) : m.mime.startsWith("audio/") ? (
            <audio key={i} controls src={`data:${m.mime};base64,${m.base64}`} />
          ) : null,
        )
      ) : (
        <Box
          component="pre"
          sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, m: 0 }}
        >
          {state.content}
        </Box>
      );
  }

  return (
    <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography variant="overline" color="text.secondary">
        {FIELD_LABEL[field] ?? field}
      </Typography>
      {body}
    </Box>
  );
};

/**
 * Renders the FULL value of every span field that was offloaded to object
 * storage at ingest (the inline column holds only an 8KB preview). One labeled
 * section per offloaded field — Input / Output / OutputObject / ToolCalls —
 * with media rendered inline and text/JSON shown in full.
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
