import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, API_BASE } from "@/lib/api";
import { getSession, clearSession } from "@/lib/auth";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableHead, TableHeader, TableRow, TableCell, TableBody,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, RefreshCw, Send, X, Loader2 } from "lucide-react";

const STATUS_LABELS = {
  timer: "Waiting timer",
  awaiting_preferences: "Awaiting prefs",
  submitted: "Submitted",
  completed_no_action: "No action",
  allocated: "Allocated",
  accepted: "Accepted",
  rejected: "Rejected",
};

export default function FacultyDashboard() {
  const nav = useNavigate();
  const [session] = useState(() => getSession());
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter && filter !== "all" ? `?status=${filter}` : "";
      const r = await api.get(`/faculty/submissions${q}`);
      setSubs(r.data.submissions);
    } catch (e) {
      if (e?.response?.status === 401) { clearSession(); nav("/faculty/login"); }
    } finally { setLoading(false); }
  }, [filter, nav]);

  useEffect(() => {
    if (!session || session.user?.role !== "faculty") { nav("/faculty/login"); return; }
    refresh();
  }, [refresh, session, nav]);

  const download = async (format) => {
    const token = getSession()?.token;
    try {
      const res = await fetch(`${API_BASE}/api/faculty/submissions/export?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `submissions.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${format.toUpperCase()}`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="min-h-screen">
      <Header/>
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-secondary)]" data-testid="faculty-eyebrow">
              Faculty · {session?.user?.department || ""}
            </p>
            <h1 className="font-display font-black tracking-tight text-4xl md:text-5xl mt-2" data-testid="faculty-heading">
              Student submissions
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger data-testid="filter-select" className="w-52 rounded-none border-[var(--border-default)] h-10">
                <SelectValue/>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="allocated">Allocated</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="completed_no_action">No action</SelectItem>
                <SelectItem value="timer">Waiting timer</SelectItem>
              </SelectContent>
            </Select>
            <Button data-testid="refresh-btn" variant="outline" onClick={refresh} className="rounded-none border-[var(--border-default)] h-10">
              <RefreshCw className="h-4 w-4"/>
            </Button>
            <Button data-testid="download-csv-btn" variant="outline" onClick={() => download("csv")} className="rounded-none border-[var(--border-default)] h-10">
              <Download className="h-4 w-4 mr-2"/>CSV
            </Button>
            <Button data-testid="download-xlsx-btn" onClick={() => download("xlsx")} className="rounded-none bg-black text-white hover:bg-black/85 h-10">
              <Download className="h-4 w-4 mr-2"/>Excel
            </Button>
          </div>
        </div>

        <div className="mt-8 border border-[var(--border-default)] bg-white">
          {loading ? (
            <div className="p-12 text-center text-[var(--text-secondary)]">
              <Loader2 className="animate-spin h-4 w-4 inline mr-2"/>Loading…
            </div>
          ) : subs.length === 0 ? (
            <div className="p-12 text-center text-[var(--text-secondary)]" data-testid="empty-state">No submissions yet.</div>
          ) : (
            <Table data-testid="submissions-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono text-xs uppercase tracking-widest">Reg. No.</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-widest">Name</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-widest">Dept.</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-widest">Prof</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-widest">Open</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-widest">Status</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-widest text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subs.map((s) => (
                  <TableRow key={s.id} data-testid={`row-${s.id}`} className="hover:bg-[var(--surface-hover)]">
                    <TableCell className="font-mono">{s.reg_no || "—"}</TableCell>
                    <TableCell>{s.name || "—"}</TableCell>
                    <TableCell>{s.department || "—"}</TableCell>
                    <TableCell>{s.professional?.count ?? "—"}</TableCell>
                    <TableCell>{s.open?.count ?? "—"}</TableCell>
                    <TableCell><StatusPill status={s.status}/></TableCell>
                    <TableCell className="text-right">
                      <button
                        data-testid={`row-open-${s.id}`}
                        onClick={() => setSelected(s)}
                        className="text-sm underline underline-offset-4 hover:text-[var(--accent)]"
                      >
                        Open
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {selected && (
        <SubmissionDialog
          submission={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => { setSelected(null); refresh(); }}
        />
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    timer: "bg-yellow-100 text-yellow-900 border-yellow-300",
    awaiting_preferences: "bg-yellow-100 text-yellow-900 border-yellow-300",
    submitted: "bg-blue-100 text-blue-900 border-blue-300",
    completed_no_action: "bg-neutral-100 text-neutral-700 border-neutral-300",
    allocated: "bg-black text-white border-black",
    accepted: "bg-green-100 text-green-900 border-green-300",
    rejected: "bg-red-100 text-red-900 border-red-300",
  };
  return (
    <span className={`inline-block text-xs uppercase tracking-widest border px-2 py-1 font-mono ${map[status] || ""}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function SubmissionDialog({ submission, onClose, onUpdated }) {
  const s = submission;
  const [prof, setProf] = useState((s.allocations?.professional || []).join(", "));
  const [open, setOpen] = useState((s.allocations?.open || []).join(", "));
  const [note, setNote] = useState(s.faculty_note || "");
  const [busy, setBusy] = useState(false);

  const canAllocate = s.status === "submitted" || s.status === "rejected";

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/faculty/submissions/${s.id}/allocate`, {
        professional: prof.split(",").map((x) => x.trim()).filter(Boolean),
        open: open.split(",").map((x) => x.trim()).filter(Boolean),
        faculty_note: note,
      });
      toast.success("Allocation sent");
      onUpdated();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl rounded-none border-[var(--border-default)]" data-testid="submission-dialog">
        <DialogHeader>
          <DialogTitle className="font-display font-black text-2xl tracking-tight">
            {s.name} <span className="text-[var(--text-secondary)] font-mono text-base ml-2">{s.reg_no}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Email" value={s.email}/>
            <Field label="Department" value={s.department}/>
            <Field label="Status" value={STATUS_LABELS[s.status] || s.status}/>
            <Field label="Elective status" value={s.elective_status || "—"}/>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <PrefBox title="Professional preferences" cat={s.professional}/>
            <PrefBox title="Open preferences" cat={s.open}/>
          </div>

          {s.notes && (
            <div className="border-l-2 border-black pl-4 text-[var(--text-secondary)] italic">
              Student note: "{s.notes}"
            </div>
          )}

          {s.student_response && (
            <div className="border border-[var(--border-default)] p-4">
              <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-1">Student response</p>
              <p><b>{s.student_response.action}</b> · {s.student_response.reason || "no reason"}</p>
            </div>
          )}

          <div className="border-t border-[var(--border-default)] pt-6">
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-4">Allocate courses</p>
            {!canAllocate && (
              <p className="text-sm text-[var(--text-secondary)] mb-3">This submission is not in an allocatable state.</p>
            )}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-widest text-[var(--text-secondary)]">Professional (comma-separated)</Label>
                <Input data-testid="alloc-prof" value={prof} onChange={(e) => setProf(e.target.value)}
                  className="rounded-none border-[var(--border-default)] mt-2 h-11 font-mono focus-visible:ring-0 focus-visible:border-black"/>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-widest text-[var(--text-secondary)]">Open (comma-separated)</Label>
                <Input data-testid="alloc-open" value={open} onChange={(e) => setOpen(e.target.value)}
                  className="rounded-none border-[var(--border-default)] mt-2 h-11 font-mono focus-visible:ring-0 focus-visible:border-black"/>
              </div>
            </div>
            <div className="mt-4">
              <Label className="text-xs uppercase tracking-widest text-[var(--text-secondary)]">Note to student</Label>
              <Textarea data-testid="alloc-note" value={note} onChange={(e) => setNote(e.target.value)}
                className="rounded-none border-[var(--border-default)] mt-2 focus-visible:ring-0 focus-visible:border-black"/>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between pt-4 border-t border-[var(--border-default)]">
          <button onClick={onClose} className="text-sm text-[var(--text-secondary)] hover:text-black underline underline-offset-4" data-testid="dialog-close">
            Close
          </button>
          <Button data-testid="alloc-submit-btn" onClick={submit} disabled={busy || !canAllocate}
            className="rounded-none bg-black text-white hover:bg-black/85 h-11 px-6">
            {busy ? "Sending…" : "Send allocation"} <Send className="ml-2 h-4 w-4"/>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-[var(--text-secondary)] font-mono">{label}</p>
      <p className="mt-1">{value || "—"}</p>
    </div>
  );
}

function PrefBox({ title, cat }) {
  return (
    <div className="border border-[var(--border-default)] p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-3">{title}{cat?.count ? ` (${cat.count})` : ""}</p>
      {!cat || !cat.preferences || cat.preferences.length === 0 ? (
        <p className="text-[var(--text-disabled)]">—</p>
      ) : (
        <ol className="space-y-2">
          {cat.preferences.map((row, i) => (
            <li key={i} className="text-sm">
              <span className="text-[var(--text-secondary)] font-mono mr-2">#{i + 1}</span>
              {(row || []).filter(Boolean).join(" › ") || <span className="text-[var(--text-disabled)]">empty</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
