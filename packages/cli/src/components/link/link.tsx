import { Link as MuiLink, LinkProps as MuiLinkProps } from "@mui/material";
import { RouterLink, RouterLinkProps } from "@/router";

export const Link = (props: MuiLinkProps & RouterLinkProps) => {
  return <MuiLink component={RouterLink} {...props} />;
};
