import type { ReactNode } from "react";
import "@pacific2/tokens/tokens.css";

export const metadata = {
  title: "Pacific2 Back Office",
  description: "Operators, sites, stores, menus, staff, devices and reports.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "var(--p2-font-family-sans)", margin: 0 }}>{children}</body>
    </html>
  );
}
