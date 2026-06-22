import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Typography,
  Box,
} from "@mui/material";
import { Iconify } from "@/components";

interface OutputSectionProps {
  /** Header label (e.g. "Assistant", "Output", "Input"). */
  title: string;
  /** Iconify icon name shown next to the title. */
  icon: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

/**
 * Collapsible section shell for the Input/Output tab — the styled accordion used
 * by both the inline output bubble (`OutputAccordion`) and each offloaded field
 * (`OffloadedField`), so they look and behave identically (header + chevron,
 * expanded by default, collapsible to hide a large payload).
 */
export const OutputSection = ({
  title,
  icon,
  children,
  defaultExpanded = true,
}: OutputSectionProps) => (
  <Accordion
    sx={{
      backgroundColor: "white",
      "&.MuiAccordion-root": { my: 0.5 },
      "&:before": { display: "none" },
    }}
    defaultExpanded={defaultExpanded}
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
        <Iconify icon={icon} width={16} />
        <Typography fontWeight={700} variant="body2" fontSize="0.8rem">
          {title}
        </Typography>
      </Box>
    </AccordionSummary>
    <AccordionDetails sx={{ px: 1, py: 0.5 }}>{children}</AccordionDetails>
  </Accordion>
);
