import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Pocket Network Provider Dashboard",
  description: "Public provider-side revenue and relay intelligence for Pocket Network."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
