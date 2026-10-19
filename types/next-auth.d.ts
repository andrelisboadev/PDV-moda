import type { Papel } from "@/lib/core/permissoes";

declare module "next-auth" {
  interface User {
    papel?: Papel;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    papel?: Papel;
  }
}
