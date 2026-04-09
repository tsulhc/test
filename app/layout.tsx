import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Pocket Dashboard RC0",
  description: "Demo live senza database per analizzare relay e revenue dei provider Pocket Network"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
