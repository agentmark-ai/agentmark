import NextAuth from "next-auth"
import type { AuthUser } from "./index"

declare module "next-auth" {
  interface Session {
    user: AuthUser
  }

  interface User extends AuthUser {}
}