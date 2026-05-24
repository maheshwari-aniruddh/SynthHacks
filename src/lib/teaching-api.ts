import type {
  AnalysisResponse,
  AuditLogEntry,
  ClinicStats,
  Examination,
  Patient,
  Scan,
} from "./types";

// Dynamically target the FastAPI backend directly on port 8000 based on how
// the user accessed the frontend (e.g., http://radpi.local, http://192.168.1.146, or localhost).
// This completely avoids Next.js server-side proxy/rewriting bugs for file uploads.
export const API_BASE_URL = typeof window !== "undefined"
  ? `http://${window.location.hostname}:8000`
  : (process.env.BACKEND_URL ?? "http://127.0.0.1:8000");

async function predict(modality: string, file: File, patientId?: string): Promise<AnalysisResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const apiModality = modality.replace(/_/g, "-");
  let url = `${API_BASE_URL}/analyze/${apiModality}`;
  if (patientId) {
    url += `?patient_id=${encodeURIComponent(patientId)}`;
  }
  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to analyze ${modality}: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<AnalysisResponse>;
}

export const teachingApi = {
  predictChestXray:    (file: File, patientId?: string) => predict("chest_xray",    file, patientId),
  predictBoneFracture: (file: File, patientId?: string) => predict("bone_fracture", file, patientId),
  predictWoundBurn:    (file: File, patientId?: string) => predict("wound_burn",    file, patientId),
  predictTB:           (file: File, patientId?: string) => predict("tb",            file, patientId),
  predictMalaria:      (file: File, patientId?: string) => predict("malaria",       file, patientId),
  predictBrainMRI:     (file: File, patientId?: string) => predict("brain_mri",     file, patientId),
  predictDental:       (file: File, patientId?: string) => predict("dental",        file, patientId),
  predictDermatology:  (file: File, patientId?: string) => predict("dermatology",   file, patientId),
  predictCataract:     (file: File, patientId?: string) => predict("cataract",      file, patientId),

  getPatients: async (): Promise<Patient[]> => {
    const res = await fetch(`${API_BASE_URL}/api/patients`);
    if (!res.ok) throw new Error("Failed to load patients");
    return res.json();
  },

  getPatient: async (patientId: string): Promise<Patient> => {
    const res = await fetch(`${API_BASE_URL}/api/patients/${encodeURIComponent(patientId)}`);
    if (!res.ok) throw new Error("Failed to load patient profile");
    return res.json();
  },

  createPatient: async (patient: Omit<Patient, "created_at" | "scans">): Promise<Patient> => {
    const res = await fetch(`${API_BASE_URL}/api/patients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patient),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Failed to create patient");
    }
    return res.json();
  },

  addScanToPatient: async (patientId: string, scan: Omit<Scan, "id" | "created_at">): Promise<Scan> => {
    const res = await fetch(`${API_BASE_URL}/api/patients/${encodeURIComponent(patientId)}/scans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scan),
    });
    if (!res.ok) throw new Error("Failed to add scan record");
    return res.json();
  },

  updateScanReport: async (scanId: number, reportText: string): Promise<{ status: string }> => {
    const res = await fetch(`${API_BASE_URL}/api/scans/${scanId}/report`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llm_report: reportText }),
    });
    if (!res.ok) throw new Error("Failed to update scan report");
    return res.json();
  },

  // --- v2 extensions: search, examinations, review, stats, export ---------
  searchPatients: async (query: string, limit = 50): Promise<Patient[]> => {
    const url = `${API_BASE_URL}/api/patients/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Patient search failed");
    return res.json();
  },

  updatePatient: async (patientId: string, patch: Partial<Patient>): Promise<Patient> => {
    const res = await fetch(`${API_BASE_URL}/api/patients/${encodeURIComponent(patientId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Failed to update patient");
    }
    return res.json();
  },

  deletePatient: async (patientId: string): Promise<{ status: string; patient_id: string }> => {
    const res = await fetch(`${API_BASE_URL}/api/patients/${encodeURIComponent(patientId)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete patient");
    return res.json();
  },

  createExamination: async (patientId: string, exam: Partial<Examination>): Promise<Examination> => {
    const res = await fetch(
      `${API_BASE_URL}/api/patients/${encodeURIComponent(patientId)}/examinations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exam),
      }
    );
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Failed to create examination");
    }
    return res.json();
  },

  updateExamination: async (examId: number, patch: Partial<Examination>): Promise<Examination> => {
    const res = await fetch(`${API_BASE_URL}/api/examinations/${examId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Failed to update examination");
    }
    return res.json();
  },

  getExamination: async (examId: number): Promise<Examination> => {
    const res = await fetch(`${API_BASE_URL}/api/examinations/${examId}`);
    if (!res.ok) throw new Error("Failed to load examination");
    return res.json();
  },

  listExaminations: async (opts: { patientId?: string; triageLevel?: string; limit?: number } = {}): Promise<Examination[]> => {
    const params = new URLSearchParams();
    if (opts.patientId) params.set("patient_id", opts.patientId);
    if (opts.triageLevel) params.set("triage_level", opts.triageLevel);
    if (opts.limit) params.set("limit", String(opts.limit));
    const url = `${API_BASE_URL}/api/examinations${params.toString() ? `?${params}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to list examinations");
    return res.json();
  },

  reviewScan: async (scanId: number, reviewer: string, override?: string): Promise<Scan> => {
    const res = await fetch(`${API_BASE_URL}/api/scans/${scanId}/review`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewer, clinician_override: override ?? null }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Failed to review scan");
    }
    return res.json();
  },

  listScans: async (opts: { patientId?: string; modality?: string; since?: string; unreviewed?: boolean; limit?: number } = {}): Promise<Scan[]> => {
    const params = new URLSearchParams();
    if (opts.patientId) params.set("patient_id", opts.patientId);
    if (opts.modality) params.set("modality", opts.modality);
    if (opts.since) params.set("since", opts.since);
    if (opts.unreviewed) params.set("unreviewed", "true");
    if (opts.limit) params.set("limit", String(opts.limit));
    const url = `${API_BASE_URL}/api/scans${params.toString() ? `?${params}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to list scans");
    return res.json();
  },

  getStats: async (): Promise<ClinicStats> => {
    const res = await fetch(`${API_BASE_URL}/api/stats`);
    if (!res.ok) throw new Error("Failed to load stats");
    return res.json();
  },

  getAuditLog: async (limit = 100, entityType?: string): Promise<AuditLogEntry[]> => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (entityType) params.set("entity_type", entityType);
    const res = await fetch(`${API_BASE_URL}/api/audit?${params}`);
    if (!res.ok) throw new Error("Failed to load audit log");
    return res.json();
  },

  exportPatientsCsvUrl: (): string => `${API_BASE_URL}/api/export/patients.csv`,
  exportScansCsvUrl: (patientId?: string): string =>
    patientId
      ? `${API_BASE_URL}/api/export/scans.csv?patient_id=${encodeURIComponent(patientId)}`
      : `${API_BASE_URL}/api/export/scans.csv`,
};
