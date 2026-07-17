import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { setSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Header from "@/components/Header";
import { toast } from "sonner";
import { ArrowRight, Clock, AlertTriangle, ShieldCheck, MailCheck } from "lucide-react";

export default function Landing() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: "",
    name: "",
    reg_no: "",
    department: "",
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.reg_no || !form.name || !form.department) {
      toast.error("Fill all fields to continue");
      return;
    }
    setLoading(true);
    try {
      // 1) Request magic link
      const linkRes = await api.post("/auth/request-link", {
        ...form,
        role: "student",
      });
      // 2) Verify magic link (mocked email flow — auto-follow)
      const verifyRes = await api.post("/auth/verify", { token: linkRes.data.token });
      setSession({ token: verifyRes.data.session, user: verifyRes.data.user });
      // 3) Start the submission timer
      await api.post("/submissions/start");
      toast.success("Timer started. We'll ping you at the 31st minute.");
      nav("/student/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not start. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[var(--border-default)]">
        <img
          src="https://images.unsplash.com/photo-1520529890308-f503006340b4?crop=entropy&cs=srgb&fm=jpg&w=2000&q=70"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-[0.08]"
        />
        <div className="grain absolute inset-0" />
        <div className="max-w-6xl mx-auto px-6 md:px-10 pt-24 pb-32 relative">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <p
              data-testid="hero-eyebrow"
              className="text-xs uppercase tracking-[0.24em] text-[var(--text-secondary)] mb-6 font-mono"
            >
              For SRM students · unofficial backup channel
            </p>
            <h1
              data-testid="hero-heading"
              className="font-display font-black tracking-tight text-5xl sm:text-6xl lg:text-7xl leading-[0.95]"
            >
              Couldn't poll your electives?
              <br />
              <span className="text-[var(--text-secondary)]">
                We'll still get you registered.
              </span>
            </h1>
            <p
              data-testid="hero-subheading"
              className="mt-8 text-base md:text-lg text-[var(--text-secondary)] max-w-2xl"
            >
              When Academia locks up, this backup page starts a 30-minute grace
              window. At the 31st minute you get a link to submit your
              Professional / Open elective preferences directly to your faculty.
              No queues. No refresh loop.
            </p>

            <div className="mt-12 flex flex-wrap items-center gap-4">
              <Button
                data-testid="hero-start-btn"
                onClick={() => setOpen(true)}
                className="rounded-none h-14 px-8 text-base bg-[var(--brand-primary)] hover:bg-black/85 text-white active:scale-[0.98] transition"
              >
                I couldn't poll — start timer
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <a
                data-testid="hero-faculty-link"
                href="/faculty/login"
                className="text-sm text-[var(--text-primary)] underline underline-offset-4 hover:text-[var(--accent)]"
              >
                I'm faculty →
              </a>
            </div>
          </motion.div>

          {/* How it works */}
          <div className="mt-24 grid md:grid-cols-3 gap-px bg-[var(--border-default)] border border-[var(--border-default)]">
            {[
              {
                icon: <Clock className="h-5 w-5" />,
                title: "01 · Start the 30-min timer",
                body: "Tell us Reg. No, name, department & email. Timer starts on our server.",
              },
              {
                icon: <MailCheck className="h-5 w-5" />,
                title: "02 · Get the link at t = 31 min",
                body: "You'll receive a mail (and see it on your dashboard) unlocking the preference form.",
              },
              {
                icon: <ShieldCheck className="h-5 w-5" />,
                title: "03 · Faculty allocates → you accept",
                body: "Faculty reviews everyone's picks, assigns your courses. You accept or send back.",
              },
            ].map((s) => (
              <div
                key={s.title}
                data-testid={`hiw-step-${s.title.slice(0, 2)}`}
                className="bg-white p-8"
              >
                <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-4">
                  {s.icon}
                  <span className="font-mono text-xs uppercase tracking-widest">
                    {s.title}
                  </span>
                </div>
                <p className="text-[var(--text-primary)] leading-relaxed">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Notice */}
      <section className="max-w-6xl mx-auto px-6 md:px-10 py-16 grid md:grid-cols-2 gap-12">
        <div>
          <div className="flex items-center gap-2 text-[var(--alert)] mb-3">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-mono text-xs uppercase tracking-widest">
              Read once
            </span>
          </div>
          <h2 className="font-display font-black text-3xl md:text-4xl tracking-tight">
            This is a fallback — not a replacement.
          </h2>
        </div>
        <div className="text-[var(--text-secondary)] leading-relaxed space-y-4">
          <p>
            Always try Academia first. Only use this page after you've genuinely
            failed to poll. Once your electives are allocated here you'll
            confirm through your official channel.
          </p>
          <p>
            Your submission is visible only to your department's faculty
            coordinator.
          </p>
        </div>
      </section>

      {/* Inline modal (kept simple, no shadcn Dialog needed for a form-first UX) */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4"
          data-testid="start-modal"
          onClick={() => !loading && setOpen(false)}
        >
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white w-full max-w-lg border border-[var(--border-default)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8 border-b border-[var(--border-default)]">
              <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-secondary)]">
                Start · 30-minute timer
              </p>
              <h3 className="font-display font-black text-2xl mt-1 tracking-tight">
                Your details
              </h3>
            </div>
            <form onSubmit={submit} className="p-8 space-y-5">
              <div>
                <Label htmlFor="name" className="text-xs uppercase tracking-widest text-[var(--text-secondary)]">Full name</Label>
                <Input
                  id="name"
                  data-testid="start-input-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Aditya Kumar"
                  className="rounded-none border-[var(--border-default)] mt-2 h-11 focus-visible:ring-0 focus-visible:border-black"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="reg" className="text-xs uppercase tracking-widest text-[var(--text-secondary)]">Reg. No.</Label>
                  <Input
                    id="reg"
                    data-testid="start-input-regno"
                    value={form.reg_no}
                    onChange={(e) => setForm({ ...form, reg_no: e.target.value })}
                    placeholder="RA2311..."
                    className="rounded-none border-[var(--border-default)] mt-2 h-11 focus-visible:ring-0 focus-visible:border-black font-mono"
                  />
                </div>
                <div>
                  <Label htmlFor="dept" className="text-xs uppercase tracking-widest text-[var(--text-secondary)]">Department</Label>
                  <Input
                    id="dept"
                    data-testid="start-input-dept"
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    placeholder="CSE / ECE / ..."
                    className="rounded-none border-[var(--border-default)] mt-2 h-11 focus-visible:ring-0 focus-visible:border-black"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="email" className="text-xs uppercase tracking-widest text-[var(--text-secondary)]">SRM email</Label>
                <Input
                  id="email"
                  data-testid="start-input-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@srmist.edu.in"
                  className="rounded-none border-[var(--border-default)] mt-2 h-11 focus-visible:ring-0 focus-visible:border-black"
                />
              </div>
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  data-testid="start-modal-cancel"
                  className="text-sm text-[var(--text-secondary)] hover:text-black underline underline-offset-4"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  disabled={loading}
                  data-testid="start-modal-submit"
                  className="rounded-none bg-[var(--brand-primary)] hover:bg-black/85 text-white h-11 px-6"
                >
                  {loading ? "Starting…" : "Start timer"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
