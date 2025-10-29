import { Box } from "@mui/material";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";

interface AttributesViewerProps {
  attributes: Record<string, any>;
}

export const AttributesViewer = ({ attributes }: AttributesViewerProps) => (
  <Box position="relative">
    <Box
      position="absolute"
      left={0}
      right={0}
      sx={{
        width: "100%",
        overflow: "hidden",
        "& .cm-editor": {
          borderRadius: 1,
          fontSize: "14px",
          maxWidth: "100%",
          overflow: "hidden",
        },
      }}
    >
      <CodeMirror
        value={JSON.stringify(attributes, null, 2)}
        extensions={[json()]}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: false,
          dropCursor: false,
        }}
        editable={false}
        style={{
          fontSize: "13px",
          maxWidth: "100%",
        }}
        height="100%"
      />
    </Box>
  </Box>
);
