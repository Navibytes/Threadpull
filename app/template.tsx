// A template re-mounts on every navigation, so each page eases in when you move between the board and the
// dashboard. Opacity and a few pixels of rise only; reduced-motion visitors get no animation (see globals.css).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
