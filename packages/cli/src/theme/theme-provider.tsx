"use client";
import { ThemeProvider as MuiThemeProvider } from "@mui/material";
import { theme } from "./theme";

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  return <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>;
};
