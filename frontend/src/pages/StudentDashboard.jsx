import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { getSession, clearSession } from "@/lib/auth";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  Clock, CheckCircle2, XCircle, Send, ArrowRight, Info, Loader2, ThumbsUp, ThumbsDown,
} from "lucide-react";

function pad(n) { return String(n).padStart(2, "0"); }

function useCountdown(unlockAtISO) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!unlockAtISO) return;
    const tick = () => {
      const rem = Math.max(0, new Date(unlockAtISO).getTime() - Date.now());
      setRemaining(rem);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [unlockAtISO]);
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return { ms: remaining, mm: pad(m), ss: pad(s), done: remaining <= 0 };
}

export default function StudentDashboard() {
  const nav = useNavigate();
  const [session] = useState(() => getSession());
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get("/submissions/mine");
      const active = r.data.submissions[0];
      setSub(active || null);
    } catch (e) {
      if (e?.response?.status === 401) {
        clearSession();
        nav("/");
      }
    } finally {
      setLoading(false);
    }
  }, [nav]);

  useEffect(() => {
    if (!session || session.user?.role !== "student") { nav("/"); return; }
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [nav, refresh, session]);

  if (loading) {
    return (
      <div className="min-h-screen"><Header/>
        <div className="max-w-3xl mx-auto p-16 text-center text-[var(--text-secondary)]">
          <Loader2 className="animate-spin inline mr-2 h-4 w-4"/>Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <div className="max-w-3xl mx-auto px-6 md:px-10 py-12">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-secondary)]" data-testid="student-eyebrow">
          Student · {session?.user?.reg_no}
        </p>
        <h1 className="font-display font-black tracking-tight text-4xl md:text-5xl mt-2" data-testid="student-heading">
          Hi {session?.user?.name?.split(" ")[0] || "Student"} —
        </h1>

        {!sub && (
          <NoSubmission onStarted={refresh}/>
        )}

        {sub && sub.status === "timer" && (
          <TimerPanel sub={sub} onUnlock={refresh}/>
        )}

        {sub && (sub.status === "awaiting_preferences" || (sub.status === "timer" && sub.unlocked)) && (
          <PreferencesForm sub={sub} onSubmitted={refresh}/>
        )}

        {sub && sub.status === "submitted" && <WaitingForAllocation sub={sub}/>}
        {sub && sub.status === "completed_no_action" && <AllDone/>}
        {sub && sub.status === "allocated" && (
          <AllocationDecision sub={sub} onResponded={refresh}/>
        )}
        {sub && sub.status === "accepted" && <AllocationAccepted sub={sub}/>}
        {sub && sub.status === "rejected" && <AllocationRejected sub={sub}/>}
      </div>
    </div>
  );
}

/* ---------------- Panels ---------------- */

function NoSubmission({ onStarted }) {
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      await api.post("/submissions/start");
      toast.success("Timer started");
      onStarted();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to start");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-10 p-8 border border-[var(--border-default)] bg-white" data-testid="no-submission-panel">
      <p className="text-[var(--text-secondary)] mb-6">You don't have an active submission. Start one when Academia locks you out.</p>
      <Button data-testid="btn-start-timer" disabled={busy} onClick={start} className="rounded-none bg-black text-white hover:bg-black/85 h-11">
        {busy ? "Starting…" : "Start 30-min timer"} <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

function TimerPanel({ sub, onUnlock }) {
  const { mm, ss, done } = useCountdown(sub.unlock_at);
  useEffect(() => { if (done) onUnlock(); }, [done, onUnlock]);
  const alert = parseInt(mm, 10) < 5;
  return (
    <div className="mt-10" data-testid="timer-panel">
      <div className="border border-[var(--border-default)] bg-white p-8 md:p-12">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-secondary)]">Time remaining</p>
        <div className={`font-mono font-light text-7xl md:text-8xl tracking-tighter mt-3 ${alert ? "timer-alert" : ""}`} data-testid="timer-display">
          {mm}:{ss}
        </div>
        <p className="mt-6 text-[var(--text-secondary)] max-w-xl">
          Keep this tab open. When the timer hits zero we'll unlock your preferences form here (and send you an email link).
        </p>
      </div>
      <div className="mt-6 flex items-start gap-3 text-sm text-[var(--text-secondary)]">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0"/>
        <p>Wondering why we wait? It gives Academia one final grace window in case polling comes back online.</p>
      </div>
    </div>
  );
}

function PreferencesForm({ sub, onSubmitted }) {
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState("");
  const [profCount, setProfCount] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [profPrefs, setProfPrefs] = useState([]);
  const [openPrefs, setOpenPrefs] = useState([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setProfPrefs((prev) => resizePrefs(prev, profCount));
  }, [profCount]);
  useEffect(() => {
    setOpenPrefs((prev) => resizePrefs(prev, openCount));
  }, [openCount]);

  const canNext = useMemo(() => {
    if (step === 1) return status !== "";
    if (step === 2) {
      if (status === "both") return true;
      const total = (needsProf(status) ? profCount : 0) + (needsOpen(status) ? openCount : 0);
      return total > 0;
    }
    return true;
  }, [step, status, profCount, openCount]);

  const submit = async () => {
    setBusy(true);
    try {
      const body = {
        elective_status: status === "both" ? "both" : "partial",
        notes,
        professional: needsProf(status) ? { count: profCount, preferences: profPrefs } : null,
        open: needsOpen(status) ? { count: openCount, preferences: openPrefs } : null,
      };
      await api.post(`/submissions/${sub.id}/preferences`, body);
      toast.success("Submitted. Faculty will allocate soon.");
      onSubmitted();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to submit");
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-10" data-testid="prefs-form">
      <div className="border border-[var(--border-default)] bg-white">
        <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-secondary)]">
            Step {step} of {status === "both" ? 2 : 3}
          </p>
          <StepIndicator step={step} total={status === "both" ? 2 : 3}/>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -20, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="p-8 md:p-10"
          >
            {step === 1 && (
              <div>
                <h2 className="font-display font-black text-2xl md:text-3xl tracking-tight">
                  What did you manage to fill on Academia?
                </h2>
                <RadioGroup value={status} onValueChange={setStatus} className="mt-8 space-y-3">
                  {[
                    { v: "both", label: "Both Professional & Open — I'm all set" },
                    { v: "prof_missing", label: "I filled Open but NOT Professional" },
                    { v: "open_missing", label: "I filled Professional but NOT Open" },
                    { v: "neither", label: "Neither — I couldn't fill any" },
                  ].map((opt) => (
                    <label
                      key={opt.v}
                      htmlFor={`opt-${opt.v}`}
                      data-testid={`status-opt-${opt.v}`}
                      className={`flex items-center gap-4 p-4 border cursor-pointer transition ${
                        status === opt.v ? "border-black bg-[var(--surface-hover)]" : "border-[var(--border-default)] hover:bg-[var(--surface-hover)]"
                      }`}
                    >
                      <RadioGroupItem value={opt.v} id={`opt-${opt.v}`} />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
            )}

            {step === 2 && status !== "both" && (
              <div>
                <h2 className="font-display font-black text-2xl md:text-3xl tracking-tight">
                  How many electives do you need?
                </h2>
                <div className="mt-8 grid sm:grid-cols-2 gap-6">
                  {needsProf(status) && (
                    <CountCard testId="count-prof" label="Professional electives" value={profCount} setValue={setProfCount}/>
                  )}
                  {needsOpen(status) && (
                    <CountCard testId="count-open" label="Open electives" value={openCount} setValue={setOpenCount}/>
                  )}
                </div>
              </div>
            )}

            {step === 2 && status === "both" && (
              <div>
                <h2 className="font-display font-black text-2xl md:text-3xl tracking-tight">
                  You're already done.
                </h2>
                <p className="mt-4 text-[var(--text-secondary)]">You can safely close this website and return to SRM Academia. We won't need anything from you.</p>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-10">
                <h2 className="font-display font-black text-2xl md:text-3xl tracking-tight">
                  Your preferences
                </h2>
                {needsProf(status) && profCount > 0 && (
                  <PreferenceGroup
                    testId="prof"
                    title="Professional electives"
                    prefs={profPrefs} setPrefs={setProfPrefs}
                  />
                )}
                {needsOpen(status) && openCount > 0 && (
                  <PreferenceGroup
                    testId="open"
                    title="Open electives"
                    prefs={openPrefs} setPrefs={setOpenPrefs}
                  />
                )}
                <div>
                  <Label className="text-xs uppercase tracking-widest text-[var(--text-secondary)]">Additional notes (optional)</Label>
                  <Textarea
                    data-testid="prefs-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="rounded-none border-[var(--border-default)] mt-2 focus-visible:ring-0 focus-visible:border-black"
                    placeholder="Anything faculty should know?"
                  />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="p-6 border-t border-[var(--border-default)] flex items-center justify-between">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            data-testid="prefs-back-btn"
            className="text-sm text-[var(--text-secondary)] hover:text-black disabled:opacity-30 underline underline-offset-4"
          >
            ← Back
          </button>

          {status === "both" && step === 2 ? (
            <Button
              onClick={submit}
              disabled={busy}
              data-testid="prefs-mark-done-btn"
              className="rounded-none bg-black text-white hover:bg-black/85 h-11 px-6"
            >
              {busy ? "Saving…" : "Mark as complete"} <CheckCircle2 className="ml-2 h-4 w-4"/>
            </Button>
          ) : step < 3 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext}
              data-testid="prefs-next-btn"
              className="rounded-none bg-black text-white hover:bg-black/85 h-11 px-6"
            >
              Continue <ArrowRight className="ml-2 h-4 w-4"/>
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={busy}
              data-testid="prefs-submit-btn"
              className="rounded-none bg-black text-white hover:bg-black/85 h-11 px-6"
            >
              {busy ? "Submitting…" : "Submit to faculty"} <Send className="ml-2 h-4 w-4"/>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ step, total }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 w-8 ${i < step ? "bg-black" : "bg-[var(--border-default)]"}`}
        />
      ))}
    </div>
  );
}

function CountCard({ label, value, setValue, testId }) {
  return (
    <div className="border border-[var(--border-default)] p-6">
      <Label className="text-xs uppercase tracking-widest text-[var(--text-secondary)]">{label}</Label>
      <div className="flex items-center gap-4 mt-3">
        <button
          data-testid={`${testId}-dec`}
          onClick={() => setValue(Math.max(0, value - 1))}
          className="h-11 w-11 border border-[var(--border-default)] hover:bg-[var(--surface-hover)] font-mono text-lg"
        >−</button>
        <span data-testid={`${testId}-value`} className="font-mono font-light text-4xl w-12 text-center">{value}</span>
        <button
          data-testid={`${testId}-inc`}
          onClick={() => setValue(Math.min(10, value + 1))}
          className="h-11 w-11 border border-[var(--border-default)] hover:bg-[var(--surface-hover)] font-mono text-lg"
        >+</button>
      </div>
    </div>
  );
}

function PreferenceGroup({ title, prefs, setPrefs, testId }) {
  const update = (idx, cIdx, val) => {
    setPrefs((prev) => prev.map((row, i) => i === idx ? row.map((c, j) => j === cIdx ? val : c) : row));
  };
  return (
    <div>
      <h3 className="font-display font-bold text-lg mb-4">{title}</h3>
      <div className="space-y-6">
        {prefs.map((row, i) => (
          <div key={i} className="border border-[var(--border-default)] p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-3">Elective #{i + 1}</p>
            <div className="grid sm:grid-cols-3 gap-3">
              {row.map((val, j) => (
                <div key={j}>
                  <Label className="text-xs text-[var(--text-secondary)]">Choice {j + 1}</Label>
                  <Input
                    data-testid={`pref-${testId}-${i}-${j}`}
                    value={val}
                    onChange={(e) => update(i, j, e.target.value)}
                    className="rounded-none border-[var(--border-default)] mt-1 focus-visible:ring-0 focus-visible:border-black"
                    placeholder={`Course code / title`}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WaitingForAllocation({ sub }) {
  return (
    <div className="mt-10 border border-[var(--border-default)] bg-white p-8" data-testid="waiting-panel">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-secondary)]">Submitted</p>
      <h2 className="font-display font-black text-3xl mt-2">Faculty is reviewing your picks.</h2>
      <p className="mt-4 text-[var(--text-secondary)]">You'll get a mail once they're allocated. You can close this tab.</p>
      <ReadOnlySubmission sub={sub}/>
    </div>
  );
}

function AllDone() {
  return (
    <div className="mt-10 border border-[var(--border-default)] bg-white p-8" data-testid="alldone-panel">
      <div className="flex items-center gap-2 text-[var(--success)]">
        <CheckCircle2 className="h-5 w-5"/>
        <span className="font-mono text-xs uppercase tracking-widest">All set</span>
      </div>
      <h2 className="font-display font-black text-3xl mt-2">You can close this website and return to SRM Academia.</h2>
      <p className="mt-4 text-[var(--text-secondary)]">You told us both Professional & Open were already filled. Nothing more to do here.</p>
    </div>
  );
}

function AllocationDecision({ sub, onResponded }) {
  const [busy, setBusy] = useState(null);
  const respond = async (action) => {
    setBusy(action);
    try {
      await api.post(`/submissions/${sub.id}/allocation-response`, { action });
      toast.success(action === "accept" ? "Accepted." : "Sent back to faculty.");
      onResponded();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally { setBusy(null); }
  };
  const alloc = sub.allocations || {};
  return (
    <div className="mt-10 border border-[var(--border-default)] bg-white p-8" data-testid="allocation-panel">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--accent)]">Allocation ready</p>
      <h2 className="font-display font-black text-3xl mt-2">Faculty allocated your electives</h2>
      <div className="mt-6 grid md:grid-cols-2 gap-6">
        <AllocGroup title="Professional" items={alloc.professional}/>
        <AllocGroup title="Open" items={alloc.open}/>
      </div>
      {sub.faculty_note && (
        <div className="mt-6 border-l-2 border-black pl-4 text-[var(--text-secondary)] italic">
          "{sub.faculty_note}"
        </div>
      )}
      <div className="mt-8 flex gap-3">
        <Button data-testid="btn-accept-alloc" disabled={busy !== null} onClick={() => respond("accept")}
          className="rounded-none bg-black text-white hover:bg-black/85 h-11 px-6">
          <ThumbsUp className="mr-2 h-4 w-4"/>{busy === "accept" ? "Accepting…" : "Accept"}
        </Button>
        <Button data-testid="btn-reject-alloc" disabled={busy !== null} onClick={() => respond("reject")}
          variant="outline"
          className="rounded-none border-[var(--border-default)] h-11 px-6">
          <ThumbsDown className="mr-2 h-4 w-4"/>{busy === "reject" ? "Sending…" : "Reject & re-review"}
        </Button>
      </div>
    </div>
  );
}

function AllocGroup({ title, items }) {
  return (
    <div className="border border-[var(--border-default)] p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-3">{title}</p>
      {(!items || items.length === 0) ? (
        <p className="text-[var(--text-disabled)]">—</p>
      ) : (
        <ul className="space-y-1">
          {items.map((c, i) => <li key={i} className="font-medium">{c}</li>)}
        </ul>
      )}
    </div>
  );
}

function AllocationAccepted({ sub }) {
  return (
    <div className="mt-10 border border-[var(--border-default)] bg-white p-8" data-testid="accepted-panel">
      <div className="flex items-center gap-2 text-[var(--success)]">
        <CheckCircle2 className="h-5 w-5"/>
        <span className="font-mono text-xs uppercase tracking-widest">Accepted</span>
      </div>
      <h2 className="font-display font-black text-3xl mt-2">Job done.</h2>
      <p className="mt-4 text-[var(--text-secondary)]">Your electives are locked in. Faculty will complete the paperwork on their side.</p>
      <div className="mt-6 grid md:grid-cols-2 gap-6">
        <AllocGroup title="Professional" items={sub.allocations?.professional}/>
        <AllocGroup title="Open" items={sub.allocations?.open}/>
      </div>
    </div>
  );
}

function AllocationRejected({ sub }) {
  return (
    <div className="mt-10 border border-[var(--border-default)] bg-white p-8" data-testid="rejected-panel">
      <div className="flex items-center gap-2 text-[var(--alert)]">
        <XCircle className="h-5 w-5"/>
        <span className="font-mono text-xs uppercase tracking-widest">Sent back</span>
      </div>
      <h2 className="font-display font-black text-3xl mt-2">Faculty is re-reviewing.</h2>
      <p className="mt-4 text-[var(--text-secondary)]">You'll get another allocation soon.</p>
      <ReadOnlySubmission sub={sub}/>
    </div>
  );
}

function ReadOnlySubmission({ sub }) {
  return (
    <div className="mt-8 grid md:grid-cols-2 gap-6">
      {sub.professional && (
        <div className="border border-[var(--border-default)] p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-3">Professional ({sub.professional.count})</p>
          <PrefList prefs={sub.professional.preferences}/>
        </div>
      )}
      {sub.open && (
        <div className="border border-[var(--border-default)] p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-3">Open ({sub.open.count})</p>
          <PrefList prefs={sub.open.preferences}/>
        </div>
      )}
    </div>
  );
}

function PrefList({ prefs }) {
  if (!prefs || prefs.length === 0) return <p className="text-[var(--text-disabled)]">—</p>;
  return (
    <ol className="space-y-2">
      {prefs.map((row, i) => (
        <li key={i} className="text-sm">
          <span className="text-[var(--text-secondary)] font-mono mr-2">#{i + 1}</span>
          {(row || []).filter(Boolean).join(" › ") || <span className="text-[var(--text-disabled)]">empty</span>}
        </li>
      ))}
    </ol>
  );
}

/* ----- helpers ----- */
function needsProf(status) { return status === "prof_missing" || status === "neither"; }
function needsOpen(status) { return status === "open_missing" || status === "neither"; }
function resizePrefs(prev, count) {
  const out = prev.slice(0, count);
  while (out.length < count) out.push(["", "", ""]);
  return out;
}
