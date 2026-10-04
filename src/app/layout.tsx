import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HomePlanner",
  description: "A family planner with an AI assistant.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
