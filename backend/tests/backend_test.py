"""Backend API tests for SRM Elective Polling Backup."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://polling-recovery.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _rand(p="t"):
    return f"{p}_{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="module")
def student_session():
    email = f"TEST_stu_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{API}/auth/request-link", json={
        "email": email, "role": "student",
        "name": "Test Student", "reg_no": "RA2111000001", "department": "CSE",
    })
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    v = requests.post(f"{API}/auth/verify", json={"token": token})
    assert v.status_code == 200
    return {"session": v.json()["session"], "email": email, "user": v.json()["user"]}


@pytest.fixture(scope="module")
def faculty_session():
    email = f"TEST_fac_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{API}/auth/request-link", json={
        "email": email, "role": "faculty",
        "name": "Test Faculty", "faculty_id": "F001", "department": "CSE",
    })
    assert r.status_code == 200
    token = r.json()["token"]
    v = requests.post(f"{API}/auth/verify", json={"token": token})
    assert v.status_code == 200
    return {"session": v.json()["session"], "email": email}


# ----- Health -----
class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        data = r.json()
        assert data["service"] == "srm-elective-backup"
        assert isinstance(data["timer_minutes"], int)


# ----- Auth -----
class TestAuth:
    def test_request_and_verify(self):
        email = f"TEST_auth_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{API}/auth/request-link", json={"email": email, "role": "student", "name": "A"})
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert "token" in body
        v = requests.post(f"{API}/auth/verify", json={"token": body["token"]})
        assert v.status_code == 200
        assert "session" in v.json()
        assert v.json()["user"]["email"] == email.lower()

    def test_verify_invalid_token(self):
        r = requests.post(f"{API}/auth/verify", json={"token": "bogus"})
        assert r.status_code == 400

    def test_me_without_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_with_auth(self, student_session):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {student_session['session']}"})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "student"


# ----- Student submission lifecycle -----
class TestSubmissionFlow:
    def test_full_flow(self, student_session, faculty_session):
        h = {"Authorization": f"Bearer {student_session['session']}"}
        # Start submission
        r = requests.post(f"{API}/submissions/start", headers=h)
        assert r.status_code == 200, r.text
        sub = r.json()["submission"]
        sub_id = sub["id"]
        assert sub["status"] == "timer"
        assert "unlock_at" in sub

        # Starting again returns same
        r2 = requests.post(f"{API}/submissions/start", headers=h)
        assert r2.json()["submission"]["id"] == sub_id

        # Get mine
        m = requests.get(f"{API}/submissions/mine", headers=h)
        assert m.status_code == 200
        assert any(s["id"] == sub_id for s in m.json()["submissions"])

        # Submit prefs (partial) - TIMER_MINUTES=0 so allowed
        payload = {
            "elective_status": "partial",
            "professional": {"count": 2, "preferences": [["ML", "DL", "AI"], ["OS", "CN", "DB"]]},
            "open": {"count": 1, "preferences": [["Music", "Art", "Photo"]]},
            "notes": "test",
        }
        p = requests.post(f"{API}/submissions/{sub_id}/preferences", headers=h, json=payload)
        assert p.status_code == 200, p.text
        assert p.json()["submission"]["status"] == "submitted"

        # Faculty sees it
        fh = {"Authorization": f"Bearer {faculty_session['session']}"}
        fl = requests.get(f"{API}/faculty/submissions", headers=fh)
        assert fl.status_code == 200
        assert any(s["id"] == sub_id for s in fl.json()["submissions"])

        # Detail
        d = requests.get(f"{API}/faculty/submissions/{sub_id}", headers=fh)
        assert d.status_code == 200

        # Allocate
        a = requests.post(f"{API}/faculty/submissions/{sub_id}/allocate", headers=fh, json={
            "professional": ["ML"], "open": ["Music"], "faculty_note": "OK"
        })
        assert a.status_code == 200, a.text
        assert a.json()["submission"]["status"] == "allocated"

        # Student accepts
        ar = requests.post(f"{API}/submissions/{sub_id}/allocation-response", headers=h,
                           json={"action": "accept"})
        assert ar.status_code == 200
        assert ar.json()["submission"]["status"] == "accepted"

    def test_both_flow_completes(self, faculty_session):
        # Fresh student
        email = f"TEST_stu2_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{API}/auth/request-link", json={
            "email": email, "role": "student", "name": "S2", "reg_no": "RA2", "department": "ECE",
        })
        v = requests.post(f"{API}/auth/verify", json={"token": r.json()["token"]})
        h = {"Authorization": f"Bearer {v.json()['session']}"}
        s = requests.post(f"{API}/submissions/start", headers=h)
        sub_id = s.json()["submission"]["id"]
        p = requests.post(f"{API}/submissions/{sub_id}/preferences", headers=h,
                         json={"elective_status": "both"})
        assert p.status_code == 200
        assert p.json()["submission"]["status"] == "completed_no_action"


# ----- Faculty export -----
class TestExport:
    def test_csv(self, faculty_session):
        fh = {"Authorization": f"Bearer {faculty_session['session']}"}
        r = requests.get(f"{API}/faculty/submissions/export?format=csv", headers=fh)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        text = r.text
        assert "submission_id" in text
        assert len(text) > 20

    def test_xlsx(self, faculty_session):
        fh = {"Authorization": f"Bearer {faculty_session['session']}"}
        r = requests.get(f"{API}/faculty/submissions/export?format=xlsx", headers=fh)
        assert r.status_code == 200
        # openpyxl xlsx starts with PK
        assert r.content[:2] == b"PK"
        assert len(r.content) > 100


# ----- Role guards -----
class TestRoleGuards:
    def test_student_cannot_access_faculty(self, student_session):
        h = {"Authorization": f"Bearer {student_session['session']}"}
        r = requests.get(f"{API}/faculty/submissions", headers=h)
        assert r.status_code == 403

    def test_faculty_cannot_start_submission(self, faculty_session):
        fh = {"Authorization": f"Bearer {faculty_session['session']}"}
        r = requests.post(f"{API}/submissions/start", headers=fh)
        assert r.status_code == 403
