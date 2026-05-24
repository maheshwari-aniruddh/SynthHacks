export interface AnalysisResponse {
  modality: string;
  model_version: string;
  weights_sha: string;
  inference_ts: string;
  request_id: string;
  top_label: string;
  top_probability: number; // 0-1
  is_indeterminate: boolean;
  distribution: Array<{ label: string; probability: number }>;
  segmentation: {
    available: boolean;
    heatmap_url: string | null;
    classes: Array<{ label: string; mask_url: string }>;
  };
  detections: Array<{
    label: string;
    confidence: number;
    bbox: [number, number, number, number]; // xyxy normalized
  }>;
  saved_scan_id?: number;
  db_save_status?: string;
}

export interface ModuleConfig {
  slug: string;
  label: string;
  description: string;
  taskModes: ('classification' | 'segmentation' | 'detection')[];
}

export interface Scan {
  id: number;
  patient_id: string;
  modality: string;
  prediction: string;
  confidence: number;
  mask_url?: string;
  heatmap_url?: string;
  llm_report?: string;
  created_at: string;
  examination_id?: number | null;
  original_image_path?: string | null;
  image_sha256?: string | null;
  model_version?: string | null;
  weights_sha?: string | null;
  inference_ms?: number | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  clinician_override?: string | null;
}

export type TriageLevel = "NORMAL" | "URGENT" | "EMERGENT";
export type ExamOutcome = "PENDING" | "REFERRED" | "TREATED" | "DISCHARGED";

export interface Examination {
  id: number;
  patient_id: string;
  chief_complaint?: string | null;
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  heart_rate?: number | null;
  spo2?: number | null;
  temperature_c?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  triage_level: TriageLevel;
  clinician_name?: string | null;
  outcome: ExamOutcome;
  outcome_notes?: string | null;
  created_at: string;
  updated_at?: string | null;
  scans?: Scan[];
}

export interface Patient {
  id?: number;
  patient_id: string;
  name: string;
  age: number;
  sex: string;
  notes?: string;
  created_at?: string;
  updated_at?: string | null;
  phone?: string | null;
  village?: string | null;
  blood_group?: string | null;
  allergies?: string | null;
  chronic_conditions?: string | null;
  emergency_contact?: string | null;
  scan_count?: number;
  last_scan_at?: string | null;
  scans?: Scan[];
  examinations?: Examination[];
}

export interface ClinicStats {
  total_patients: number;
  total_scans: number;
  total_examinations: number;
  scans_last_24h: number;
  scans_last_7d: number;
  unreviewed_scans: number;
  urgent_pending: number;
  avg_confidence: number | null;
  avg_inference_ms: number | null;
  scans_by_modality: Array<{ modality: string; n: number }>;
  examinations_by_triage: Array<{ triage_level: TriageLevel; n: number }>;
  generated_at: string;
  db_path: string;
}

export interface AuditLogEntry {
  id: number;
  ts: string;
  actor?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details?: Record<string, unknown> | null;
}

