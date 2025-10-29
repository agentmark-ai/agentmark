"use client";

import {
  Drawer as MuiDrawer,
  ListItemIcon,
  ListItem,
  List,
  Toolbar,
  ListItemText,
  ListItemButton,
  drawerClasses,
} from "@mui/material";
import { Iconify } from "@/components";
import { Link } from "@/components";
import { usePathname } from "next/navigation";
import styled from "@emotion/styled";
import { useTranslations } from "next-intl";

const paths = {
  home: "/",
  requests: "/requests",
  traces: "/traces",
};

const iconfiy = (name: string) => <Iconify icon={name} />;

const navIcons = {
  requests: iconfiy("gravity-ui:list-check"),
  traces: iconfiy("oui:apm-trace"),
};

const drawerWidth = 240;

const Drawer = styled(MuiDrawer)({
  width: drawerWidth,
  flexShrink: 0,
  boxSizing: "border-box",
  [`& .${drawerClasses.paper}`]: {
    width: drawerWidth,
    boxSizing: "border-box",
  },
});

export const Sidebar = () => {
  const t = useTranslations();

  const pathname = usePathname();
  const isSelected = (href: string) => pathname === href;

  const navItems = {
    requests: {
      label: t("requests.title"),
      icon: navIcons.requests,
      href: paths.requests,
    },
    traces: {
      label: t("traces.title"),
      icon: navIcons.traces,
      href: paths.traces,
    },
  };

  return (
    <Drawer variant="permanent">
      <Toolbar>
        <Link href={paths.home}>Agentmark</Link>
      </Toolbar>
      <List dense>
        {Object.values(navItems).map((item) => (
          <ListItem component={Link} key={item.label} href={item.href}>
            <ListItemButton selected={isSelected(item.href)}>
              <ListItemIcon
                sx={{
                  color: isSelected(item.href)
                    ? "primary.main"
                    : "text.secondary",
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                sx={{
                  color: isSelected(item.href)
                    ? "primary.main"
                    : "text.secondary",
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Drawer>
  );
};
