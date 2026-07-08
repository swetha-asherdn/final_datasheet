import bcrypt from "bcryptjs";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import { z } from "zod";
import { connectToDatabase } from "@/server/db";
import { UserModel } from "@/server/models/user";

type LeanAuthUser = { _id: unknown; name?: string | null; email: string; passwordHash: string };
const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [CredentialsProvider({ name: "Email and password", credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } }, async authorize(credentials) { const parsed = credentialsSchema.safeParse(credentials); if (!parsed.success) return null; await connectToDatabase(); const user = await UserModel.findOne({ email: parsed.data.email.toLowerCase() }).lean<LeanAuthUser>(); if (!user) return null; const matches = await bcrypt.compare(parsed.data.password, user.passwordHash); if (!matches) return null; return { id: String(user._id), name: user.name ?? null, email: user.email }; } })],
  callbacks: { jwt({ token, user }) { if (user) token.id = user.id; return token; }, session({ session, token }) { if (session.user) session.user.id = String(token.id); return session; } }
};