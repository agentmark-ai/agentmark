/**
 * ExpandableCell Component
 *
 * A table cell that truncates long text and reveals the full value via a
 * "show more" / "show less" toggle. Shared by the experiment comparison
 * table and the single-experiment detail table so both stay consistent.
 */

import { IconButton, TableCell, Typography } from "@mui/material";
import { Stack } from "@mui/system";
import { Iconify } from "@/components";

// ----------------------------------------------------------------------

/**
 * Default character budget before a cell value is truncated.
 * Shared so the comparison and detail tables truncate at the same point.
 */
export const OUTPUT_TRUNCATE_LENGTH = 120;

/**
 * Shared styling for cells that hold long, free-form text (input / output /
 * expected output). Caps the cell size and lets overflow scroll.
 */
export const scrollableCellSx = {
  maxWidth: 300,
  maxHeight: 120,
  overflow: "auto",
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
};

/**
 * Truncate `text` to `maxLength` characters, appending an ellipsis when the
 * value is actually shortened.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

// ----------------------------------------------------------------------

export interface ExpandableCellProps {
  text: string;
  maxLength: number;
  isExpanded: boolean;
  onToggle: () => void;
  t: (key: string) => string;
}

export function ExpandableCell({
  text,
  maxLength,
  isExpanded,
  onToggle,
  t,
}: ExpandableCellProps) {
  if (!text) {
    return (
      <TableCell>
        <Typography variant="body2" color="text.disabled">{"–"}</Typography>
      </TableCell>
    );
  }

  const isTruncated = text.length > maxLength;
  const displayText = isExpanded ? text : truncateText(text, maxLength);

  return (
    <TableCell sx={scrollableCellSx}>
      <Stack spacing={0.5}>
        <Typography
          variant="caption"
          component="div"
          sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
        >
          {displayText}
        </Typography>
        {isTruncated && (
          <IconButton size="small" onClick={onToggle} sx={{ alignSelf: "flex-start" }}>
            <Iconify
              icon={isExpanded ? "mdi:chevron-up" : "mdi:chevron-down"}
              width={16}
            />
            <Typography variant="caption" sx={{ ml: 0.5 }}>
              {isExpanded ? t("showLess") : t("showMore")}
            </Typography>
          </IconButton>
        )}
      </Stack>
    </TableCell>
  );
}
