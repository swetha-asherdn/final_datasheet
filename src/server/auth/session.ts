import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";
import { AppError } from "@/lib/errors";

export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new AppError("Authentication required", 401);
  return session.user;
}
