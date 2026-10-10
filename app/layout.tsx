import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "@/components/ui/toast";
import { ThemeProvider } from "@/components/maps/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "unmap Maps",
  description: "Search, directions, travel-time areas, road events and scheduled transit, built on the unmap APIs.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="h-dvh overflow-hidden antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <Toaster>{children}</Toaster>
        </ThemeProvider>
      </body>
    </html>
  );
}
