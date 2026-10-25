// The public pages' header and footer (landing, upload): the same walnut-and-brass chrome around each page.
import Image from "next/image";
import Link from "next/link";
import { DEMO_HREF } from "./demo";
import { MobileMenu } from "./mobile-menu";
import s from "./landing.module.css";

export type NavLink = { href: string; label: string; current?: boolean };

export { DEMO_HREF };

/** Section links on the landing page; the other pages point back at them. */
export const SITE_NAV = (onLanding: boolean): NavLink[] => [
  { href: onLanding ? "#promises" : "/#promises", label: "What it does" },
  { href: onLanding ? "#how" : "/#how", label: "How it works" },
  { href: onLanding ? "#results" : "/#results", label: "Results" },
  { href: onLanding ? "#limits" : "/#limits", label: "Limits in code" },
  { href: onLanding ? "#responsible" : "/#responsible", label: "Responsible design" },
  { href: "/upload", label: "Upload a tape", current: !onLanding },
];

export function SiteHeader({ nav }: { nav: NavLink[] }) {
  return (
    <>
      {/* first Tab stop: jumps past the header to the page's content */}
      <a href="#main" className={s.skip}>
        Skip to content
      </a>
      <header className={s.header}>
        <div className={`${s.gutter} flex items-center justify-between gap-4 py-2.5`}>
          <Link href="/" aria-label="Threadpull home" className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-terracotta">
            <Image src="/hazel/threadpull-full-logo.png" alt="Threadpull" width={1998} height={787} priority
              className="h-11 w-auto sm:h-13" sizes="160px" />
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-7 text-[0.95rem] font-medium lg:flex">
            {nav.map((l) => (
              <Link key={l.href} className={s.navLink} href={l.href} aria-current={l.current ? "page" : undefined}
                data-current={l.current || undefined}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2.5">
            <Link href={DEMO_HREF} className={`brass-plate ${s.brass} !px-4 !py-2 text-sm`}>
              Open the room
            </Link>
            <MobileMenu nav={nav} />
          </div>
        </div>
      </header>
    </>
  );
}

export function SiteFooter({ onLanding }: { onLanding: boolean }) {
  const at = (hash: string) => (onLanding ? hash : `/${hash}`);
  return (
    <footer className={`${s.footer} mt-10 pt-10 pb-12`}>
      <div className={`${s.gutter} flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center`}>
        <div className="flex items-center gap-4">
          <Image src="/hazel/threadpull-icon.png" alt="" width={1254} height={1254} sizes="64px" className="h-14 w-14" />
          <div>
            <p className="font-display text-xl font-semibold">Threadpull</p>
            <p className="text-sm text-cream/80">Built at Cal Hacks 13.0 with the CRS Credit API sandbox and Claude.</p>
          </div>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <Link className={s.footerLink} href={DEMO_HREF}>Investigator room</Link>
          <Link className={s.footerLink} href="/upload">Upload a tape</Link>
          <Link className={s.footerLink} href={at("#how")}>How it works</Link>
          <Link className={s.footerLink} href={at("#responsible")}>Responsible design</Link>
        </nav>
      </div>
    </footer>
  );
}
