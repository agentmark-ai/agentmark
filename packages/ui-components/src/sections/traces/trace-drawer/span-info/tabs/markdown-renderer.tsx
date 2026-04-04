import { useState } from "react";
import { Box, Typography, ToggleButtonGroup, ToggleButton, Button } from "@mui/material";
import ReactMarkdown from "react-markdown";

export const TRUNCATE_THRESHOLD = 10_000;
export const MARKDOWN_DISABLE_THRESHOLD = 50_000;

/** Format character count as an approximate size for display. */
export const formatLength = (chars: number): string => {
  if (chars < 1024) return `${chars} chars`;
  return `${(chars / 1024).toFixed(1)} K chars`;
};

const RawView = ({ content }: { content: string }) => (
  <Box
    component="pre"
    sx={{
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      fontFamily: "monospace",
      fontSize: "0.75rem",
      lineHeight: 1.6,
      backgroundColor: "grey.50",
      border: "1px solid",
      borderColor: "grey.200",
      borderRadius: 1,
      p: 2,
      m: 0,
      overflow: "auto",
      maxHeight: "600px",
      userSelect: "text",
      cursor: "text",
    }}
  >
    {content}
  </Box>
);

const MarkdownView = ({ content }: { content: string }) => (
  <Box sx={{ maxHeight: "600px", overflow: "auto" }}>
    <ReactMarkdown
      components={{
        p: ({ children }) => (
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mb: 1 }}>
            {children}
          </Typography>
        ),
        pre: ({ children }) => (
          <Box
            component="pre"
            sx={{
              backgroundColor: "grey.100",
              p: 2,
              borderRadius: 1,
              overflow: "auto",
              mb: 2,
              "& code": {
                fontFamily: "monospace",
                whiteSpace: "break-spaces",
                display: "block",
              },
            }}
          >
            <code>{children}</code>
          </Box>
        ),
        code: (props: any) => (
          <Typography
            component="code"
            sx={{
              fontFamily: "monospace",
              backgroundColor: "grey.100",
              p: 0.5,
              borderRadius: 0.5,
            }}
          >
            {props.children}
          </Typography>
        ),
        strong: ({ children }) => (
          <Typography
            component="span"
            sx={{ fontWeight: "bold", color: "primary.main" }}
          >
            {children}
          </Typography>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  </Box>
);

export const MarkdownRenderer = ({ content }: { content: string }) => {
  const [mode, setMode] = useState<"raw" | "markdown">("raw");
  const [showFull, setShowFull] = useState(false);

  const isLarge = content.length > TRUNCATE_THRESHOLD;
  const isTooLargeForMarkdown = content.length > MARKDOWN_DISABLE_THRESHOLD;
  const effectiveMode = isTooLargeForMarkdown ? "raw" : mode;
  const displayContent = isLarge && !showFull
    ? content.slice(0, TRUNCATE_THRESHOLD)
    : content;

  return (
    <Box sx={{ position: "relative" }}>
      {!isTooLargeForMarkdown && (
        <ToggleButtonGroup
          value={effectiveMode}
          exclusive
          onChange={(_, v) => v && setMode(v)}
          size="small"
          sx={{
            position: "absolute",
            top: 4,
            right: 4,
            zIndex: 1,
            backgroundColor: "background.paper",
            "& .MuiToggleButton-root": {
              textTransform: "none",
              fontSize: "0.65rem",
              py: 0.15,
              px: 0.75,
              lineHeight: 1.4,
            },
          }}
        >
          <ToggleButton value="raw">Raw</ToggleButton>
          <ToggleButton value="markdown">Markdown</ToggleButton>
        </ToggleButtonGroup>
      )}
      {effectiveMode === "raw" ? (
        <RawView content={displayContent} />
      ) : (
        <MarkdownView content={displayContent} />
      )}
      {isLarge && !showFull && (
        <Button
          size="small"
          onClick={() => setShowFull(true)}
          sx={{ mt: 0.5, textTransform: "none", fontSize: "0.75rem" }}
        >
          Show full content ({formatLength(content.length)})
        </Button>
      )}
    </Box>
  );
};
