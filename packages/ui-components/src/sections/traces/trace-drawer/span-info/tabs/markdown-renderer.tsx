import { Box, Typography } from "@mui/material";
import ReactMarkdown from "react-markdown";

const CodeBlock = ({ children }: { children: string }) => {
  return (
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
  );
};

export const MarkdownRenderer = ({ content }: { content: string }) => (
  <ReactMarkdown
    components={{
      p: ({ children }) => (
        <Typography
          variant="body2"
          sx={{
            whiteSpace: "pre-wrap",
            mb: 1,
          }}
        >
          {children}
        </Typography>
      ),
      pre: ({ children }) => <CodeBlock>{children as string}</CodeBlock>,
      code: (props: any) => {
        return (
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
        );
      },
      strong: ({ children }) => (
        <Typography
          component="span"
          sx={{
            fontWeight: "bold",
            color: "primary.main",
          }}
        >
          {children}
        </Typography>
      ),
    }}
  >
    {content}
  </ReactMarkdown>
);
