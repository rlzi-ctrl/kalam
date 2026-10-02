"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Speak" },
  { href: "/say", label: "Say it" },
  { href: "/voices", label: "Voices" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      <span className="brand">Kalam</span>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={path === l.href ? "on" : ""}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
