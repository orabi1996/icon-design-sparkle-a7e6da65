import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { MaterialIcon } from "@/components/MaterialIcon";
import { MegaMenu } from "@/components/MegaMenu";
import { nav } from "@/components/hr/nav-data";
import { supabase } from "@/integrations/supabase/client";
import { CompanyWorkspaceProvider, useCompanyWorkspace } from "@/components/hr/CompanyWorkspace";
import { ScreenDirectory } from "@/components/hr/ScreenDirectory";

const ShellContext = createContext(false);
function CompanyName() {
  const { selectedCompany } = useCompanyWorkspace();
  return <>{selectedCompany?.display_name || "نظام الموارد البشرية"}</>;
}

function useSession() {
  const [state, setState] = useState<{ ready: boolean; email: string | null }>({
    ready: false,
    email: null,
  });
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) =>
      setState({ ready: true, email: data.session?.user.email ?? null }),
    );
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setState({ ready: true, email: session?.user.email ?? null }),
    );
    return () => sub.subscription.unsubscribe();
  }, []);
  return state;
}

export function AppShell({ children }: { children: ReactNode }) {
  const nested = useContext(ShellContext);
  if (nested) return <>{children}</>;
  return <ShellContext.Provider value={true}><AuthenticatedShell>{children}</AuthenticatedShell></ShellContext.Provider>;
}

function AuthenticatedShell({ children }: { children: ReactNode }) {
  const [directoryOpen, setDirectoryOpen] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("screens") === "all") setDirectoryOpen(true);
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setDirectoryOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { ready, email } = useSession();

  useEffect(() => {
    if (ready && !email) navigate({ to: "/auth", replace: true });
  }, [ready, email, navigate]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (!ready || !email) {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-[#f8fafd]">
        <div className="flex flex-col items-center gap-3">
          <div className="size-12 rounded-full border-4 border-[#0b57d0]/20 border-t-[#0b57d0] animate-spin" />
          <span className="text-xs font-bold text-slate-500 font-mono">جاري تحميل نظام الموارد البشرية...</span>
        </div>
      </div>
    );
  }

  return (
    <CompanyWorkspaceProvider>
    <div dir="rtl" className="min-h-screen bg-[#f8fafd] text-slate-900 font-sans antialiased">
      <header className="sticky top-0 z-30 shadow-xs">
        {/* Google Workspace Style Top App Bar */}
        <div className="flex h-16 items-center gap-4 border-b border-topbar-border bg-topbar px-4 text-topbar-foreground md:px-6">
          <Link to="/" className="flex items-center gap-3 group">
            <span className="grid size-10 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur-md transition-transform group-hover:scale-105">
              <MaterialIcon name="diversity_3" size={22} filled className="text-white" />
            </span>
            <span className="leading-tight">
              <span className="block text-base font-black tracking-tight">نظام الموارد البشرية</span>
              <span className="block text-[11px] font-medium text-topbar-muted">
                <CompanyName />
              </span>
            </span>
          </Link>

          <button type="button" onClick={() => setDirectoryOpen(true)} className="mx-auto hidden w-full max-w-lg items-center gap-2.5 rounded-full bg-white/12 px-4 py-2 text-right ring-1 ring-white/20 hover:bg-white/20 lg:flex" aria-label="فتح دليل الشاشات">
            <MaterialIcon name="search" size={20} className="text-topbar-muted" />
            <span className="flex-1 text-xs text-topbar-muted">ابحث عن شاشة في النظام...</span>
            <kbd className="rounded-full bg-white/15 px-2 py-0.5 text-[10px]">Ctrl+K</kbd>
          </button>

          {/* Top Actions & Profile */}
          <div className="ms-auto flex items-center gap-1.5">
            <TopAction icon="notifications" title="التعميمات وإشعارات الطلبات" to="/request-notifications" />
            <TopAction icon="task_alt" title="المهام والطلبات" to="/tasks" />

            <div className="mx-2 hidden h-7 w-px bg-white/20 sm:block" />

            {/* Google Profile Pill Chip */}
            <div className="flex items-center gap-2.5 rounded-full bg-white/10 py-1 pe-3 ps-1 ring-1 ring-white/15">
              <span className="grid size-8 place-items-center rounded-full bg-[#0b57d0] text-sm font-bold text-white shadow-2xs">
                <MaterialIcon name="person" size={18} filled />
              </span>
              <span className="hidden text-right leading-tight sm:block">
                <span className="block text-xs font-bold text-white">مرحباً بك</span>
                <span className="block max-w-[130px] truncate text-[10px] font-medium text-topbar-muted">
                  {email}
                </span>
              </span>
            </div>

            <button
              onClick={signOut}
              className="grid size-9.5 place-items-center rounded-full text-topbar-muted transition-colors hover:bg-white/15 hover:text-white"
              aria-label="تسجيل الخروج"
              title="تسجيل الخروج"
            >
              <MaterialIcon name="logout" size={20} />
            </button>
          </div>
        </div>

        <MegaMenu items={nav} />
      </header>

      <main className="min-w-0 px-4 py-6 md:px-8 max-w-[1600px] mx-auto">
        {children}

        <footer className="mt-12 mb-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-5 text-xs font-semibold text-slate-500">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span>نظام إدارة الموارد البشرية · تطوير الوظائف على مراحل</span>
          </div>
          <div>
            جميع الحقوق محفوظة © <span className="text-[#0b57d0] font-bold"><CompanyName /></span> {new Date().getFullYear()}
          </div>
        </footer>
      </main>

      {/* Google Material 3 Floating Action Button (FAB) */}
      <button
        className="fixed bottom-6 left-6 grid size-14 place-items-center rounded-2xl bg-[#0b57d0] text-white shadow-[0_4px_16px_0_rgba(11,87,208,0.35)] transition-transform hover:scale-105 active:scale-95"
        aria-label="دليل جميع الشاشات"
        title="دليل جميع الشاشات"
        onClick={() => setDirectoryOpen(true)}
      >
        <MaterialIcon name="apps" size={24} filled />
      </button>
      <ScreenDirectory open={directoryOpen} onOpenChange={setDirectoryOpen} />
    </div>
    </CompanyWorkspaceProvider>
  );
}

function TopAction({ icon, title, to }: { icon: string; title: string; to: string }) {
  return (
    <Link to={to as never} title={title} aria-label={title} className="relative grid size-9.5 place-items-center rounded-full text-topbar-muted transition-colors hover:bg-white/15 hover:text-white">
      <MaterialIcon name={icon} size={20} />
    </Link>
  );
}
