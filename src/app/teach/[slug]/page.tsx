"use client";

import { useState, useRef, useCallback, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Wind, Activity as TbIcon, Bone, Flame,
  Upload, MousePointer2, Pencil, Trash2, CheckCircle2, XCircle, Activity, ChevronRight, Info, Droplet, HelpCircle, Network, Coins
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AnnotationCanvas, BoundingBox } from "@/components/ui/annotation-canvas";
import { cn } from "@/lib/utils";
import { teachingApi } from "@/lib/teaching-api";
import type { AnalysisResponse } from "@/lib/types";

// --- MODULE CONFIGURATION ---
const MODULE_CONFIGS: Record<string, {
  name: string;
  icon: React.ElementType;
  description: string;
  diagnoses: string[];
  taskModes: ("classification" | "segmentation")[];
  labels: string[];
  explanations: Record<string, string>;
}> = {
  wound_burn: {
    name: "Wound & Burn Care",
    icon: Flame,
    description: "Classify acute wound infections (cellulitis, necrotizing) and burn-depth grading.",
    diagnoses: [
      "Normal Healthy Healing",
      "Cellulitis Wound Infection",
      "Necrotizing Infection",
      "1st-Degree Burn",
      "2nd-Degree Burn",
      "3rd-Degree Burn"
    ],
    taskModes: ["classification"],
    labels: ["Infection Region", "Erythema Border", "Necrotic Area"],
    explanations: {
      "Normal Healthy Healing": "Wound bed shows healthy granulation tissue and normal edges with no acute erythema or exudate.",
      "Cellulitis Wound Infection": "Spreading superficial erythema, swelling, and warmth typical of acute skin infection.",
      "Necrotizing Infection": "Rapidly spreading tissue necrosis with potential gas or dark discoloration; immediate surgical emergency.",
      "1st-Degree Burn": "Superficial burn with erythema and pain, affecting only the epidermis with no blistering.",
      "2nd-Degree Burn": "Partial-thickness burn showing painful erythema with fluid-filled blisters, affecting the epidermis and dermis.",
      "3rd-Degree Burn": "Full-thickness burn with white, charred, or leathery necrotic skin and no sensation due to nerve destruction.",
    },
  },
  chest_xray: {
    name: "Chest X-Ray",
    icon: Wind,
    description: "Screen for pneumonia, pneumothorax, and cardiomegaly.",
    diagnoses: ["Normal", "Pneumonia", "Effusion", "Pneumothorax", "Cardiomegaly"],
    taskModes: ["classification", "segmentation"],
    labels: ["Infiltration", "Pleural Space", "Heart Contour"],
    explanations: {
      Pneumonia: "Consolidation or patchy opacities visualized, consistent with alveolar inflammatory process.",
      Pneumothorax: "Visible visceral pleural line with absence of lung markings peripherally.",
      Normal: "Clear lung fields, normal cardiothoracic ratio, and intact costophrenic angles.",
    },
  },
  tb: {
    name: "Tuberculosis",
    icon: TbIcon,
    description: "Detect active TB patterns and cavitary lesions.",
    diagnoses: ["Negative", "Active TB", "Latent TB", "Post-TB Scars"],
    taskModes: ["classification", "segmentation"],
    labels: ["Cavitary Lesion", "Infiltrate", "Node"],
    explanations: {
      "Active TB": "Upper lobe infiltrates and cavitary lesions visualized, highly suspicious for active mycobacterial infection.",
      Negative: "No evidence of active pulmonary tuberculosis or significant hilar lymphadenopathy.",
    },
  },
  bone_fracture: {
    name: "Pediatric Bone",
    icon: Bone,
    description: "Analyze pediatric radiographs for growth and fractures.",
    diagnoses: ["Normal Growth", "Simple Fracture", "Buckle Fracture", "Epiphyseal Injury"],
    taskModes: ["classification", "segmentation"],
    labels: ["Fracture Line", "Physis", "Abnormality"],
    explanations: {
      "Buckle Fracture": "Cortical bulging typical of pediatric greenstick/incomplete fracture patterns.",
      "Normal Growth": "Physeal plates are open and appear appropriate for developmental age.",
    },
  },
  malaria: {
    name: "Malaria Screening",
    icon: Droplet,
    description: "Screen thin-smear blood cells under 100x microscopy for Plasmodium falciparum.",
    diagnoses: ["UNINFECTED", "PARASITIZED"],
    taskModes: ["classification"],
    labels: ["Suspected Parasite", "Inclusion Body"],
    explanations: {
      PARASITIZED: "Red blood cell contains chromatin dots, ring-form trophozoites, or multi-infection features characteristic of Plasmodium falciparum.",
      UNINFECTED: "Red blood cell exhibits normal biconcave morphology, uniform size, and no intracellular chromatin or ring structures.",
    },
  },
};

// Support legacy slugs from teach/page.tsx
const SLUG_ALIASES: Record<string, string> = {
  chest: "chest_xray",
  bone: "bone_fracture",
};

const slugToApiMap: Record<string, (file: File) => Promise<AnalysisResponse>> = {
  chest_xray: teachingApi.predictChestXray,
  bone_fracture: teachingApi.predictBoneFracture,
  wound_burn: teachingApi.predictWoundBurn,
  tb: teachingApi.predictTB,
  malaria: teachingApi.predictMalaria,
};

export default function TeachWorkflowPage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const rawSlug = resolvedParams.slug || "chest_xray";
  const slug = SLUG_ALIASES[rawSlug] ?? rawSlug;

  const config = MODULE_CONFIGS[slug] || MODULE_CONFIGS.chest_xray;

  // --- STATE ---
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [taskMode, setTaskMode] = useState<"classification" | "segmentation">(config.taskModes[0]);

  // Assessment State
  const [userDiagnosis, setUserDiagnosis] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<BoundingBox[]>([]);
  const [tool, setTool] = useState<"draw" | "select">("draw");
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);

  // Workflow State
  const [isChecking, setIsChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openDefenseIndex, setOpenDefenseIndex] = useState<number | null>(null);
  const [modelPrediction, setModelPrediction] = useState<{
    diagnosis: string;
    confidence: number;
    explanation: string;
    isCorrect: boolean;
    modelBoxes: BoundingBox[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!imageSrc) { setImageDims(null); return; }
    const probe = new Image();
    probe.onload = () => setImageDims({ w: probe.naturalWidth, h: probe.naturalHeight });
    probe.src = imageSrc;
  }, [imageSrc]);

  // --- HANDLERS ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Revoke previous URL
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setRawFile(file);
      setImageSrc(url);
      resetState();
    }
  };

  const resetState = () => {
    setUserDiagnosis(null);
    setAnnotations([]);
    setHasChecked(false);
    setModelPrediction(null);
    setSelectedBoxId(null);
    setErrorMessage(null);
  };

  const handleBoxDrawn = useCallback((newBox: Omit<BoundingBox, "id" | "source">) => {
    const box: BoundingBox = {
      ...newBox,
      id: Math.random().toString(36).substring(7),
      source: "user",
      label: config.labels[0] || "User ROI",
    };
    setAnnotations((prev) => [...prev, box]);
  }, [config.labels]);

  const handleBoxMove = useCallback((id: string, x: number, y: number) => {
    setAnnotations((prev) => prev.map((b) => b.id === id ? { ...b, x, y } : b));
  }, []);

  const handleCheckAnswer = async () => {
    if (!rawFile) return;
    setIsChecking(true);
    setErrorMessage(null);

    try {
      const predictFn = slugToApiMap[slug] || teachingApi.predictChestXray;
      const apiResponse: AnalysisResponse = await predictFn(rawFile);

      const isCorrect = userDiagnosis === apiResponse.top_label;

      const modelBoxes: BoundingBox[] = (apiResponse.detections || []).map((d, i) => ({
        id: `model-${i}`,
        source: "model" as const,
        label: d.label,
        x: d.bbox[0] * 100,
        y: d.bbox[1] * 100,
        width: (d.bbox[2] - d.bbox[0]) * 100,
        height: (d.bbox[3] - d.bbox[1]) * 100,
        confidence: Math.round(d.confidence * 100),
      }));

      setModelPrediction({
        diagnosis: apiResponse.top_label,
        confidence:
          apiResponse?.top_probability != null
            ? Math.round(apiResponse.top_probability * 100)
            : 0,
        explanation:
          config.explanations[apiResponse.top_label] || "Model analysis complete.",
        isCorrect,
        modelBoxes,
      });

      setIsChecking(false);
      setHasChecked(true);
    } catch (error) {
      console.error("Inference Error:", error);
      setErrorMessage("Failed to run on-device inference. Check backend status.");
      setIsChecking(false);
    }
  };

  return (
    <div className="flex h-screen bg-teach-bg overflow-hidden font-sans text-teach-text-primary selection:bg-teach-accent-bright/20">

      {/* --- SIDEBAR --- */}
      <aside className="w-[340px] shrink-0 border-r border-teach-border flex flex-col z-30 bg-teach-bg-elevated/80 backdrop-blur-xl h-full shadow-2xl relative">

        {/* Sidebar Header */}
        <div className="p-8 border-b border-teach-border">
          <button
            onClick={() => router.push("/teach")}
            className="flex items-center gap-3 group mb-8"
          >
            <div className="w-8 h-8 rounded-lg bg-teach-bg flex items-center justify-center group-hover:bg-teach-accent-bright group-hover:text-teach-bg transition-all duration-300 border border-teach-border group-hover:border-transparent">
              <ArrowLeft className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-teach-text-muted group-hover:text-teach-text-primary transition-colors">
              Exit Session
            </span>
          </button>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-teach-accent-deep/50 flex items-center justify-center border border-teach-accent-bright/20 shadow-lg shadow-teach-accent-bright/5">
              <config.icon className="w-6 h-6 text-teach-accent-bright" />
            </div>
            <div>
              <h2 className="font-bold text-xl text-teach-text-primary leading-tight">{config.name}</h2>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-teach-accent-bright animate-pulse" />
                <span className="text-[10px] font-mono text-teach-accent-bright uppercase tracking-widest">
                  Training Active
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Inline error banner */}
        {errorMessage && (
          <div
            role="alert"
            aria-live="polite"
            className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start justify-between gap-2"
          >
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="shrink-0 text-red-500 hover:text-red-700 font-medium underline text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">

          {/* Step 1: Mode & Upload */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-teach-text-muted">
                Clinical Workflow
              </h3>
              {config.taskModes.length > 1 && (
                <div className="flex p-1 bg-teach-bg rounded-lg border border-teach-border shadow-inner scale-90">
                  <button
                    onClick={() => { setTaskMode("classification"); resetState(); }}
                    title="Classification — pick a diagnosis"
                    aria-label="Classification mode"
                    className={cn(
                      "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                      taskMode === "classification"
                        ? "bg-teach-accent-bright text-teach-bg shadow-sm"
                        : "text-teach-text-muted hover:text-teach-text-primary"
                    )}
                  >
                    DIAG
                  </button>
                  <button
                    onClick={() => { setTaskMode("segmentation"); resetState(); }}
                    title="Segmentation — draw regions of interest"
                    aria-label="Segmentation mode"
                    className={cn(
                      "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                      taskMode === "segmentation"
                        ? "bg-teach-accent-bright text-teach-bg shadow-sm"
                        : "text-teach-text-muted hover:text-teach-text-primary"
                    )}
                  >
                    ROI
                  </button>
                </div>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-6 rounded-2xl border-2 border-dashed border-teach-border flex flex-col items-center justify-center gap-3 hover:bg-teach-card/40 hover:border-teach-accent-bright/30 transition-all duration-300 bg-teach-bg group"
            >
              <div className="w-10 h-10 rounded-full bg-teach-bg-elevated flex items-center justify-center group-hover:scale-110 transition-transform">
                <Upload className="w-4 h-4 text-teach-text-secondary" />
              </div>
              <div className="text-center">
                <span className="block text-xs font-bold text-teach-text-primary mb-1">
                  {imageSrc ? "Replace Scan" : "Load Clinical Case"}
                </span>
                <span className="block text-[10px] text-teach-text-muted">DICOM / JPG / PNG</span>
              </div>
            </button>
          </div>

          {/* Step 2: Assessment */}
          {imageSrc && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-teach-text-muted">
                Blind Assessment
              </h3>

              {taskMode === "classification" ? (
                <div className="grid grid-cols-1 gap-2.5">
                  {config.diagnoses.map((opt) => (
                    <button
                      key={opt}
                      disabled={hasChecked}
                      onClick={() => setUserDiagnosis(opt)}
                      className={cn(
                        "w-full text-left px-5 py-4 rounded-xl border text-sm font-bold transition-all flex items-center justify-between group",
                        userDiagnosis === opt
                          ? "bg-teach-accent-bright text-teach-bg border-teach-accent-bright shadow-lg shadow-teach-accent-bright/20"
                          : "bg-teach-bg text-teach-text-secondary border-teach-border hover:border-teach-text-muted/30",
                        hasChecked && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {opt}
                      <ChevronRight
                        className={cn(
                          "w-4 h-4 transition-transform",
                          userDiagnosis === opt
                            ? "translate-x-0"
                            : "opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0"
                        )}
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 bg-teach-bg rounded-2xl border border-teach-border flex flex-col gap-4 shadow-inner">
                  <div className="flex bg-teach-bg-elevated rounded-xl p-1.5 border border-teach-border shadow-inner">
                    <button
                      onClick={() => setTool("draw")}
                      disabled={hasChecked}
                      className={cn(
                        "flex-1 py-2 rounded-lg flex justify-center transition-all",
                        tool === "draw"
                          ? "bg-teach-accent-bright text-teach-bg shadow-md"
                          : "text-teach-text-muted hover:text-teach-text-primary"
                      )}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setTool("select")}
                      disabled={hasChecked}
                      className={cn(
                        "flex-1 py-2 rounded-lg flex justify-center transition-all",
                        tool === "select"
                          ? "bg-teach-accent-bright text-teach-bg shadow-md"
                          : "text-teach-text-muted hover:text-teach-text-primary"
                      )}
                    >
                      <MousePointer2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-[10px] text-teach-text-muted text-center italic">
                    Annotate suspected regions on the scan surface
                  </div>
                  <button
                    onClick={() => { setAnnotations([]); setSelectedBoxId(null); }}
                    disabled={hasChecked}
                    className="w-full py-2.5 text-[11px] font-bold text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all flex justify-center items-center gap-2 border border-transparent hover:border-rose-500/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear Workspace
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Action */}
          {imageSrc && !hasChecked && (
            <div className="pt-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
              <button
                onClick={handleCheckAnswer}
                disabled={
                  isChecking ||
                  (taskMode === "classification" && !userDiagnosis) ||
                  (taskMode === "segmentation" && annotations.length === 0)
                }
                className="relative overflow-hidden group w-full py-5 rounded-2xl bg-teach-accent-bright text-teach-bg font-bold flex items-center justify-center gap-3 hover:bg-teach-accent-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(56,189,248,0.2)] hover:shadow-[0_0_40px_rgba(56,189,248,0.4)] active:scale-[0.98]"
              >
                {isChecking ? (
                  <>
                    <Activity className="w-5 h-5 animate-spin" /> Running Inference...
                  </>
                ) : (
                  <>Check clinical answer</>
                )}
              </button>
            </div>
          )}

          {/* Step 4: Expert Pitch & Defense */}
          <div className="space-y-4 pt-6 border-t border-teach-border/60">
            <div className="flex items-center gap-2 mb-2">
              <HelpCircle className="w-4 h-4 text-teach-accent-bright" />
              <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-teach-text-primary font-bold">
                Expert Pitch &amp; Defense
              </h3>
            </div>
            <p className="text-[10px] text-teach-text-muted leading-relaxed mb-4">
              Pre-approved defenses for hackathon panels, field audits, and rural deployments.
            </p>

            <div className="space-y-3">
              {[
                {
                  id: "hotspot",
                  title: "Will the Pi Hotspot actually work?",
                  icon: Network,
                  q: "How does offline operation work on a Raspberry Pi? Will a local Pi Hotspot work for clinical diagnostics?",
                  a: "Yes, flawlessly. The Raspberry Pi 5 is configured as a standalone WiFi access point (Hotspot) via NetworkManager, broadcasting a custom SSID (e.g., 'RadPi-Diagnostics-Net'). Clinicians simply connect their smartphone or laptop and open 'http://radpi.local'. Since all classification, segmentation, and quantized LLMs run locally in RAM/CPU, it needs 0% internet and keeps 100% of patient data secure on-device."
                },
                {
                  id: "microscope",
                  title: "Why RadPi if they have a microscope?",
                  icon: Droplet,
                  q: "If a health post already has a microscope, don't they already know how to perform malaria screening?",
                  a: "Having a microscope doesn't mean having a pathologist. Rural areas face severe clinical specialist deficits; reading Giemsa blood smears is highly complex and error-prone. By inserting a $15-20 USB digital eyepiece camera into the barrel of any standard analog microscope, RadPi digitizes it. The AI highlights parasitized cells using Grad-CAM heatmaps, serving as an automated triage tool and real-time training assistant for local health workers."
                },
                {
                  id: "pi-cost",
                  title: "Isn't Raspberry Pi too expensive?",
                  icon: Coins,
                  q: "Isn't a Raspberry Pi too expensive right now to deploy in rural clinics?",
                  a: "No, the math is clear: traditional automated lab diagnostic units cost $5,000–$20,000+. RadPi packages a complete AI diagnostic server (Pi 5 + USB eyepiece camera + case) for under $150. It runs off-grid on a 5V power bank or simple solar panel, costing pennies in utility fees. For mass production, it can easily scale down to a $35 Raspberry Pi 4 or cheap Orange Pi boards, making it highly viable."
                }
              ].map((item, idx) => {
                const isOpen = openDefenseIndex === idx;
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-teach-border bg-teach-bg-elevated/40 overflow-hidden transition-all duration-300 hover:border-teach-accent-bright/20"
                  >
                    <button
                      onClick={() => setOpenDefenseIndex(isOpen ? null : idx)}
                      className="w-full text-left p-4 flex items-center justify-between gap-3 text-xs font-bold text-teach-text-secondary hover:text-teach-text-primary transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-teach-accent-bright" />
                        <span>{item.title}</span>
                      </div>
                      <ChevronRight
                        className={cn(
                          "w-3.5 h-3.5 text-teach-text-muted transition-transform duration-300",
                          isOpen && "rotate-90 text-teach-accent-bright"
                        )}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="px-4 pb-4 pt-1 text-[11px] text-teach-text-muted leading-relaxed space-y-2 border-t border-teach-border/30 bg-teach-bg/25">
                            <p className="font-semibold text-teach-text-secondary italic">
                              &ldquo;{item.q}&rdquo;
                            </p>
                            <p className="text-teach-text-muted text-[11px] leading-relaxed font-normal">
                              {item.a}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      {/* --- WORKSPACE --- */}
      <div className="flex-1 flex flex-col min-w-0 relative bg-teach-bg">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-teach-accent-bright/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-teach-accent-deep/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/3" />
        </div>

        {/* Workspace Toolbar */}
        <div className="h-16 border-b border-teach-border bg-teach-bg-elevated/40 backdrop-blur-md z-20 flex items-center justify-between px-8">
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-teach-text-muted">
              Workspace Canvas
            </span>
            {imageSrc && (
              <div className="flex items-center gap-2 px-3 py-1 bg-teach-bg rounded-full border border-teach-border text-[10px] font-bold text-teach-text-secondary">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Case Ready
              </div>
            )}
          </div>
          <div className="flex items-center gap-6">
            <button className="text-teach-text-muted hover:text-teach-text-primary transition-colors">
              <Info className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* CANVAS AREA */}
        <main className="flex-1 relative overflow-hidden flex items-center justify-center p-12 lg:p-16 z-10">
          {!imageSrc ? (
            <div className="flex flex-col items-center justify-center text-center max-w-sm animate-in fade-in zoom-in-95 duration-700">
              <div className="w-24 h-24 rounded-[2.5rem] bg-teach-bg-elevated flex items-center justify-center mb-8 border border-teach-border shadow-2xl">
                <Upload className="w-8 h-8 text-teach-accent-bright opacity-40" />
              </div>
              <h2 className="text-2xl font-bold mb-3 text-teach-text-primary">Awaiting Case Data</h2>
              <p className="text-teach-text-secondary text-sm leading-relaxed mb-8">
                Select a DICOM image or high-resolution clinical scan from your local storage to begin the training workflow.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-2.5 bg-teach-bg-elevated text-teach-text-primary rounded-xl border border-teach-border hover:border-teach-accent-bright/30 transition-all font-bold text-sm"
              >
                Browse Files
              </button>
            </div>
          ) : (
            <div className="relative w-full h-full bg-teach-bg-elevated/30 rounded-[2.5rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)] border border-teach-border overflow-hidden flex items-center justify-center p-6 backdrop-blur-sm group">
              <AnnotationCanvas
                imageSrc={imageSrc}
                userBoxes={annotations}
                modelBoxes={hasChecked ? (modelPrediction?.modelBoxes || []) : []}
                showUserLayer={taskMode === "segmentation"}
                showModelLayer={hasChecked && taskMode === "segmentation"}
                showHeatmap={false}
                activeTool={hasChecked ? null : (taskMode === "segmentation" ? tool : null)}
                onBoxDrawn={handleBoxDrawn}
                onBoxMove={handleBoxMove}
                onBoxSelect={setSelectedBoxId}
                selectedBoxId={selectedBoxId}
                isAnalyzing={isChecking}
              />

              {/* HUD Elements */}
              {imageDims && (
                <div className="absolute top-8 left-8 flex flex-col gap-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <div className="px-3 py-1.5 bg-teach-bg/80 backdrop-blur-md rounded-lg border border-teach-border text-[9px] font-mono text-teach-text-muted uppercase tracking-widest">
                    Res {imageDims.w} × {imageDims.h}
                  </div>
                  <div className="px-3 py-1.5 bg-teach-bg/80 backdrop-blur-md rounded-lg border border-teach-border text-[9px] font-mono text-teach-text-muted uppercase tracking-widest">
                    Fit to view
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* --- RESULTS PANEL --- */}
      <AnimatePresence>
        {hasChecked && modelPrediction && (
          <motion.aside
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            className="w-[420px] shrink-0 border-l border-teach-border bg-teach-bg-elevated/95 backdrop-blur-3xl h-full flex flex-col shadow-[-40px_0_80px_rgba(0,0,0,0.4)] z-40 absolute right-0"
          >
            <div className="p-8 border-b border-teach-border bg-teach-bg/50 flex items-center justify-between">
              <h3 className="font-bold text-2xl text-teach-text-primary">Clinical Feedback</h3>
              <button
                onClick={resetState}
                className="w-10 h-10 rounded-full bg-teach-bg-elevated border border-teach-border flex items-center justify-center hover:bg-teach-accent-bright hover:text-teach-bg transition-all group"
              >
                <Trash2 className="w-4 h-4 text-teach-text-muted group-hover:text-teach-bg" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar pb-24">

              {/* Match Status Card */}
              <div
                className={cn(
                  "p-8 rounded-[2rem] flex flex-col items-center text-center border relative overflow-hidden group",
                  modelPrediction.isCorrect
                    ? "bg-emerald-500/5 border-emerald-500/20 shadow-[0_20px_40px_rgba(16,185,129,0.05)]"
                    : "bg-rose-500/5 border-rose-500/20 shadow-[0_20px_40px_rgba(244,63,94,0.05)]"
                )}
              >
                <div
                  className={cn(
                    "w-20 h-20 rounded-full flex items-center justify-center mb-6 relative z-10",
                    modelPrediction.isCorrect ? "bg-emerald-500 text-teach-bg" : "bg-rose-500 text-teach-bg"
                  )}
                >
                  {modelPrediction.isCorrect ? (
                    <CheckCircle2 className="w-10 h-10" />
                  ) : (
                    <XCircle className="w-10 h-10" />
                  )}
                </div>
                <h4
                  className={cn(
                    "text-2xl font-bold mb-2 relative z-10",
                    modelPrediction.isCorrect ? "text-emerald-400" : "text-rose-400"
                  )}
                >
                  {modelPrediction.isCorrect ? "Clinical Agreement" : "Review Discrepancy"}
                </h4>
                <p
                  className={cn(
                    "text-sm leading-relaxed relative z-10 max-w-xs",
                    modelPrediction.isCorrect ? "text-emerald-500/70" : "text-rose-500/70"
                  )}
                >
                  {modelPrediction.isCorrect
                    ? "Your read matches the model's top class."
                    : "The model converged on a different class. Compare findings below."}
                </p>

                <div
                  className={cn(
                    "absolute -bottom-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-20",
                    modelPrediction.isCorrect ? "bg-emerald-500" : "bg-rose-500"
                  )}
                />
              </div>

              {/* Comparison Grid */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-teach-text-muted">
                  Inference Comparison
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-6 bg-teach-bg rounded-[1.5rem] border border-teach-border shadow-inner group">
                    <span className="text-[10px] font-mono uppercase text-teach-text-muted mb-2 block group-hover:text-teach-text-secondary transition-colors">
                      Your Answer
                    </span>
                    <span className="font-bold text-base text-teach-text-primary block leading-tight">
                      {taskMode === "classification"
                        ? (userDiagnosis || "Unlabeled")
                        : `${annotations.length} ROI Selection`}
                    </span>
                  </div>
                  <div className="p-6 bg-teach-accent-deep/20 rounded-[1.5rem] border border-teach-accent-bright/20 shadow-lg ring-1 ring-teach-accent-bright/10">
                    <span className="text-[10px] font-mono uppercase text-teach-accent-bright/60 mb-2 block">
                      RadPi AI
                    </span>
                    <span className="font-bold text-base text-teach-accent-bright block leading-tight">
                      {modelPrediction.diagnosis}
                    </span>
                    <div className="mt-2 flex items-center gap-1.5">
                      <div className="h-1 flex-1 bg-teach-accent-bright/10 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${modelPrediction.confidence}%` }}
                          transition={{ duration: 1, delay: 0.5 }}
                          className="h-full bg-teach-accent-bright"
                        />
                      </div>
                      <span className="text-[10px] text-teach-accent-bright font-bold">
                        {modelPrediction.confidence}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Explanation Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-teach-text-muted">
                    Clinical Findings
                  </h4>
                  <span className="text-[9px] bg-teach-bg border border-teach-border px-2 py-0.5 rounded text-teach-text-muted">
                    EXPLANATION
                  </span>
                </div>
                <div className="p-6 bg-teach-bg/60 rounded-[1.5rem] border border-teach-border shadow-inner relative group">
                  <p className="text-sm text-teach-text-secondary leading-relaxed italic">
                    &ldquo;{modelPrediction.explanation}&rdquo;
                  </p>
                  <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Info className="w-4 h-4 text-teach-accent-bright/30" />
                  </div>
                </div>
              </div>

              {/* Next Case Button */}
              <button
                onClick={resetState}
                className="w-full py-4 rounded-2xl bg-teach-bg-elevated border border-teach-border text-teach-text-primary font-bold text-sm hover:border-teach-accent-bright/50 transition-all flex items-center justify-center gap-2"
              >
                Load Next Case <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
