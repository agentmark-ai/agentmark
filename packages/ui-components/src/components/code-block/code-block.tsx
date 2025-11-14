import { IconButton, Tooltip } from "@mui/material";
import { Box } from "@mui/system";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism, SyntaxHighlighterProps } from "react-syntax-highlighter";
import { nord as codeTheme } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Iconify } from "@/components";

const SyntaxHighlighter = (Prism as any) as React.FC<SyntaxHighlighterProps>;

export const CodeBlock = ({
  codeString,
  language,
}: {
  codeString: string;
  language: string;
}) => {
  const [copyTooltip, setCopyTooltip] = useState("Copy");

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString).then(() => {
      setCopyTooltip("Copied");
      setTimeout(() => setCopyTooltip("Copy"), 2000);
    });
  };

  return (
    <Box
      width="100%"
      display="block"
      sx={{ mt: 0.5, position: "relative" }}
    >
      <Tooltip title={copyTooltip} arrow>
        <IconButton
          onClick={handleCopy}
          sx={{ position: "absolute", top: 0, right: 0 }}
        >
          <Iconify icon="mdi:content-copy" />
        </IconButton>
      </Tooltip>
      <Markdown
        components={{
          code(props) {
            const { children, className, node, ref, ...rest } = props;
            const match = /language-(\w+)/.exec(className || "");
            return match ? (
              <SyntaxHighlighter
                {...rest}
                ref={ref as any}
                PreTag="div"
                children={String(children).replace(/\n$/, "")}
                language={match[1]}
                style={codeTheme}
              />
            ) : (
              <code {...rest} className={className}>
                {children}
              </code>
            );
          },
        }}
        children={`\`\`\`${language}\n${codeString}\n\`\`\``}
        remarkPlugins={[remarkGfm]}
      />
    </Box>
  );
};
