import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Data Wonosobo — Portal Open Data Kabupaten Wonosobo",
  description:
    "Portal data terbuka Pemerintah Kabupaten Wonosobo. Akses dataset publik dari berbagai organisasi pemerintah daerah.",
  keywords: [
    "data wonosobo",
    "open data",
    "kabupaten wonosobo",
    "data publik",
    "pemerintah daerah",
    "dataset",
  ],
  authors: [{ name: "Pemerintah Kabupaten Wonosobo" }],
  openGraph: {
    title: "Data Wonosobo — Portal Open Data",
    description:
      "Portal data terbuka Pemerintah Kabupaten Wonosobo. Akses dataset publik dari berbagai organisasi pemerintah daerah.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}