import { Container } from "@mui/material";

export const Main = ({ children }: { children: React.ReactNode }) => {
  return (
    <Container
      maxWidth="xl"
      sx={{
        ml: "240px",
        height: "100%",
        pt: "90px",
        width: "calc(100% - 240px)",
      }}
    >
      {children}
    </Container>
  );
};
