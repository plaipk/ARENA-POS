import type { Metadata, Viewport } from "next";
import { Prompt } from "next/font/google";
import { Toaster } from "sonner";
import { QueryProvider } from "@/components/query-provider";
import { MainNav } from "@/components/nav/main-nav";
import "./globals.css";

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ARENA POS Pro",
  description: "ระบบขายหน้าร้านและบัญชีสนามฟุตบอล",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ARENA POS",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${prompt.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-slate-100 font-sans">
        <QueryProvider>
          <MainNav />
          <div className="flex flex-1 flex-col pb-16 md:pb-0">{children}</div>
        </QueryProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
