import type { Metadata } from "next";
import { Kumbh_Sans } from "next/font/google";

import "@/app/globals.css";

const kumbhSans = Kumbh_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-kumbh-sans"
});

export const metadata: Metadata = {
  title: "Pocket Network Provider Dashboard",
  description: "Public provider-side revenue and relay intelligence for Pocket Network."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${kumbhSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
