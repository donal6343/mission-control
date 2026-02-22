import type { Metadata } from "next";
import { NavBar } from "@/components/layout/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Truebot Mission Control",
  description: "Truebot AI Agent Mission Control Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface antialiased">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
