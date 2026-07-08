import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/app/globals.css";
import { Providers } from "@/components/providers";
const inter = Inter({ subsets: ["latin"] });
export const metadata: Metadata = { title: "PDF Extractor", description: "Production-minded PDF extractor foundation" };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body className={inter.className}><Providers>{children}</Providers></body></html>; }
