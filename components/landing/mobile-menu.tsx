"use client";

// The header's section links on screens narrower than the desktop nav (below 1024px): a button that opens a short
// panel of the same links. It closes on Escape, on choosing a link, and on a press outside it.
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { NavLink } from "./site-chrome";
import s from "./landing.module.css";

export function MobileMenu({ nav }: { nav: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onPress = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPress);
    };
  }, [open]);

  return (
    <div ref={root} className={`${s.menu} lg:hidden`}>
      <button type="button" className={s.menuButton} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>
      <nav id={id} aria-label="Sections" hidden={!open} className={s.menuPanel}>
        {nav.map((l) => (
          <Link key={l.href} href={l.href} className={s.menuLink} aria-current={l.current ? "page" : undefined} onClick={() => setOpen(false)}>
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
