import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { setSession } from "@/lib/auth";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowRight, KeyRound } from "lucide-react";

export default function FacultyLogin() {
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", faculty_id: "", name: "", department: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.faculty_id) {
      toast.error("Email and Faculty ID required");
      return;
    }
    setBusy(true);
    try {
      const link = await api.post("/auth/request-link", { ...form, role: "faculty" });
      const verify = await api.post("/auth/verify", { token: link.data.token });
      setSession({ token: verify.data.session, user: verify.data.user });
      toast.success("Signed in.");
      nav("/faculty/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Sign-in failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen">
      <Header/>
      <div className="max-w-lg mx-auto px-6 md:px-10 py-16">
        <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-4">
          <KeyRound className="h-4 w-4"/>
          <span className="font-mono text-xs uppercase tracking-widest">Faculty · sign in</span>
        </div>
        <h1 data-testid="faculty-login-heading" className="font-display font-black tracking-tight text-4xl md:text-5xl">
          Review student submissions.
        </h1>
        <p className="mt-4 text-[var(--text-secondary)]">
          Enter your SRM faculty email and ID. We'll create a session immediately (email-link flow is mocked in this build).
        </p>

        <form onSubmit={submit} className="mt-10 space-y-5 border border-[var(--border-default)] bg-white p-8">
          <div>
            <Label className="text-xs uppercase tracking-widest text-[var(--text-secondary)]">Full name</Label>
            <Input data-testid="faculty-name" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
              placeholder="Dr. R. Kumar"
              className="rounded-none border-[var(--border-default)] mt-2 h-11 focus-visible:ring-0 focus-visible:border-black"/>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-widest text-[var(--text-secondary)]">Faculty ID</Label>
              <Input data-testid="faculty-id" value={form.faculty_id} onChange={(e) => setForm({...form, faculty_id: e.target.value})}
                placeholder="FAC1234"
                className="rounded-none border-[var(--border-default)] mt-2 h-11 focus-visible:ring-0 focus-visible:border-black font-mono"/>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-[var(--text-secondary)]">Department</Label>
              <Input data-testid="faculty-dept" value={form.department} onChange={(e) => setForm({...form, department: e.target.value})}
                placeholder="CSE"
                className="rounded-none border-[var(--border-default)] mt-2 h-11 focus-visible:ring-0 focus-visible:border-black"/>
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-[var(--text-secondary)]">SRM faculty email</Label>
            <Input data-testid="faculty-email" type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})}
              placeholder="you@srmist.edu.in"
              className="rounded-none border-[var(--border-default)] mt-2 h-11 focus-visible:ring-0 focus-visible:border-black"/>
          </div>
          <Button data-testid="faculty-signin-btn" type="submit" disabled={busy}
            className="w-full rounded-none bg-black text-white hover:bg-black/85 h-11">
            {busy ? "Signing in…" : "Sign in"} <ArrowRight className="ml-2 h-4 w-4"/>
          </Button>
        </form>
      </div>
    </div>
  );
}
