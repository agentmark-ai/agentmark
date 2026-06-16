import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Typography,
  Box,
  Chip,
} from "@mui/material";
import { Iconify } from "@/components";
import { MarkdownRenderer } from "../markdown-renderer";

/**
 * A retrieved document as surfaced by the normalizer's
 * `outputObject.documents` shape (OpenInference `retrieval.documents.*` and
 * OpenLLMetry `db.query.result` events both normalize to this).
 */
export interface RetrievalDocumentView {
  id?: string;
  content?: string;
  /** Relevance/similarity score (higher = closer). */
  score?: number;
  /** Vector distance (lower = closer); some stores report this instead. */
  distance?: number;
  metadata?: Record<string, unknown>;
}

interface RetrievalDocumentsProps {
  documents: RetrievalDocumentView[];
}

/** Trim a float to at most 4 significant decimals without trailing zeros. */
const formatScore = (n: number): string => parseFloat(n.toFixed(4)).toString();

const summarySx = {
  minHeight: "28px !important",
  px: 1,
  py: 0,
  "& .MuiAccordionSummary-content": {
    alignItems: "center",
    my: "4px !important",
  },
  "&.Mui-expanded": {
    minHeight: "28px !important",
    my: 0,
  },
} as const;

/**
 * Ranked retrieved-documents panel for retrieval / vector-store spans. Renders
 * each match in rank order with its id, relevance score (or vector distance),
 * content, and metadata — rather than collapsing everything into a single blob.
 */
export const RetrievalDocuments = ({ documents }: RetrievalDocumentsProps) => {
  if (!documents || documents.length === 0) return null;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5, mt: 0.5 }}>
        <Iconify icon="mdi:file-document-multiple-outline" width={16} />
        <Typography fontWeight={700} variant="body2" fontSize="0.8rem">
          Retrieved Documents ({documents.length})
        </Typography>
      </Box>

      {documents.map((doc, i) => (
        <Accordion
          key={doc.id ?? i}
          defaultExpanded={i === 0}
          sx={{
            backgroundColor: "white",
            "&.MuiAccordion-root": { my: 0.5 },
            "&:before": { display: "none" },
          }}
        >
          <AccordionSummary
            expandIcon={<Iconify icon="mdi:chevron-down" width={16} />}
            sx={summarySx}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
              <Typography fontWeight={700} variant="body2" fontSize="0.8rem">
                #{i + 1}
              </Typography>
              {doc.id && (
                <Typography
                  variant="caption"
                  sx={{ fontFamily: "monospace", color: "text.secondary" }}
                >
                  {doc.id}
                </Typography>
              )}
              {typeof doc.score === "number" && (
                <Chip size="small" variant="outlined" label={`score ${formatScore(doc.score)}`} />
              )}
              {typeof doc.distance === "number" && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`distance ${formatScore(doc.distance)}`}
                />
              )}
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 1, py: 0.5 }}>
            {doc.content ? (
              <MarkdownRenderer content={doc.content} />
            ) : (
              <Typography variant="body2" color="text.secondary">
                No content
              </Typography>
            )}
            {doc.metadata && Object.keys(doc.metadata).length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" fontWeight={700} component="div" sx={{ mb: 0.5 }}>
                  Metadata
                </Typography>
                <MarkdownRenderer
                  content={"```json\n" + JSON.stringify(doc.metadata, null, 2) + "\n```"}
                />
              </Box>
            )}
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};
