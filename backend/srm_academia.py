"""SRM Academia (Zoho) unofficial scraper.

Ported from https://github.com/iamyogik/SRM-Academia-API-Python
- Fixed Python 3 base64 API
- Updated to current SRM domain (academia.srmist.edu.in)
- Added timeouts + explicit error mapping
- Trimmed to only what we need: sign in + personal details (name, reg_no, department)

This is best-effort. Zoho's Academia login flow changes frequently and none of the
public wrappers have been maintained since ~2019. Callers MUST handle failures
gracefully and fall back to manual entry.
"""
from __future__ import annotations

import base64
import json
import os
import re
from typing import Dict, Optional, Tuple
from urllib.parse import parse_qs

import requests
from pyquery import PyQuery as pq

ACADEMIA_BASE = os.environ.get("ACADEMIA_BASE", "https://academia.srmist.edu.in").rstrip("/")
DEFAULT_HEADERS = {
    "Origin": ACADEMIA_BASE,
    "Referer": f"{ACADEMIA_BASE}/",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36"
    ),
}
TIMEOUT = 12  # seconds


class AcademiaError(Exception):
    """Raised when the Academia flow fails in a way callers should surface."""


# ---------------------------------------------------------------------------
# Sign in
# ---------------------------------------------------------------------------
def sign_in(username: str, password: str) -> str:
    """Return an opaque token (base64-encoded JSON of session cookies)."""
    url = f"{ACADEMIA_BASE}/accounts/signin.ac"
    payload = {
        "username": username,
        "password": password,
        "client_portal": "true",
        "portal": "10002227248",
        "servicename": "ZohoCreator",
        "serviceurl": f"{ACADEMIA_BASE}/",
        "is_ajax": "true",
        "grant_type": "password",
        "service_language": "en",
    }
    try:
        r = requests.post(url, data=payload, headers=DEFAULT_HEADERS, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise AcademiaError(f"Could not reach Academia: {e}") from e

    try:
        data = r.json()
    except ValueError:
        raise AcademiaError("Academia returned a non-JSON response (login flow likely changed).")

    if "error" in data:
        msg = (data.get("error") or {}).get("msg") or "Login rejected"
        raise AcademiaError(msg)

    inner = data.get("data") or {}
    token_params_raw = inner.get("token_params")
    oauthorize_uri = inner.get("oauthorize_uri")
    if not token_params_raw or not oauthorize_uri:
        raise AcademiaError("Login flow changed — missing oauthorize_uri / token_params.")

    params = {k: v[0] for k, v in parse_qs(token_params_raw).items()}
    params["state"] = f"{ACADEMIA_BASE}/"
    try:
        r2 = requests.get(oauthorize_uri, params=params, headers=DEFAULT_HEADERS, timeout=TIMEOUT, allow_redirects=True)
    except requests.RequestException as e:
        raise AcademiaError(f"OAuth exchange failed: {e}") from e

    # Collect cookies from every hop
    cookies: Dict[str, str] = {}
    for hop in r2.history:
        cookies.update(hop.cookies.get_dict())
    cookies.update(r2.cookies.get_dict())
    if not cookies:
        raise AcademiaError("No session cookies were issued.")

    return base64.b64encode(json.dumps(cookies).encode("utf-8")).decode("utf-8")


def _decode_token(token: str) -> Dict[str, str]:
    try:
        return json.loads(base64.b64decode(token).decode("utf-8"))
    except Exception as e:
        raise AcademiaError("Invalid Academia token") from e


# ---------------------------------------------------------------------------
# Personal details
# ---------------------------------------------------------------------------
_LIVE_VIEW = f"{ACADEMIA_BASE}/liveViewHeader.do"

# Try a few known view link names — SRM has changed these each academic year.
CANDIDATE_VIEWS = [
    "My_Time_Table_2023_24_ODD",
    "My_Time_Table_2023_24_EVEN",
    "My_Time_Table_2022_23_ODD",
    "My_Time_Table_2022_23_EVEN",
    "My_Time_Table_2024_25_ODD",
    "My_Time_Table_2024_25_EVEN",
    "My_Time_Table_2025_26_ODD",
    "My_Time_Table_2025_26_EVEN",
]


def _fetch_view_dom(cookies: Dict[str, str], view_link: str) -> Optional[str]:
    data = {
        "sharedBy": "srm_university",
        "appLinkName": "academia-academic-services",
        "viewLinkName": view_link,
        "urlParams": {},
        "isPageLoad": "true",
    }
    try:
        r = requests.post(_LIVE_VIEW, data=data, headers=DEFAULT_HEADERS, cookies=cookies, timeout=TIMEOUT)
    except requests.RequestException:
        return None
    if r.status_code != 200 or not r.text:
        return None

    marker = f'$("#zc-viewcontainer_{view_link}").prepend(pageSanitizer.sanitize('
    a = r.text.find(marker)
    if a < 0:
        return None
    # Locate the closing paren of the sanitize() call heuristically
    start = a + len(marker)
    # Grab everything up to the next `});` which typically closes the block
    end = r.text.find("});", start)
    if end < 0:
        return None
    return r.text[start:end]


def _extract_personal_from_dom(html_snippet: str) -> Dict[str, Optional[str]]:
    dom = pq(html_snippet)
    # The classic Academia layout embeds a `<table cellspacing="1">` where the
    # personal details are in alternating <td>: label, value.
    labels_to_values: Dict[str, str] = {}
    for tbl in dom('table[cellspacing="1"]').items():
        tds = list(tbl.find("td").items())
        for i in range(0, len(tds) - 1, 2):
            key = (tds[i].text() or "").strip().rstrip(":").lower()
            val = (tds[i + 1].text() or "").strip()
            if key:
                labels_to_values[key] = val

    def pick(*keys: str) -> Optional[str]:
        for k in keys:
            for label, val in labels_to_values.items():
                if k in label and val:
                    return val
        return None

    reg = pick("registration number", "registration no", "regn no", "reg number")
    name = pick("name")
    dept = pick("department", "dept")
    program = pick("program", "programme")
    semester = pick("semester")
    batch = pick("batch")
    mobile = pick("mobile")

    return {
        "reg_no": reg,
        "name": name,
        "department": dept,
        "program": program,
        "semester": semester,
        "batch": batch,
        "mobile": mobile,
    }


def fetch_personal_details(token: str) -> Dict[str, Optional[str]]:
    """Return whatever personal details we can scrape. Never returns None keys;
    values may be None if a field could not be located."""
    cookies = _decode_token(token)
    last_err: Optional[str] = None
    for view in CANDIDATE_VIEWS:
        snippet = _fetch_view_dom(cookies, view)
        if not snippet:
            last_err = f"view {view} not accessible"
            continue
        details = _extract_personal_from_dom(snippet)
        if details.get("reg_no") or details.get("name"):
            return details
    raise AcademiaError(
        "Could not scrape personal details — Academia view names may have changed. "
        f"Last state: {last_err or 'no data returned'}."
    )


# ---------------------------------------------------------------------------
# Convenience combined call
# ---------------------------------------------------------------------------
def import_student(username: str, password: str) -> Dict[str, Optional[str]]:
    token = sign_in(username, password)
    return fetch_personal_details(token)
