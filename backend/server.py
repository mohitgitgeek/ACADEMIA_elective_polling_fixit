"""SRM Elective Polling Backup — FastAPI backend.

Handles:
  - Magic-link (mocked) auth for students and faculty
  - Submission lifecycle: start (timer) -> preferences -> allocation -> accept/reject
  - Faculty review + CSV/XLSX export
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Query
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import uuid
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import Optional, List, Literal, Dict, Any
from datetime import datetime, timezone, timedelta
import pandas as pd

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

TIMER_MINUTES = int(os.environ.get("TIMER_MINUTES", "30"))
APP_BASE_URL = os.environ.get("APP_BASE_URL", "")  # optional, used for magic link display
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "onboarding@resend.dev")

app = FastAPI(title="SRM Elective Polling Backup API")
api = APIRouter(prefix="/api")

log = logging.getLogger("srm-backup")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_id() -> str:
    return str(uuid.uuid4())


async def send_email(to: str, subject: str, body: str) -> Dict[str, Any]:
    """Send email via Resend if configured; otherwise log (mocked)."""
    if not RESEND_API_KEY:
        log.info("[MOCK EMAIL] To: %s | %s\n%s", to, subject, body)
        return {"mocked": True}
    try:
        import requests
        r = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={"from": FROM_EMAIL, "to": [to], "subject": subject, "html": body},
            timeout=8,
        )
        return {"status": r.status_code, "body": r.text}
    except Exception as e:
        log.warning("Email send failed: %s", e)
        return {"error": str(e)}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RequestLinkBody(BaseModel):
    email: EmailStr
    role: Literal["student", "faculty"]
    name: Optional[str] = None
    reg_no: Optional[str] = None
    faculty_id: Optional[str] = None
    department: Optional[str] = None


class VerifyBody(BaseModel):
    token: str


class UserPublic(BaseModel):
    id: str
    email: str
    role: str
    name: Optional[str] = None
    reg_no: Optional[str] = None
    faculty_id: Optional[str] = None
    department: Optional[str] = None


class PreferenceCategory(BaseModel):
    count: int = Field(ge=0, le=10)
    # Each elective slot has 3 preferences (ranked)
    preferences: List[List[str]] = Field(default_factory=list)


class PreferencesBody(BaseModel):
    elective_status: Literal["both", "partial"]
    professional: Optional[PreferenceCategory] = None
    open: Optional[PreferenceCategory] = None
    notes: Optional[str] = None


class AllocationBody(BaseModel):
    professional: List[str] = Field(default_factory=list)
    open: List[str] = Field(default_factory=list)
    faculty_note: Optional[str] = None


class AllocationResponseBody(BaseModel):
    action: Literal["accept", "reject"]
    reason: Optional[str] = None


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
async def current_user(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.sessions.find_one({"token": token})
    if not session:
        raise HTTPException(401, "Invalid session")
    user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


def require_role(role: str):
    async def dep(user=Depends(current_user)):
        if user["role"] != role:
            raise HTTPException(403, f"Only {role} allowed")
        return user
    return dep


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"service": "srm-elective-backup", "timer_minutes": TIMER_MINUTES}


@api.post("/auth/request-link")
async def request_link(body: RequestLinkBody):
    email = body.email.lower()
    existing = await db.users.find_one({"email": email, "role": body.role})
    if existing:
        user_id = existing["id"]
        updates = {k: v for k, v in {
            "name": body.name, "reg_no": body.reg_no,
            "faculty_id": body.faculty_id, "department": body.department,
        }.items() if v}
        if updates:
            await db.users.update_one({"id": user_id}, {"$set": updates})
    else:
        user_id = make_id()
        await db.users.insert_one({
            "id": user_id, "email": email, "role": body.role,
            "name": body.name, "reg_no": body.reg_no,
            "faculty_id": body.faculty_id, "department": body.department,
            "created_at": now_iso(),
        })

    token = make_id()
    await db.magic_links.insert_one({
        "token": token, "user_id": user_id, "email": email,
        "role": body.role, "created_at": now_iso(), "used": False,
    })

    link = f"{APP_BASE_URL}/verify?token={token}" if APP_BASE_URL else f"/verify?token={token}"
    await send_email(
        to=email,
        subject="Your SRM Elective Backup sign-in link",
        body=f"<p>Click below to sign in to SRM Elective Backup:</p><p><a href='{link}'>{link}</a></p>",
    )
    # Return the token in dev mode too, so the frontend can auto-follow when email is mocked.
    return {"ok": True, "token": token, "email_sent": bool(RESEND_API_KEY)}


@api.post("/auth/verify")
async def verify(body: VerifyBody):
    link = await db.magic_links.find_one({"token": body.token})
    if not link or link.get("used"):
        raise HTTPException(400, "Invalid or expired token")
    await db.magic_links.update_one({"token": body.token}, {"$set": {"used": True}})
    session_token = make_id()
    await db.sessions.insert_one({
        "token": session_token, "user_id": link["user_id"],
        "created_at": now_iso(),
    })
    user = await db.users.find_one({"id": link["user_id"]}, {"_id": 0})
    return {"session": session_token, "user": user}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return {"user": user}


# ---------------------------------------------------------------------------
# Student — submissions
# ---------------------------------------------------------------------------
def submission_public(sub: Dict[str, Any]) -> Dict[str, Any]:
    sub = {k: v for k, v in sub.items() if k != "_id"}
    started_at = sub.get("started_at")
    if started_at:
        started = datetime.fromisoformat(started_at)
        unlock_at = started + timedelta(minutes=TIMER_MINUTES)
        sub["unlock_at"] = unlock_at.isoformat()
        sub["unlocked"] = datetime.now(timezone.utc) >= unlock_at
    return sub


@api.post("/submissions/start")
async def start_submission(user=Depends(require_role("student"))):
    # Only allow one active submission per student.
    existing = await db.submissions.find_one({
        "student_id": user["id"],
        "status": {"$in": ["timer", "awaiting_preferences", "submitted", "allocated"]},
    })
    if existing:
        return {"submission": submission_public(existing)}
    doc = {
        "id": make_id(),
        "student_id": user["id"],
        "name": user.get("name"),
        "email": user["email"],
        "reg_no": user.get("reg_no"),
        "department": user.get("department"),
        "started_at": now_iso(),
        "elective_status": None,
        "professional": None,
        "open": None,
        "notes": None,
        "allocations": None,
        "faculty_note": None,
        "student_response": None,
        "status": "timer",
        "created_at": now_iso(),
    }
    await db.submissions.insert_one(doc)
    return {"submission": submission_public(doc)}


@api.get("/submissions/mine")
async def my_submissions(user=Depends(require_role("student"))):
    subs = await db.submissions.find({"student_id": user["id"]}).sort("created_at", -1).to_list(50)
    return {"submissions": [submission_public(s) for s in subs]}


@api.post("/submissions/{sub_id}/preferences")
async def submit_preferences(sub_id: str, body: PreferencesBody, user=Depends(require_role("student"))):
    sub = await db.submissions.find_one({"id": sub_id, "student_id": user["id"]})
    if not sub:
        raise HTTPException(404, "Submission not found")
    started = datetime.fromisoformat(sub["started_at"])
    if datetime.now(timezone.utc) < started + timedelta(minutes=TIMER_MINUTES):
        raise HTTPException(400, "Timer has not elapsed yet")
    if sub["status"] not in ("timer", "awaiting_preferences"):
        raise HTTPException(400, "Submission already submitted")

    update: Dict[str, Any] = {
        "elective_status": body.elective_status,
        "notes": body.notes,
        "submitted_at": now_iso(),
    }
    if body.elective_status == "both":
        update["status"] = "completed_no_action"
        update["professional"] = None
        update["open"] = None
    else:
        update["status"] = "submitted"
        update["professional"] = body.professional.model_dump() if body.professional else None
        update["open"] = body.open.model_dump() if body.open else None

    await db.submissions.update_one({"id": sub_id}, {"$set": update})
    fresh = await db.submissions.find_one({"id": sub_id})
    return {"submission": submission_public(fresh)}


@api.post("/submissions/{sub_id}/allocation-response")
async def allocation_response(sub_id: str, body: AllocationResponseBody, user=Depends(require_role("student"))):
    sub = await db.submissions.find_one({"id": sub_id, "student_id": user["id"]})
    if not sub:
        raise HTTPException(404, "Submission not found")
    if sub["status"] != "allocated":
        raise HTTPException(400, "No allocation to respond to")
    new_status = "accepted" if body.action == "accept" else "rejected"
    await db.submissions.update_one({"id": sub_id}, {"$set": {
        "status": new_status,
        "student_response": {"action": body.action, "reason": body.reason, "at": now_iso()},
    }})
    # If rejected, mark it available for re-allocation (faculty will see status=rejected).
    fresh = await db.submissions.find_one({"id": sub_id})
    return {"submission": submission_public(fresh)}


# ---------------------------------------------------------------------------
# Faculty
# ---------------------------------------------------------------------------
@api.get("/faculty/submissions")
async def faculty_submissions(
    status: Optional[str] = Query(default=None),
    _=Depends(require_role("faculty")),
):
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    subs = await db.submissions.find(q).sort("created_at", -1).to_list(500)
    return {"submissions": [submission_public(s) for s in subs]}


@api.get("/faculty/submissions/export")
async def faculty_export(
    format: Literal["csv", "xlsx"] = "csv",
    _=Depends(require_role("faculty")),
):
    subs = await db.submissions.find({}).sort("created_at", -1).to_list(1000)
    rows = []
    for s in subs:
        prof = s.get("professional") or {}
        opn = s.get("open") or {}
        alloc = s.get("allocations") or {}

        def flatten_prefs(prefs):
            out = []
            for i, choices in enumerate(prefs or [], start=1):
                out.append(f"Elective {i}: " + " > ".join(choices))
            return "; ".join(out)

        rows.append({
            "submission_id": s["id"],
            "name": s.get("name"),
            "reg_no": s.get("reg_no"),
            "email": s.get("email"),
            "department": s.get("department"),
            "status": s.get("status"),
            "elective_status": s.get("elective_status"),
            "professional_count": prof.get("count"),
            "professional_choices": flatten_prefs(prof.get("preferences")),
            "open_count": opn.get("count"),
            "open_choices": flatten_prefs(opn.get("preferences")),
            "allocated_professional": ", ".join(alloc.get("professional", []) or []),
            "allocated_open": ", ".join(alloc.get("open", []) or []),
            "started_at": s.get("started_at"),
            "submitted_at": s.get("submitted_at"),
            "allocated_at": s.get("allocated_at"),
            "student_response": (s.get("student_response") or {}).get("action"),
            "notes": s.get("notes"),
            "faculty_note": s.get("faculty_note"),
        })

    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    if format == "csv":
        text = df.to_csv(index=False)
        return StreamingResponse(
            iter([text.encode("utf-8")]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=submissions.csv"},
        )
    df.to_excel(buf, index=False, engine="openpyxl")
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=submissions.xlsx"},
    )


@api.get("/faculty/submissions/{sub_id}")
async def faculty_submission_detail(sub_id: str, _=Depends(require_role("faculty"))):
    sub = await db.submissions.find_one({"id": sub_id})
    if not sub:
        raise HTTPException(404, "Not found")
    return {"submission": submission_public(sub)}


@api.post("/faculty/submissions/{sub_id}/allocate")
async def faculty_allocate(sub_id: str, body: AllocationBody, faculty=Depends(require_role("faculty"))):
    sub = await db.submissions.find_one({"id": sub_id})
    if not sub:
        raise HTTPException(404, "Not found")
    if sub["status"] not in ("submitted", "rejected"):
        raise HTTPException(400, "Cannot allocate for this status")
    await db.submissions.update_one({"id": sub_id}, {"$set": {
        "allocations": {"professional": body.professional, "open": body.open},
        "faculty_note": body.faculty_note,
        "allocated_by": faculty["email"],
        "allocated_at": now_iso(),
        "status": "allocated",
        "student_response": None,
    }})

    # Notify student
    prof = ", ".join(body.professional) or "—"
    opn = ", ".join(body.open) or "—"
    await send_email(
        to=sub["email"],
        subject="Your elective allocation is ready",
        body=(
            f"<p>Hi {sub.get('name') or 'Student'},</p>"
            f"<p>Your electives have been allocated.</p>"
            f"<p><b>Professional:</b> {prof}<br/><b>Open:</b> {opn}</p>"
            f"<p>Log in to accept or reject.</p>"
        ),
    )
    fresh = await db.submissions.find_one({"id": sub_id})
    return {"submission": submission_public(fresh)}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
