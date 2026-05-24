"""
RadPi — Local clinical database

Fully offline, durable on a Raspberry Pi 5 SD card. Designed to look and behave
like a real medical record system, not a toy:

- Proper relational schema with foreign keys, indexes, transactions
- Versioned migrations so we can evolve the schema without losing data
- Real clinical concepts: encounters (visits), vitals, triage, clinician review
- Full audit trail of every write
- Model traceability per scan (which model version produced which result)
- Fast keyword search, CSV export, and aggregate stats endpoints

Encryption at rest is intentionally out of scope for this v1: SQLCipher would
require a custom pysqlite build that conflicts with the Pi 5 wheel pinning
strategy. Tracked as future work — the audit_log gives us a useful tamper
trail in the meantime.
"""

from __future__ import annotations

import csv
import datetime
import hashlib
import io
import json
import logging
import os
import sqlite3
from contextlib import contextmanager
from typing import Any, Iterator, Optional

logger = logging.getLogger(__name__)

DB_PATH = os.environ.get(
    "RADPI_DB_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "patients.db"),
)

UTC = datetime.timezone.utc


def _utcnow_iso() -> str:
    """ISO-8601 UTC timestamp. Always timezone-aware (Python 3.12 safe)."""
    return datetime.datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Schema migrations
# ---------------------------------------------------------------------------
# Each entry is the SQL needed to move FROM version idx TO version idx+1.
# Migrations are applied in order, exactly once, and recorded in
# `schema_version`. Existing databases from earlier RadPi builds (which had
# no schema_version table) start at version 0 and get migrated forward
# without data loss.
MIGRATIONS: list[str] = [
    # v0 -> v1: base schema. Matches the original RadPi tables so existing
    # patients.db files are adopted cleanly. IF NOT EXISTS is critical here.
    """
    CREATE TABLE IF NOT EXISTS patients (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id      TEXT UNIQUE NOT NULL,
        name            TEXT NOT NULL,
        age             INTEGER NOT NULL,
        sex             TEXT NOT NULL,
        notes           TEXT,
        created_at      TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scans (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id      TEXT NOT NULL,
        modality        TEXT NOT NULL,
        prediction      TEXT NOT NULL,
        confidence      REAL NOT NULL,
        mask_url        TEXT,
        heatmap_url     TEXT,
        llm_report      TEXT,
        created_at      TEXT NOT NULL,
        FOREIGN KEY (patient_id) REFERENCES patients (patient_id)
    );
    """,
    # v1 -> v2: enrich patient demographics for the rural-health use case.
    """
    ALTER TABLE patients ADD COLUMN phone               TEXT;
    ALTER TABLE patients ADD COLUMN village             TEXT;
    ALTER TABLE patients ADD COLUMN blood_group         TEXT;
    ALTER TABLE patients ADD COLUMN allergies           TEXT;
    ALTER TABLE patients ADD COLUMN chronic_conditions  TEXT;
    ALTER TABLE patients ADD COLUMN emergency_contact   TEXT;
    ALTER TABLE patients ADD COLUMN updated_at          TEXT;
    """,
    # v2 -> v3: encounters. One visit can bundle multiple scans + vitals +
    # a triage level. This is the bridge between "AI tool" and "EHR".
    """
    CREATE TABLE IF NOT EXISTS examinations (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id          TEXT NOT NULL,
        chief_complaint     TEXT,
        bp_systolic         INTEGER,
        bp_diastolic        INTEGER,
        heart_rate          INTEGER,
        spo2                INTEGER,
        temperature_c       REAL,
        weight_kg           REAL,
        height_cm           REAL,
        triage_level        TEXT DEFAULT 'NORMAL',
        clinician_name      TEXT,
        outcome             TEXT DEFAULT 'PENDING',
        outcome_notes       TEXT,
        created_at          TEXT NOT NULL,
        updated_at          TEXT,
        FOREIGN KEY (patient_id) REFERENCES patients (patient_id)
    );
    ALTER TABLE scans ADD COLUMN examination_id INTEGER REFERENCES examinations(id);
    """,
    # v3 -> v4: scan-level traceability + clinician review.
    # Without these columns we can't answer "which model produced this
    # finding, on what date, and did a human ever look at it?".
    """
    ALTER TABLE scans ADD COLUMN original_image_path TEXT;
    ALTER TABLE scans ADD COLUMN image_sha256        TEXT;
    ALTER TABLE scans ADD COLUMN model_version       TEXT;
    ALTER TABLE scans ADD COLUMN weights_sha         TEXT;
    ALTER TABLE scans ADD COLUMN inference_ms        INTEGER;
    ALTER TABLE scans ADD COLUMN reviewed_by         TEXT;
    ALTER TABLE scans ADD COLUMN reviewed_at         TEXT;
    ALTER TABLE scans ADD COLUMN clinician_override  TEXT;
    """,
    # v4 -> v5: append-only audit log. Every write goes through here so we
    # have a defensible trail of who-did-what-when. Required for any future
    # claim of clinical responsibility / data governance.
    """
    CREATE TABLE IF NOT EXISTS audit_log (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        ts              TEXT NOT NULL,
        actor           TEXT,
        action          TEXT NOT NULL,
        entity_type     TEXT NOT NULL,
        entity_id       TEXT,
        details         TEXT
    );
    """,
    # v5 -> v6: indexes. Massive speedup once a clinic has thousands of
    # scans. The patient_id index alone turns linear scans into O(log n).
    """
    CREATE INDEX IF NOT EXISTS idx_scans_patient_id      ON scans(patient_id);
    CREATE INDEX IF NOT EXISTS idx_scans_examination_id  ON scans(examination_id);
    CREATE INDEX IF NOT EXISTS idx_scans_created_at      ON scans(created_at);
    CREATE INDEX IF NOT EXISTS idx_scans_modality        ON scans(modality);
    CREATE INDEX IF NOT EXISTS idx_exam_patient_id       ON examinations(patient_id);
    CREATE INDEX IF NOT EXISTS idx_exam_created_at       ON examinations(created_at);
    CREATE INDEX IF NOT EXISTS idx_patients_name         ON patients(name);
    CREATE INDEX IF NOT EXISTS idx_patients_village      ON patients(village);
    CREATE INDEX IF NOT EXISTS idx_patients_phone        ON patients(phone);
    CREATE INDEX IF NOT EXISTS idx_audit_entity          ON audit_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_ts              ON audit_log(ts);
    """,
]


# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------
def _apply_pragmas(conn: sqlite3.Connection) -> None:
    # WAL = much better read concurrency and crash safety on SD cards.
    # foreign_keys MUST be set per-connection (SQLite default is off).
    # synchronous=NORMAL is the standard durability/perf tradeoff for WAL.
    # busy_timeout lets concurrent writers retry instead of failing.
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA busy_timeout = 5000")


def get_db_connection() -> sqlite3.Connection:
    """Legacy-compat raw connection. Prefer `get_db()` / `transaction()`."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    _apply_pragmas(conn)
    return conn


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    """Read-only or read-mostly access. Caller does not need to commit."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    _apply_pragmas(conn)
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    """Write transaction with automatic rollback on any exception."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    _apply_pragmas(conn)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Migration runner
# ---------------------------------------------------------------------------
def _get_current_version(conn: sqlite3.Connection) -> int:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_version (
            version     INTEGER PRIMARY KEY,
            applied_at  TEXT NOT NULL
        )
        """
    )
    row = conn.execute("SELECT MAX(version) FROM schema_version").fetchone()
    return int(row[0]) if row and row[0] is not None else 0


def _run_migrations(conn: sqlite3.Connection) -> None:
    current = _get_current_version(conn)
    target = len(MIGRATIONS)
    if current >= target:
        return
    for v in range(current, target):
        logger.info("DB migration %d -> %d", v, v + 1)
        try:
            conn.executescript(MIGRATIONS[v])
            conn.execute(
                "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)",
                (v + 1, _utcnow_iso()),
            )
            conn.commit()
        except sqlite3.Error as e:
            conn.rollback()
            logger.error("DB migration %d -> %d FAILED: %s", v, v + 1, e)
            raise
    logger.info("Database is at schema version %d (%s)", target, DB_PATH)


def init_db() -> None:
    """Idempotent. Safe to call on every backend start."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        _apply_pragmas(conn)
        _run_migrations(conn)
    logger.info("Patient database ready at %s", DB_PATH)


# ---------------------------------------------------------------------------
# Audit log helper
# ---------------------------------------------------------------------------
def _audit(
    conn: sqlite3.Connection,
    action: str,
    entity_type: str,
    entity_id: Optional[str],
    *,
    actor: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
) -> None:
    conn.execute(
        """
        INSERT INTO audit_log (ts, actor, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            _utcnow_iso(),
            actor,
            action,
            entity_type,
            str(entity_id) if entity_id is not None else None,
            json.dumps(details, default=str) if details else None,
        ),
    )


def list_audit_log(limit: int = 100, entity_type: Optional[str] = None) -> list[dict]:
    with get_db() as conn:
        if entity_type:
            rows = conn.execute(
                "SELECT * FROM audit_log WHERE entity_type = ? ORDER BY id DESC LIMIT ?",
                (entity_type, int(limit)),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?",
                (int(limit),),
            ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            if d.get("details"):
                try:
                    d["details"] = json.loads(d["details"])
                except (TypeError, ValueError):
                    pass
            out.append(d)
        return out


# ---------------------------------------------------------------------------
# Patient repository
# ---------------------------------------------------------------------------
_PATIENT_OPTIONAL_FIELDS = (
    "phone",
    "village",
    "blood_group",
    "allergies",
    "chronic_conditions",
    "emergency_contact",
)


def create_patient(
    patient_id: str,
    name: str,
    age: int,
    sex: str,
    notes: str = "",
    *,
    phone: Optional[str] = None,
    village: Optional[str] = None,
    blood_group: Optional[str] = None,
    allergies: Optional[str] = None,
    chronic_conditions: Optional[str] = None,
    emergency_contact: Optional[str] = None,
    actor: Optional[str] = None,
) -> dict:
    now = _utcnow_iso()
    try:
        with transaction() as conn:
            conn.execute(
                """
                INSERT INTO patients (
                    patient_id, name, age, sex, notes,
                    phone, village, blood_group, allergies, chronic_conditions,
                    emergency_contact, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    patient_id, name, int(age), sex, notes or "",
                    phone, village, blood_group, allergies, chronic_conditions,
                    emergency_contact, now, now,
                ),
            )
            _audit(
                conn, "create", "patient", patient_id,
                actor=actor, details={"name": name, "age": age, "sex": sex},
            )
    except sqlite3.IntegrityError as e:
        raise ValueError(f"Patient ID '{patient_id}' already exists.") from e
    return get_patient(patient_id, include_scans=False)


def update_patient(patient_id: str, *, actor: Optional[str] = None, **fields) -> dict:
    """Partial update. Only whitelisted fields are mutable."""
    allowed = {"name", "age", "sex", "notes", *_PATIENT_OPTIONAL_FIELDS}
    payload = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not payload:
        return get_patient(patient_id, include_scans=False)
    sets = ", ".join(f"{k} = ?" for k in payload)
    values = list(payload.values()) + [_utcnow_iso(), patient_id]
    with transaction() as conn:
        cur = conn.execute(
            f"UPDATE patients SET {sets}, updated_at = ? WHERE patient_id = ?",
            values,
        )
        if cur.rowcount == 0:
            raise ValueError(f"Patient ID '{patient_id}' not found.")
        _audit(conn, "update", "patient", patient_id, actor=actor, details=payload)
    return get_patient(patient_id, include_scans=False)


def delete_patient(patient_id: str, *, actor: Optional[str] = None) -> bool:
    """Cascading hard delete. Audit row is preserved (audit_log lives outside FK chain)."""
    with transaction() as conn:
        scan_count = conn.execute(
            "SELECT COUNT(*) FROM scans WHERE patient_id = ?", (patient_id,)
        ).fetchone()[0]
        exam_count = conn.execute(
            "SELECT COUNT(*) FROM examinations WHERE patient_id = ?", (patient_id,)
        ).fetchone()[0]
        conn.execute("DELETE FROM scans WHERE patient_id = ?", (patient_id,))
        conn.execute("DELETE FROM examinations WHERE patient_id = ?", (patient_id,))
        cur = conn.execute("DELETE FROM patients WHERE patient_id = ?", (patient_id,))
        if cur.rowcount == 0:
            return False
        _audit(
            conn, "delete", "patient", patient_id,
            actor=actor,
            details={"cascaded_scans": scan_count, "cascaded_examinations": exam_count},
        )
        return True


def get_patients(limit: int = 500, offset: int = 0) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT p.*,
                   (SELECT COUNT(*) FROM scans s WHERE s.patient_id = p.patient_id)
                       AS scan_count,
                   (SELECT MAX(created_at) FROM scans s WHERE s.patient_id = p.patient_id)
                       AS last_scan_at
            FROM patients p
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
            """,
            (int(limit), int(offset)),
        ).fetchall()
        return [dict(r) for r in rows]


def get_patient(patient_id: str, *, include_scans: bool = True) -> Optional[dict]:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM patients WHERE patient_id = ?", (patient_id,)
        ).fetchone()
        if not row:
            return None
        patient = dict(row)
        if include_scans:
            scan_rows = conn.execute(
                "SELECT * FROM scans WHERE patient_id = ? ORDER BY created_at DESC",
                (patient_id,),
            ).fetchall()
            patient["scans"] = [dict(r) for r in scan_rows]
            exam_rows = conn.execute(
                "SELECT * FROM examinations WHERE patient_id = ? ORDER BY created_at DESC",
                (patient_id,),
            ).fetchall()
            patient["examinations"] = [dict(r) for r in exam_rows]
        return patient


def search_patients(query: str, limit: int = 50) -> list[dict]:
    """Free-text search over id / name / village / phone."""
    like = f"%{query.strip()}%"
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT * FROM patients
            WHERE patient_id LIKE ? COLLATE NOCASE
               OR name       LIKE ? COLLATE NOCASE
               OR village    LIKE ? COLLATE NOCASE
               OR phone      LIKE ? COLLATE NOCASE
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (like, like, like, like, int(limit)),
        ).fetchall()
        return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Examination (visit / encounter) repository
# ---------------------------------------------------------------------------
_EXAM_FIELDS = (
    "chief_complaint",
    "bp_systolic", "bp_diastolic", "heart_rate", "spo2",
    "temperature_c", "weight_kg", "height_cm",
    "triage_level", "clinician_name", "outcome", "outcome_notes",
)

_TRIAGE_LEVELS = {"NORMAL", "URGENT", "EMERGENT"}
_OUTCOME_LEVELS = {"PENDING", "REFERRED", "TREATED", "DISCHARGED"}


def _validate_exam_fields(fields: dict) -> None:
    if "triage_level" in fields and fields["triage_level"] is not None:
        if fields["triage_level"] not in _TRIAGE_LEVELS:
            raise ValueError(
                f"triage_level must be one of {sorted(_TRIAGE_LEVELS)}"
            )
    if "outcome" in fields and fields["outcome"] is not None:
        if fields["outcome"] not in _OUTCOME_LEVELS:
            raise ValueError(
                f"outcome must be one of {sorted(_OUTCOME_LEVELS)}"
            )


def create_examination(
    patient_id: str, *, actor: Optional[str] = None, **fields
) -> dict:
    payload = {k: fields.get(k) for k in _EXAM_FIELDS}
    _validate_exam_fields(payload)
    now = _utcnow_iso()
    with transaction() as conn:
        if not conn.execute(
            "SELECT 1 FROM patients WHERE patient_id = ?", (patient_id,)
        ).fetchone():
            raise ValueError(f"Patient ID '{patient_id}' does not exist.")
        cols = ["patient_id", *_EXAM_FIELDS, "created_at", "updated_at"]
        placeholders = ",".join("?" for _ in cols)
        values = [patient_id, *(payload[k] for k in _EXAM_FIELDS), now, now]
        cur = conn.execute(
            f"INSERT INTO examinations ({','.join(cols)}) VALUES ({placeholders})",
            values,
        )
        exam_id = cur.lastrowid
        _audit(
            conn, "create", "examination", str(exam_id),
            actor=actor, details={"patient_id": patient_id, **payload},
        )
    return get_examination(exam_id)


def update_examination(
    exam_id: int, *, actor: Optional[str] = None, **fields
) -> dict:
    payload = {k: v for k, v in fields.items() if k in _EXAM_FIELDS and v is not None}
    if not payload:
        return get_examination(exam_id)
    _validate_exam_fields(payload)
    sets = ", ".join(f"{k} = ?" for k in payload)
    values = list(payload.values()) + [_utcnow_iso(), int(exam_id)]
    with transaction() as conn:
        cur = conn.execute(
            f"UPDATE examinations SET {sets}, updated_at = ? WHERE id = ?",
            values,
        )
        if cur.rowcount == 0:
            raise ValueError(f"Examination {exam_id} not found.")
        _audit(conn, "update", "examination", str(exam_id), actor=actor, details=payload)
    return get_examination(exam_id)


def get_examination(exam_id: int) -> Optional[dict]:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM examinations WHERE id = ?", (int(exam_id),)
        ).fetchone()
        if not row:
            return None
        exam = dict(row)
        scan_rows = conn.execute(
            "SELECT * FROM scans WHERE examination_id = ? ORDER BY created_at",
            (int(exam_id),),
        ).fetchall()
        exam["scans"] = [dict(r) for r in scan_rows]
        return exam


def list_examinations(
    patient_id: Optional[str] = None,
    triage_level: Optional[str] = None,
    limit: int = 100,
) -> list[dict]:
    sql = "SELECT * FROM examinations"
    where: list[str] = []
    params: list[Any] = []
    if patient_id:
        where.append("patient_id = ?")
        params.append(patient_id)
    if triage_level:
        if triage_level not in _TRIAGE_LEVELS:
            raise ValueError(f"triage_level must be one of {sorted(_TRIAGE_LEVELS)}")
        where.append("triage_level = ?")
        params.append(triage_level)
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(int(limit))
    with get_db() as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


# ---------------------------------------------------------------------------
# Scan repository
# ---------------------------------------------------------------------------
def _hash_file(path: str) -> Optional[str]:
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def add_scan(
    patient_id: str,
    modality: str,
    prediction: str,
    confidence: float,
    mask_url: str = "",
    heatmap_url: str = "",
    llm_report: str = "",
    *,
    examination_id: Optional[int] = None,
    original_image_path: Optional[str] = None,
    image_sha256: Optional[str] = None,
    model_version: Optional[str] = None,
    weights_sha: Optional[str] = None,
    inference_ms: Optional[int] = None,
    actor: Optional[str] = None,
) -> dict:
    if original_image_path and not image_sha256:
        image_sha256 = _hash_file(original_image_path)
    created_at = _utcnow_iso()
    with transaction() as conn:
        if not conn.execute(
            "SELECT 1 FROM patients WHERE patient_id = ?", (patient_id,)
        ).fetchone():
            raise ValueError(f"Patient ID '{patient_id}' does not exist.")
        if examination_id is not None and not conn.execute(
            "SELECT 1 FROM examinations WHERE id = ?", (int(examination_id),)
        ).fetchone():
            raise ValueError(f"Examination {examination_id} does not exist.")
        cur = conn.execute(
            """
            INSERT INTO scans (
                patient_id, modality, prediction, confidence,
                mask_url, heatmap_url, llm_report,
                examination_id, original_image_path, image_sha256,
                model_version, weights_sha, inference_ms,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                patient_id, modality, prediction, float(confidence),
                mask_url, heatmap_url, llm_report,
                examination_id, original_image_path, image_sha256,
                model_version, weights_sha, inference_ms,
                created_at,
            ),
        )
        scan_id = cur.lastrowid
        _audit(
            conn, "create", "scan", str(scan_id),
            actor=actor,
            details={
                "patient_id": patient_id, "modality": modality,
                "prediction": prediction, "confidence": confidence,
                "examination_id": examination_id,
            },
        )
    return get_scan(scan_id)


def get_scan(scan_id: int) -> Optional[dict]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM scans WHERE id = ?", (int(scan_id),)).fetchone()
        return dict(row) if row else None


def update_scan_report(scan_id: int, llm_report: str, *, actor: Optional[str] = None) -> bool:
    with transaction() as conn:
        cur = conn.execute(
            "UPDATE scans SET llm_report = ? WHERE id = ?",
            (llm_report, int(scan_id)),
        )
        if cur.rowcount == 0:
            return False
        _audit(
            conn, "update_report", "scan", str(scan_id),
            actor=actor, details={"report_chars": len(llm_report or "")},
        )
        return True


def review_scan(
    scan_id: int,
    reviewer: str,
    clinician_override: Optional[str] = None,
    *,
    actor: Optional[str] = None,
) -> dict:
    """Mark a scan as reviewed by a clinician. Optionally records an override
    label if the clinician disagreed with the AI prediction."""
    if not reviewer or not reviewer.strip():
        raise ValueError("reviewer is required")
    now = _utcnow_iso()
    with transaction() as conn:
        cur = conn.execute(
            """
            UPDATE scans
            SET reviewed_by = ?, reviewed_at = ?, clinician_override = ?
            WHERE id = ?
            """,
            (reviewer.strip(), now, clinician_override, int(scan_id)),
        )
        if cur.rowcount == 0:
            raise ValueError(f"Scan {scan_id} not found.")
        _audit(
            conn, "review", "scan", str(scan_id),
            actor=actor or reviewer,
            details={"override": clinician_override},
        )
    return get_scan(scan_id)


def list_scans(
    patient_id: Optional[str] = None,
    modality: Optional[str] = None,
    since_iso: Optional[str] = None,
    only_unreviewed: bool = False,
    limit: int = 200,
) -> list[dict]:
    sql = "SELECT * FROM scans"
    where: list[str] = []
    params: list[Any] = []
    if patient_id:
        where.append("patient_id = ?")
        params.append(patient_id)
    if modality:
        where.append("modality = ?")
        params.append(modality)
    if since_iso:
        where.append("created_at >= ?")
        params.append(since_iso)
    if only_unreviewed:
        where.append("(reviewed_by IS NULL OR reviewed_by = '')")
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(int(limit))
    with get_db() as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


# ---------------------------------------------------------------------------
# Stats / dashboard
# ---------------------------------------------------------------------------
def get_stats() -> dict:
    """Aggregate counters for a clinic-facing dashboard."""
    now = datetime.datetime.now(UTC)
    last_24h = (now - datetime.timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")
    last_7d = (now - datetime.timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
    with get_db() as conn:
        total_patients = conn.execute("SELECT COUNT(*) FROM patients").fetchone()[0]
        total_scans = conn.execute("SELECT COUNT(*) FROM scans").fetchone()[0]
        total_exams = conn.execute("SELECT COUNT(*) FROM examinations").fetchone()[0]
        scans_24h = conn.execute(
            "SELECT COUNT(*) FROM scans WHERE created_at >= ?", (last_24h,)
        ).fetchone()[0]
        scans_7d = conn.execute(
            "SELECT COUNT(*) FROM scans WHERE created_at >= ?", (last_7d,)
        ).fetchone()[0]
        unreviewed = conn.execute(
            "SELECT COUNT(*) FROM scans WHERE reviewed_by IS NULL OR reviewed_by = ''"
        ).fetchone()[0]
        urgent_pending = conn.execute(
            """
            SELECT COUNT(*) FROM examinations
            WHERE triage_level IN ('URGENT', 'EMERGENT')
              AND outcome = 'PENDING'
            """
        ).fetchone()[0]
        by_modality = conn.execute(
            "SELECT modality, COUNT(*) AS n FROM scans GROUP BY modality ORDER BY n DESC"
        ).fetchall()
        by_triage = conn.execute(
            """
            SELECT triage_level, COUNT(*) AS n FROM examinations
            GROUP BY triage_level
            """
        ).fetchall()
        avg_confidence = conn.execute(
            "SELECT AVG(confidence) FROM scans"
        ).fetchone()[0]
        avg_inference_ms = conn.execute(
            "SELECT AVG(inference_ms) FROM scans WHERE inference_ms IS NOT NULL"
        ).fetchone()[0]
        return {
            "total_patients": int(total_patients or 0),
            "total_scans": int(total_scans or 0),
            "total_examinations": int(total_exams or 0),
            "scans_last_24h": int(scans_24h or 0),
            "scans_last_7d": int(scans_7d or 0),
            "unreviewed_scans": int(unreviewed or 0),
            "urgent_pending": int(urgent_pending or 0),
            "avg_confidence": float(avg_confidence) if avg_confidence is not None else None,
            "avg_inference_ms": float(avg_inference_ms) if avg_inference_ms is not None else None,
            "scans_by_modality": [dict(r) for r in by_modality],
            "examinations_by_triage": [dict(r) for r in by_triage],
            "generated_at": _utcnow_iso(),
            "db_path": DB_PATH,
        }


# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------
def export_patients_csv() -> str:
    """Returns the full patient table as a CSV string (UTF-8, RFC 4180-ish).
    Suitable for FastAPI to stream as a download."""
    columns = [
        "patient_id", "name", "age", "sex",
        "phone", "village", "blood_group",
        "allergies", "chronic_conditions", "emergency_contact",
        "notes", "created_at", "updated_at",
    ]
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(columns)
    with get_db() as conn:
        for row in conn.execute(f"SELECT {','.join(columns)} FROM patients ORDER BY created_at"):
            writer.writerow(["" if v is None else v for v in row])
    return buf.getvalue()


def export_scans_csv(patient_id: Optional[str] = None) -> str:
    columns = [
        "id", "patient_id", "examination_id", "modality",
        "prediction", "confidence", "model_version", "inference_ms",
        "reviewed_by", "reviewed_at", "clinician_override",
        "image_sha256", "created_at",
    ]
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(columns)
    with get_db() as conn:
        if patient_id:
            cur = conn.execute(
                f"SELECT {','.join(columns)} FROM scans WHERE patient_id = ? ORDER BY created_at",
                (patient_id,),
            )
        else:
            cur = conn.execute(
                f"SELECT {','.join(columns)} FROM scans ORDER BY created_at"
            )
        for row in cur:
            writer.writerow(["" if v is None else v for v in row])
    return buf.getvalue()
