import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { setSession } from "@/lib/auth";
import Header from "@/components/Header";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function VerifyLink() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get("token");

  useEffect(() => {
    (async () => {
      if (!token) { nav("/"); return; }
      try {
        const r = await api.post("/auth/verify", { token });
        setSession({ token: r.data.session, user: r.data.user });
        toast.success("Signed in.");
        nav(r.data.user.role === "faculty" ? "/faculty/dashboard" : "/student/dashboard");
      } catch (e) {
        toast.error("Link expired or invalid");
        nav("/");
      }
    })();
  }, [token, nav]);

  return (
    <div className="min-h-screen">
      <Header/>
      <div className="max-w-lg mx-auto p-16 text-center">
        <Loader2 className="animate-spin h-5 w-5 inline mr-2 text-[var(--text-secondary)]"/>
        <span className="text-[var(--text-secondary)]">Verifying your sign-in link…</span>
      </div>
    </div>
  );
}
