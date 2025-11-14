"use client";

import { Main } from "./main";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

export const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <Header />
      <Sidebar />
      <Main>{children}</Main>
    </>
  );
};
