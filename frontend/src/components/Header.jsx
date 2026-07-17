import { Link, useLocation, useNavigate } from "react-router-dom";
import { getSession, clearSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default function Header() {
  const nav = useNavigate();
  const loc = useLocation();
  const session = getSession();
  const user = session?.user;

  const logout = () => {
    clearSession();
    nav("/");
  };

  return (
    <header
      data-testid="site-header"
      className="sticky top-0 z-50 backdrop-blur-xl bg-white/85 border-b border-[var(--border-default)]"
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 md:px-10 py-4">
        <Link
          to="/"
          data-testid="brand-link"
          className="flex items-center gap-3 group"
        >
          <span className="inline-block h-2.5 w-2.5 bg-[var(--brand-primary)]" />
          <span className="font-display font-black tracking-tight text-lg">
            SRM Elective Backup
          </span>
        </Link>

        <nav className="flex items-center gap-2 text-sm">
          {!user && (
            <>
              <Link
                to="/faculty/login"
                data-testid="nav-faculty-login"
                className={`px-3 py-2 hover:underline underline-offset-4 ${
                  loc.pathname.startsWith("/faculty") ? "underline" : ""
                }`}
              >
                Faculty
              </Link>
              <Link to="/">
                <Button
                  data-testid="nav-student-cta"
                  className="rounded-none bg-[var(--brand-primary)] hover:bg-black/85 text-white h-9 px-4"
                >
                  I couldn't poll
                </Button>
              </Link>
            </>
          )}
          {user && (
            <div className="flex items-center gap-4">
              <span className="hidden sm:inline text-[var(--text-secondary)]">
                {user.email} · <span className="uppercase text-xs tracking-widest">{user.role}</span>
              </span>
              <Button
                data-testid="nav-logout"
                variant="outline"
                onClick={logout}
                className="rounded-none border-[var(--border-default)] h-9"
              >
                Sign out
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
