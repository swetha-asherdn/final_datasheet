import Link from "next/link";
import { getServerSession } from "next-auth";
import { FileText } from "lucide-react";
import { authOptions } from "@/server/auth/options";
import { LogoutButton } from "@/components/logout-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  return <div className="min-h-screen bg-background"><header className="border-b bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4"><Link href="/dashboard" className="flex items-center gap-2 font-semibold"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground"><FileText size={19} /></span>PDF Extractor</Link><div className="flex items-center gap-3 text-sm text-muted-foreground"><span className="hidden sm:inline">{session?.user?.email}</span><LogoutButton /></div></div></header>{children}</div>;
}
