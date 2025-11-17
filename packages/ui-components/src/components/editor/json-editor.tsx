import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";
import { useState } from "react";
import { Box, useTheme } from "@mui/system";

export function JsonEditor({
  defaultValue,
  onChange,
  value,
}: {
  defaultValue?: string;
  onChange?: (value: string) => void;
  value?: string;
}) {
  const [linterEnabled, setLinterEnabled] = useState<boolean>(
    !!defaultValue && defaultValue !== ""
  );
  const theme = useTheme()

  return (
    <Box
      sx={{
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: "8px",
        overflow: "hidden",
        fontSize: (theme.typography as any).fontSize,
      }}
      component={CodeMirror}
      value={value}
      basicSetup={{
        foldGutter: true,
      }}
      lang={"json"}
      extensions={[
        json(),
        ...(linterEnabled ? [linter(jsonParseLinter())] : []),
        EditorView.lineWrapping,
      ]}
      defaultValue={defaultValue}
      onChange={(c) => {
        if (onChange) onChange(c);
        setLinterEnabled(c !== "");
      }}
      editable={true}
    />
  );
}
