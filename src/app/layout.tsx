import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteCredits } from "@/components/site-credits";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Steady — Surgical Motion Trainer",
  description:
    "Hardware-free AI surgical motion trainer with webcam coaching and 3D replay.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col">
        {children}
        <SiteCredits />
      </body>
    </html>
  );
}
