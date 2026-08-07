import type { Metadata, Viewport } from "next";
import { Prompt } from "next/font/google";
import { Toaster } from "sonner";
import { QueryProvider } from "@/components/query-provider";
import "./globals.css";

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ARENA POS Pro",
  description: "ระบบขายหน้าร้านและบัญชีสนามฟุตบอล",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${prompt.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <QueryProvider>{children}</QueryProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
