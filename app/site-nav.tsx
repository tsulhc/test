"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/providers", label: "Providers" },
  { href: "/chains", label: "Chains" },
  { href: "/rewards", label: "Rewards" }
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <Link href="/" className="site-brand" aria-label="Pocket Provider Dashboard home">
        <span className="site-brand-mark">P</span>
        <span>Pocket Providers</span>
      </Link>

      <nav className="site-nav" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={`site-nav-link${isActive(pathname, item.href) ? " active" : ""}`}>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
