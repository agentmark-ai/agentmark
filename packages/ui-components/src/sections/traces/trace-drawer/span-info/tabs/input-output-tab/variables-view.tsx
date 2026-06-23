import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Typography,
  Box,
} from "@mui/material";
import { Iconify } from "@/components";

interface VariablesViewProps {
  variables: Record<string, unknown>;
}

/**
 * Renders a generation span's template variables (the prompt props / input
 * variables) as raw JSON — the "Variables" lens on the input, distinct from
 * the rendered chat "Messages".
 *
 * This mirrors how the rest of the ecosystem separates the two
 * representations: OpenInference records `llm.prompt_template.variables` (the
 * key→value props) apart from `llm.input_messages` (the rendered messages),
 * and Langfuse keeps a prompt's `{{variables}}` distinct from its compiled
 * messages. Variables are structured data, so they're shown as raw JSON — not
 * routed through the markdown renderer.
 */
export const VariablesView = ({ variables }: VariablesViewProps) => {
  return (
    <Accordion
      sx={{
        backgroundColor: "white",
        "&.MuiAccordion-root": { my: 0.5 },
        "&:before": { display: "none" },
      }}
      defaultExpanded
    >
      <AccordionSummary
        expandIcon={<Iconify icon="mdi:chevron-down" width={16} />}
        sx={{
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
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Iconify icon="mdi:code-braces" width={16} />
          <Typography fontWeight={700} variant="body2" fontSize="0.8rem">
            Variables
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 1, py: 0.5 }}>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 1,
            fontFamily: "monospace",
            fontSize: "0.8rem",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            backgroundColor: "grey.50",
            borderRadius: 1,
            overflowX: "auto",
          }}
        >
          {JSON.stringify(variables, null, 2)}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};
