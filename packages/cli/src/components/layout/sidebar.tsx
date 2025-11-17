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
  Stack,
  Typography,
} from "@mui/material";
import { Iconify } from "@/components";
import { Link } from "@/components";
import { usePathname } from "next/navigation";
import styled from "@emotion/styled";
import { useTranslations } from "next-intl";
import Image from "next/image";

const paths = {
  home: "/",
  requests: "/requests",
  traces: "/traces",
  sessions: "/sessions",
};

const iconfiy = (name: string) => <Iconify icon={name} />;

const navIcons = {
  requests: iconfiy("gravity-ui:list-check"),
  traces: iconfiy("oui:apm-trace"),
  sessions: iconfiy("mdi:account-group"),
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
    sessions: {
      label: t("sessions.title"),
      icon: navIcons.sessions,
      href: paths.sessions,
    },
  };

  return (
    <Drawer variant="permanent">
      <Toolbar>
        <Link href={paths.home}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Image src="/logo.svg" alt="Agentmark" width={24} height={24} />
            <Typography variant="h6">Agentmark</Typography>
          </Stack>
        </Link>
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
