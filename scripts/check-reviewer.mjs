import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const u = await prisma.user.findUnique({
  where: { email: "reviewer@restoreassist.app" },
  select: {
    id: true,
    email: true,
    name: true,
    role: true,
    subscriptionStatus: true,
    password: true,
    emailVerified: true,
    twoFactorEnabled: true,
  },
});
if (!u) {
  console.log("NOT FOUND");
  process.exit(0);
}
console.log("user.id:", u.id);
console.log("email:", u.email);
console.log("role:", u.role);
console.log("subscriptionStatus:", u.subscriptionStatus);
console.log("emailVerified:", u.emailVerified);
console.log("twoFactorEnabled:", u.twoFactorEnabled);
console.log("password hash starts with:", u.password?.slice(0, 7));
console.log("password hash length:", u.password?.length);
console.log("---");
const ok = await bcrypt.compare("gD3#&6TUwgk!jDA@^fdA", u.password ?? "");
console.log("bcrypt.compare result:", ok);
await prisma.$disconnect();
