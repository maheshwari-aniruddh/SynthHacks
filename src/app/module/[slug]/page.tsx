"use client";

/** RadPi Diagnostic Module Page - Build Trigger 1 **/
import { useState, useRef, use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, UploadCloud, Wind, Bone, Flame, Droplet,
  Wifi, Activity, FileText, ZoomIn, ZoomOut, Download, Loader2, Settings,
  MessageSquare, User, Cpu, Printer, Send,
  Lock, Unlock, Search, Plus, Calendar, ShieldCheck, ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GlassCard } from "@/components/ui/glass-card";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { cn } from "@/lib/utils";
import { teachingApi, API_BASE_URL } from "@/lib/teaching-api";

const MODULES = [
  { slug: "chest_xray", name: "Chest X-Ray", icon: Wind },
  { slug: "bone_fracture", name: "Bone Fracture", icon: Bone },
  { slug: "wound_burn", name: "Wound & Burn", icon: Flame },
  { slug: "tb", name: "Tuberculosis", icon: Activity },
  { slug: "malaria", name: "Malaria", icon: Droplet },
];

const DEMO_SCANS: Record<string, { path: string; title: string; size: string; type: string; model: string }> = {
  chest_xray: { path: "/demo/chest_xray.jpg", title: "Chest_Pneumonia.jpg", size: "61 KB", type: "Chest X-Ray", model: "DenseNet-121" },
  bone_fracture: { path: "/demo/bone_fracture.jpg", title: "Tibia_Fracture.jpg", size: "117 KB", type: "Radiograph", model: "YOLOv8m-seg" },
  wound_burn: { path: "/demo/wound_burn.jpg", title: "Burn_Wound.jpg", size: "61 KB", type: "Clinical Photo", model: "MobileNetV2" },
  tb: { path: "/demo/tb.jpg", title: "TB_Screening.jpg", size: "32 KB", type: "Chest X-Ray", model: "ViT-Base" },
  malaria: { path: "/demo/malaria.jpg", title: "Malaria_Smear.jpg", size: "117 KB", type: "Blood Smear", model: "MobileNetV2" },
};

const formatLabel = (label: string) => {
  return label
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export function MaskChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-colors",
        active
          ? "bg-[#D20A2E] border-[#D20A2E] text-white"
          : "bg-white border-[#E5D3CF] text-[#8A5B60] hover:border-[#D20A2E] hover:text-[#D20A2E]"
      ].join(" ")}
    >
      {label}
    </button>
  );
}

type DistributionItem = { label: string; probability: number };
interface PredictionDistributionProps { distribution: DistributionItem[]; highlightLabel?: string; }

export function PredictionDistribution({ distribution, highlightLabel }: PredictionDistributionProps) {
  if (!distribution?.length) return null;
  const sorted = [...distribution].sort((a, b) => b.probability - a.probability);
  const top = highlightLabel ?? sorted[0].label;

  return (
    <div className="space-y-3">
      {sorted.map((p) => {
        const pct = Math.round(p.probability * 100);
        const isTop = p.label === top;
        const label = p.label.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        return (
          <div key={p.label} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className={isTop ? "font-semibold" : "text-muted-foreground"}>{label}</span>
              <span className={isTop ? "font-semibold" : "text-muted-foreground"}>{pct}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[#F3E8EA] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: isTop ? "#D20A2E" : "#E8A0AA"
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter();
  const { slug } = use(params);
  
  const [fileState, setFileState] = useState<"empty" | "uploaded" | "analyzing" | "analyzed">("empty");
  const [activeTab, setActiveTab] = useState<"original" | "analysis" | "gradcam">("original");
  const [activeMasks, setActiveMasks] = useState<Record<string, boolean>>({});
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [apiResult, setApiResult] = useState<any>(null);
  const [zoomScale, setZoomScale] = useState(1);

  // --- LLM Copilot & Chat states ---
  const [rightSidebarTab, setRightSidebarTab] = useState<"diagnostics" | "copilot" | "patients">("diagnostics");
  const [patientAge, setPatientAge] = useState("");
  const [patientSex, setPatientSex] = useState("Male");
  const [patientComplaint, setPatientComplaint] = useState("");
  const [reportText, setReportText] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  // --- Patient Database & Security states ---
  const [isDbUnlocked, setIsDbUnlocked] = useState(false);
  const [passcodeDigits, setPasscodeDigits] = useState("");
  const [passcodeError, setPasscodeError] = useState(false);
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRegisteringNew, setIsRegisteringNew] = useState(false);
  const [loadingPatients, setLoadingPatients] = useState(false);

  const [newPatientForm, setNewPatientForm] = useState({
    patient_id: "",
    name: "",
    age: "",
    sex: "Male",
    notes: ""
  });
  const [registerError, setRegisterError] = useState("");

  const loadPatients = async () => {
    setLoadingPatients(true);
    try {
      const data = await teachingApi.getPatients();
      setPatients(data);
    } catch (e) {
      console.error("Failed to load patients:", e);
    } finally {
      setLoadingPatients(false);
    }
  };

  useEffect(() => {
    if (isDbUnlocked) {
      loadPatients();
    }
  }, [isDbUnlocked]);

  const handleSelectPatient = async (patient: any) => {
    try {
      const detail = await teachingApi.getPatient(patient.patient_id);
      setSelectedPatient(detail);
      setPatientAge(detail.age.toString());
      setPatientSex(detail.sex);
    } catch (e) {
      console.error("Failed to load patient detail:", e);
      setSelectedPatient(patient);
    }
  };

  const handlePasscodePress = (num: string) => {
    if (passcodeDigits.length >= 4) return;
    setPasscodeError(false);
    const nextDigits = passcodeDigits + num;
    setPasscodeDigits(nextDigits);

    if (nextDigits.length === 4) {
      if (nextDigits === "1234") {
        setTimeout(() => {
          setIsDbUnlocked(true);
          setPasscodeDigits("");
        }, 150);
      } else {
        setPasscodeError(true);
        setTimeout(() => {
          setPasscodeDigits("");
          setPasscodeError(false);
        }, 800);
      }
    }
  };

  const handlePasscodeBackspace = () => {
    if (passcodeDigits.length > 0) {
      setPasscodeDigits(passcodeDigits.slice(0, -1));
      setPasscodeError(false);
    }
  };

  const handleStartRegistration = () => {
    const randomId = `PAT-${Math.floor(10000 + Math.random() * 90000)}`;
    setNewPatientForm({
      patient_id: randomId,
      name: "",
      age: "",
      sex: "Male",
      notes: ""
    });
    setRegisterError("");
    setIsRegisteringNew(true);
  };

  const handleRegisterPatientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError("");
    if (!newPatientForm.name.trim()) {
      setRegisterError("Full Name is required.");
      return;
    }
    if (!newPatientForm.age.trim() || isNaN(Number(newPatientForm.age))) {
      setRegisterError("Valid Age is required.");
      return;
    }
    try {
      const created = await teachingApi.createPatient({
        patient_id: newPatientForm.patient_id,
        name: newPatientForm.name,
        age: Number(newPatientForm.age),
        sex: newPatientForm.sex,
        notes: newPatientForm.notes
      });
      await loadPatients();
      setSelectedPatient(created);
      setPatientAge(created.age.toString());
      setPatientSex(created.sex);
      setIsRegisteringNew(false);
    } catch (err: any) {
      setRegisterError(err.message || "Failed to register patient.");
    }
  };

  const handleReloadHistoricalScan = (scan: any) => {
    const simulatedResult = {
      top_label: scan.prediction,
      top_probability: scan.confidence,
      is_indeterminate: false,
      distribution: [
        { label: scan.prediction, probability: scan.confidence }
      ],
      segmentation: {
        available: !!scan.mask_url,
        type: "mask",
        classes: scan.mask_url ? [{ label: scan.prediction, mask_url: scan.mask_url }] : []
      },
      explanation: {
        available: !!scan.heatmap_url,
        heatmap_url: scan.heatmap_url
      },
      saved_scan_id: scan.id,
      db_save_status: "Success"
    };

    if (scan.prediction !== "Normal" && scan.prediction !== "normal") {
      simulatedResult.distribution.push({
        label: "Normal",
        probability: Math.max(0, 1 - scan.confidence)
      });
    }

    setApiResult(simulatedResult);
    setPreviewUrl(scan.heatmap_url ? `${API_BASE_URL}${scan.heatmap_url}` : (scan.mask_url ? `${API_BASE_URL}${scan.mask_url}` : null));
    setFileState("analyzed");
    setActiveTab(scan.mask_url ? "analysis" : (scan.heatmap_url ? "gradcam" : "original"));
    
    if (scan.mask_url) {
      setActiveMasks({ [scan.prediction]: true });
    } else {
      setActiveMasks({});
    }

    setPatientComplaint("");
    setReportText(scan.llm_report || "");
    setChatMessages([]);
    setChatInput("");
    setRightSidebarTab("diagnostics");
  };

  const handleNewScan = () => {
    setFileState("empty");
    setActiveTab("original");
    setActiveMasks({});
    setRawFile(null);
    setPreviewUrl(null);
    setApiResult(null);
    setZoomScale(1);
    setPatientComplaint("");
    setReportText("");
    setChatMessages([]);
    setChatInput("");
    setRightSidebarTab("diagnostics");
    if (selectedPatient) {
      setPatientAge(selectedPatient.age.toString());
      setPatientSex(selectedPatient.sex);
    } else {
      setPatientAge("");
      setPatientSex("Male");
    }
  };


  // Simple Markdown-to-React parser helper to display structured findings nicely
  const renderFormattedText = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      let parts: React.ReactNode[] = [];
      let cursor = 0;
      const boldRegex = /\*\*(.*?)\*\//g; // standard bold format handler
      const altBoldRegex = /\*\*(.*?)\*\*/g;
      let match;
      let lineText = line;
      
      if (lineText.startsWith("### ")) {
        return <h4 key={idx} className="font-semibold text-xs text-ink uppercase tracking-wider mt-3 mb-1 first:mt-0">{lineText.substring(4)}</h4>;
      }
      if (lineText.startsWith("## ")) {
        return <h4 key={idx} className="font-bold text-sm text-ink uppercase tracking-wider mt-3 mb-1 first:mt-0">{lineText.substring(3)}</h4>;
      }
      if (lineText.startsWith("# ")) {
        return <h4 key={idx} className="font-extrabold text-base text-ink uppercase tracking-wider mt-4 mb-2 first:mt-0">{lineText.substring(2)}</h4>;
      }

      const isList = lineText.startsWith("- ") || lineText.startsWith("* ");
      if (isList) {
        lineText = lineText.substring(2);
      }

      let key = 0;
      while ((match = altBoldRegex.exec(lineText)) !== null) {
        const startIndex = match.index;
        if (startIndex > cursor) {
          parts.push(lineText.substring(cursor, startIndex));
        }
        parts.push(<strong key={key++} className="font-bold text-ink">{match[1]}</strong>);
        cursor = altBoldRegex.lastIndex;
      }
      if (cursor < lineText.length) {
        parts.push(lineText.substring(cursor));
      }

      if (isList) {
        return (
          <li key={idx} className="ml-4 list-disc text-[12px] leading-relaxed text-ink-muted my-0.5">
            {parts.length > 0 ? parts : lineText}
          </li>
        );
      }

      return (
        <p key={idx} className="text-[12px] leading-relaxed text-ink-muted my-1 min-h-[1em]">
          {parts.length > 0 ? parts : lineText}
        </p>
      );
    });
  };

  const handleGenerateReport = async () => {
    if (!apiResult) return;
    setIsGeneratingReport(true);
    setReportText("");
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/llm/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modality: slug,
          predicted_class: apiResult.top_label,
          confidence: apiResult.top_probability,
          age: patientAge || "unknown",
          sex: patientSex,
          complaint: patientComplaint || "Acute trauma / emergency presentation",
          model_mode: "brief"
        })
      });
      
      if (!res.ok) throw new Error("LLM pipeline stream failed");
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No body reader");

      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        text += chunk;
        setReportText(text);
      }

      if (apiResult?.saved_scan_id && text.trim()) {
        try {
          await teachingApi.updateScanReport(apiResult.saved_scan_id, text);
          // Reload patient records so historical record shows the saved report
          if (selectedPatient) {
            const detail = await teachingApi.getPatient(selectedPatient.patient_id);
            setSelectedPatient(detail);
          }
        } catch (dbErr) {
          console.error("Failed to save report to SQLite:", dbErr);
        }
      }
    } catch (error) {
      console.error("Report Generation Error:", error);
      setReportText("Failed to compile clinician report. Ensure LOM weights are present and server is online.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleSendChatMessage = async () => {
    const input = chatInput.trim();
    if (!input || !apiResult || isChatLoading) return;

    setChatInput("");
    const newMessages = [...chatMessages, { role: "user" as const, content: input }];
    setChatMessages(newMessages);
    setIsChatLoading(true);

    setChatMessages(prev => [...prev, { role: "assistant" as const, content: "" }]);

    try {
      const res = await fetch(`${API_BASE_URL}/api/llm/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: newMessages.slice(-6),
          latest_message: input,
          scan_modality: slug,
          scan_result: apiResult.top_label,
          model_mode: "brief"
        })
      });

      if (!res.ok) throw new Error("Chat copilot stream failed");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No body reader");

      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        fullText += chunk;
        
        setChatMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: fullText };
          return updated;
        });
      }
    } catch (error) {
      console.error("Chat Error:", error);
      setChatMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "Failed to communicate with local copilot. Ensure LLM is running." };
        return updated;
      });
    } finally {
      setIsChatLoading(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeScan = DEMO_SCANS[slug] || DEMO_SCANS.chest_xray;
  const displayImage = previewUrl || activeScan.path;
  const scanMetaTitle = rawFile?.name || activeScan.title;

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setRawFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setFileState("uploaded");
      setZoomScale(1);
    }
  };

  const handleAnalyze = async () => {
    if (fileState === "uploaded" && rawFile) {
      setFileState("analyzing");
      setZoomScale(1);
      
      try {
        const slugMap: Record<string, any> = {
          chest_xray: teachingApi.predictChestXray,
          bone_fracture: teachingApi.predictBoneFracture,
          wound_burn: teachingApi.predictWoundBurn,
          tb: teachingApi.predictTB,
          malaria: teachingApi.predictMalaria,
        };

        const predictFn = slugMap[slug] || teachingApi.predictChestXray;
        const result = await predictFn(rawFile, selectedPatient?.patient_id);
        
        setApiResult(result);
        
        if (result.segmentation?.available && result.segmentation.type === "mask") {
           const initialMasks: Record<string, boolean> = {};
           result.segmentation.classes.forEach((c: any) => initialMasks[c.label] = true);
           setActiveMasks(initialMasks);
        }

        if (selectedPatient) {
          try {
            const detail = await teachingApi.getPatient(selectedPatient.patient_id);
            setSelectedPatient(detail);
          } catch (dbErr) {
            console.error("Failed to reload patient scans:", dbErr);
          }
        }

        setFileState("analyzed");
        setActiveTab(result.explanation?.available ? "gradcam" : (result.segmentation?.available ? "analysis" : "original"));
      } catch (error) {
        console.error("Diagnostic Error:", error);
        alert("Failed to connect to Pi 5 Backend.");
        setFileState("uploaded");
      }
    }
  };

  return (
    <div className="flex h-screen bg-surface-2 overflow-hidden font-body text-ink">
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handleFileChange} 
      />

      {/* --- SIDEBAR --- */}
      <aside className="w-[240px] shrink-0 border-r border-surface-4 flex flex-col z-30 bg-surface-2 h-full">
        <div className="pt-6 px-5 pb-4">
          <div className="cursor-pointer" onClick={() => router.push("/")}>
             <img src="/logo.png" alt="radpi logo" className="h-8 w-auto object-contain" />
          </div>
        </div>
        
        <div className="mx-5 mb-6 h-[1px] bg-surface-4" />

        <div className="flex-1 flex flex-col gap-1 overflow-hidden">
          <div className="px-5 mb-2 font-mono text-[10px] uppercase tracking-widest text-ink-faint">Modules</div>
          <div className="flex flex-col gap-1 overflow-y-auto px-3 scrollbar-hide">
            {MODULES.map((mod) => {
              const isActive = mod.slug === slug;
              return (
                <div 
                  key={mod.slug}
                  onClick={() => router.push(`/module/${mod.slug}`)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 group",
                    isActive ? "bg-white shadow-sm border border-surface-4 text-[#D20A2E]" : "hover:bg-white/50 text-ink-muted"
                  )}
                >
                  <mod.icon className={cn("w-4 h-4", isActive ? "text-[#D20A2E]" : "text-ink-faint group-hover:text-ink-muted")} />
                  <span className="text-[13px] font-medium">{mod.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-auto p-5 border-t border-surface-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium text-ink text-[13px]">Pi Online</span>
            </div>
            <div className="flex items-center gap-2 text-ink-muted font-mono text-[10px]">
              <Wifi className="w-3.5 h-3.5" />
              <span>radpi-local</span>
            </div>
          </div>
        </div>
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        
        {/* TOPBAR */}
        <header className="h-14 shrink-0 bg-surface-1 border-b border-surface-4 flex items-center justify-between px-6 z-10">
          <div className="flex flex-col">
            <h1 className="font-display text-2xl font-semibold text-ink leading-none">Inference Report</h1>
            <p className="font-mono text-[10px] text-ink-faint uppercase tracking-widest mt-1">
              {fileState === "analyzed" ? `Completed · Pi 5 · INT8` : "Awaiting Scan"}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {fileState !== "empty" && (
              <button 
                type="button"
                onClick={handleNewScan} 
                className="h-9 px-4 text-xs font-semibold flex items-center bg-[#D20A2E] hover:bg-[#B20A27] text-white rounded-lg transition-all shadow-sm shadow-[#D20A2E]/25 hover:shadow-md active:scale-95 cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5 mr-2" />
                New Scan
              </button>
            )}
            <button onClick={() => router.push("/")} className="h-9 px-4 text-xs flex items-center hover:bg-surface-2 rounded-lg transition-colors text-ink">
              <ArrowLeft className="w-3.5 h-3.5 mr-2" />
              Back to Home
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden h-[calc(100vh-56px)]">
          
          {/* --- VIEWER (flex-1) --- */}
          <main className="flex-1 flex flex-col bg-surface-3 relative min-w-0 border-r border-surface-4 overflow-hidden">
            
            {/* VIEWER TOPBAR */}
            <div className="h-12 bg-surface-3 border-b border-surface-4 px-4 flex items-center justify-between shrink-0">
              <div className="font-mono text-[10px] text-ink-faint uppercase tracking-widest">
                {fileState !== "empty" ? `${scanMetaTitle} · ${activeScan.type}` : "No scan loaded"}
              </div>
              
              <div className="flex h-full py-1">
                {fileState === "analyzed" && (
                   <>
                    <button
                      onClick={() => setActiveTab("original")}
                      className={cn(
                        "px-5 h-full rounded-t-lg font-mono text-[10px] uppercase tracking-wider transition-all",
                        activeTab === "original" ? "bg-white border-b-2 border-cherry text-ink font-bold shadow-sm" : "bg-surface-3 text-ink-faint hover:bg-surface-2 font-medium"
                      )}
                    >
                      Original
                    </button>
                    {apiResult?.segmentation?.available && (
                      <button
                        onClick={() => setActiveTab("analysis")}
                        className={cn(
                          "px-5 h-full rounded-t-lg font-mono text-[10px] uppercase tracking-wider transition-all",
                          activeTab === "analysis" ? "bg-white border-b-2 border-cherry text-ink font-bold shadow-sm" : "bg-surface-3 text-ink-faint hover:bg-surface-2 font-medium"
                        )}
                      >
                        AI Overlay
                      </button>
                    )}
                    {apiResult?.explanation?.available && (
                      <button
                        onClick={() => setActiveTab("gradcam")}
                        className={cn(
                          "px-5 h-full rounded-t-lg font-mono text-[10px] uppercase tracking-wider transition-all",
                          activeTab === "gradcam" ? "bg-white border-b-2 border-cherry text-ink font-bold shadow-sm" : "bg-surface-3 text-ink-faint hover:bg-surface-2 font-medium"
                        )}
                      >
                        Grad-CAM
                      </button>
                    )}
                   </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-white/50 px-2 py-1 rounded border border-surface-4 shadow-sm flex items-center gap-1.5 mr-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="font-mono text-[10px] text-ink-muted uppercase font-bold">{activeScan.model}</span>
                </div>
                <div className="flex items-center gap-1 bg-surface-2 rounded-lg border border-surface-4 p-0.5">
                  <button
                    type="button"
                    aria-label="Zoom out"
                    onClick={() => setZoomScale(prev => Math.max(prev - 0.15, 0.5))}
                    className="p-1.5 hover:bg-white rounded text-ink-muted hover:text-ink transition-all cursor-pointer"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Zoom in"
                    onClick={() => setZoomScale(prev => Math.min(prev + 0.15, 3))}
                    className="p-1.5 hover:bg-white rounded text-ink-muted hover:text-ink transition-all cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  aria-label="Download scan"
                  onClick={() => {
                    const imgUrl = fileState === "analyzed" && activeTab === "gradcam" && apiResult?.explanation?.available
                      ? `${API_BASE_URL}${apiResult.explanation.heatmap_url}`
                      : displayImage;
                    const link = document.createElement("a");
                    link.href = imgUrl;
                    link.download = `radpi_${slug}_${apiResult?.request_id || "scan"}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="w-8 h-8 flex items-center justify-center bg-surface-2 border border-surface-4 rounded-lg text-ink-muted hover:bg-white hover:text-ink transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* IMAGE AREA */}
            <div className="flex-1 relative flex items-center justify-center p-8 overflow-hidden bg-surface-3 shadow-inner">
              <AnimatePresence mode="wait">
                {fileState === "empty" ? (
                  <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center w-full max-w-3xl">
                    <img src="/logo.png" alt="radpi logo" className="h-10 w-auto object-contain mb-8 opacity-20 grayscale" />
                    <div
                      className="min-h-[420px] w-full max-w-3xl flex flex-col items-center justify-center px-12 py-16 text-center border-2 border-dashed border-ink/10 rounded-[2.5rem] cursor-pointer hover:border-[#D20A2E]/30 hover:bg-white/70 transition-all bg-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.02)] backdrop-blur-sm"
                      onClick={handleUploadClick}
                    >
                      <UploadCloud className="w-20 h-20 text-ink/20 mb-6 stroke-[1.25] animate-pulse" style={{ animationDuration: "3s" }} />
                      <h3 className="font-display text-2xl text-ink/50 font-medium">Drop your scan here</h3>
                      <p className="font-mono text-xs text-ink/30 uppercase tracking-[0.2em] mt-3">PNG · JPG · DICOM</p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="loaded" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="relative max-w-full max-h-full flex items-center justify-center">
                    <div 
                      style={{ transform: `scale(${zoomScale})`, transition: "transform 0.2s ease-out", transformOrigin: "center center" }}
                      className="p-2 bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-surface-4 overflow-hidden relative"
                    >
                      <img 
                        src={
                          fileState === "analyzed" && activeTab === "gradcam" && apiResult?.explanation?.available
                            ? `${API_BASE_URL}${apiResult.explanation.heatmap_url}`
                            : displayImage
                        } 
                        alt="Scan" 
                        className={cn("max-w-full max-h-full object-contain rounded-2xl transition-all duration-700 relative z-10", fileState === "analyzing" ? "opacity-30 grayscale blur-sm" : "")} 
                      />
                      
                      {fileState === "analyzed" && activeTab === "analysis" && apiResult?.segmentation?.available && (
                        <div className="absolute inset-2 z-20 pointer-events-none overflow-hidden rounded-2xl">
                          {/* Rendering Masks */}
                          {apiResult.segmentation.type === "mask" && apiResult.segmentation.classes.map((cls: any, idx: number) => {
                             if (!activeMasks[cls.label]) return null;
                             return (
                               <img 
                                 key={idx}
                                 src={`${API_BASE_URL}${cls.mask_url}`} 
                                 className="absolute inset-0 w-full h-full object-contain opacity-80 transition-opacity duration-300"
                                 alt={`${cls.label} mask`}
                               />
                             );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </main>

          {/* --- RIGHT PANEL (320px) --- */}
          {/* --- RIGHT PANEL (320px) --- */}
          <aside className="w-[320px] shrink-0 flex flex-col bg-surface-1 h-full overflow-hidden border-l border-surface-4">
            
            {/* TABS SELECTION HEADER - ALWAYS ACCESSIBLE */}
            <div className="flex border-b border-surface-4 p-1 bg-surface-2 shrink-0">
              <button
                type="button"
                onClick={() => setRightSidebarTab("diagnostics")}
                className={cn(
                  "flex-1 py-2 rounded-lg font-mono text-[10px] uppercase tracking-wider font-bold transition-all flex items-center justify-center gap-1.5",
                  rightSidebarTab === "diagnostics" 
                    ? "bg-white text-[#D20A2E] shadow-sm border border-surface-4" 
                    : "text-ink-faint hover:text-ink-muted"
                )}
              >
                <Activity className="w-3.5 h-3.5" />
                {fileState === "analyzed" ? "Diagnostics" : "Workspace"}
              </button>
              
              {fileState === "analyzed" && (
                <button
                  type="button"
                  onClick={() => setRightSidebarTab("copilot")}
                  className={cn(
                    "flex-1 py-2 rounded-lg font-mono text-[10px] uppercase tracking-wider font-bold transition-all flex items-center justify-center gap-1.5",
                    rightSidebarTab === "copilot" 
                      ? "bg-white text-[#D20A2E] shadow-sm border border-surface-4" 
                      : "text-ink-faint hover:text-ink-muted"
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  AI Copilot
                </button>
              )}
              
              <button
                type="button"
                onClick={() => setRightSidebarTab("patients")}
                className={cn(
                  "flex-1 py-2 rounded-lg font-mono text-[10px] uppercase tracking-wider font-bold transition-all flex items-center justify-center gap-1.5",
                  rightSidebarTab === "patients" 
                    ? "bg-white text-[#D20A2E] shadow-sm border border-surface-4" 
                    : "text-ink-faint hover:text-ink-muted"
                )}
              >
                <User className="w-3.5 h-3.5" />
                Patients
              </button>
            </div>

            {/* TAB CONTENTS */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
              
              {/* --- PATIENTS TAB PANEL --- */}
              {rightSidebarTab === "patients" && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {!isDbUnlocked ? (
                    /* SECURITY PIN LOCKSCREEN GATE */
                    <div className="flex-1 flex flex-col justify-between p-6 bg-gradient-to-b from-white to-surface-2 text-center">
                      <div className="my-auto space-y-6">
                        <div className="w-16 h-16 rounded-3xl bg-cherry/10 flex items-center justify-center mx-auto shadow-sm border border-cherry/20 text-cherry animate-pulse">
                          <Lock className="w-7 h-7 stroke-[1.5]" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="font-display text-xl font-bold text-ink">Patient Records Locked</h3>
                          <p className="text-xs text-ink-faint leading-relaxed px-4">
                            Access restricted to authorized clinical staff. Please authenticate using the workstation PIN.
                          </p>
                        </div>

                        {/* Passcode dots display */}
                        <div className="flex justify-center gap-4 py-2">
                          {[0, 1, 2, 3].map((idx) => {
                            const active = passcodeDigits.length > idx;
                            return (
                              <div
                                key={idx}
                                className={cn(
                                  "w-3.5 h-3.5 rounded-full border border-[#E5D3CF] transition-all duration-155",
                                  active 
                                    ? "bg-[#D20A2E] border-[#D20A2E] scale-110 shadow-sm shadow-[#D20A2E]/35" 
                                    : "bg-surface-3 scale-100",
                                  passcodeError && "bg-red-500 border-red-500 animate-bounce"
                                )}
                              />
                            );
                          })}
                        </div>

                        {/* Numeric Keypad Grid */}
                        <div className="grid grid-cols-3 gap-3 max-w-[220px] mx-auto pt-2">
                          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => handlePasscodePress(num)}
                              className="w-12 h-12 rounded-full bg-white hover:bg-surface-3 active:bg-surface-4 text-ink font-semibold text-lg flex items-center justify-center border border-surface-4 shadow-sm transition-all"
                            >
                              {num}
                            </button>
                          ))}
                          <div />
                          <button
                            type="button"
                            onClick={() => handlePasscodePress("0")}
                            className="w-12 h-12 rounded-full bg-white hover:bg-surface-3 active:bg-surface-4 text-ink font-semibold text-lg flex items-center justify-center border border-surface-4 shadow-sm transition-all"
                          >
                            0
                          </button>
                          <button
                            type="button"
                            onClick={handlePasscodeBackspace}
                            className="w-12 h-12 rounded-full bg-white hover:bg-surface-3 text-ink-muted hover:text-ink flex items-center justify-center border border-surface-4 shadow-sm transition-all text-xs"
                          >
                            Del
                          </button>
                        </div>
                      </div>

                      {/* AES-256 / HIPAA Compliance Badge */}
                      <div className="pt-4 border-t border-surface-4">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-semibold tracking-wide uppercase font-mono mx-auto">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          AES-256 Offline Encryption Active
                        </div>
                        <p className="text-[9px] text-ink-faint mt-1.5 font-mono">HIPAA & GDPR Compliant Offline Node</p>
                      </div>
                    </div>
                  ) : (
                    /* UNLOCKED PATIENT DATABASE DIRECTORY */
                    <div className="flex-1 flex flex-col overflow-hidden text-left bg-surface-1">
                      
                      {/* Sub-header with search & register */}
                      <div className="p-4 border-b border-surface-4 space-y-3 bg-surface-2 shrink-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-ink font-semibold text-sm">
                            <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                            Directory
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={handleStartRegistration}
                              className="px-2.5 py-1 text-[10px] font-bold bg-[#D20A2E] text-white hover:bg-[#B20A27] rounded-md shadow-sm transition-colors flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              New
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsDbUnlocked(false)}
                              className="px-2 py-1 text-[10px] font-bold bg-white text-ink-muted border border-surface-4 hover:bg-surface-3 rounded-md shadow-sm transition-colors"
                            >
                              Lock
                            </button>
                          </div>
                        </div>

                        {!isRegisteringNew && (
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-ink-faint" />
                            <input
                              type="text"
                              placeholder="Search patient ID or name..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="w-full pl-8 pr-3 py-1.5 bg-white border border-surface-4 rounded-lg text-xs focus:outline-none focus:border-[#D20A2E] text-ink"
                            />
                          </div>
                        )}
                      </div>

                      {/* Panel Main Area */}
                      <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col">
                        {isRegisteringNew ? (
                          /* REGISTER NEW PATIENT FORM */
                          <form onSubmit={handleRegisterPatientSubmit} className="p-5 space-y-4">
                            <div className="flex items-center justify-between mb-1">
                              <h3 className="text-xs font-bold uppercase tracking-wider text-cherry font-mono">Register New Patient</h3>
                              <button
                                type="button"
                                onClick={() => setIsRegisteringNew(false)}
                                className="text-[10px] font-semibold text-ink-faint hover:text-ink transition-colors"
                              >
                                Cancel
                              </button>
                            </div>

                            {registerError && (
                              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-1.5">
                                <span className="font-semibold">Error:</span> {registerError}
                              </div>
                            )}

                            <div className="space-y-1">
                              <label className="text-[10px] text-ink-muted uppercase font-bold font-mono">Patient ID (Unique)</label>
                              <input
                                type="text"
                                placeholder="PAT-12345"
                                value={newPatientForm.patient_id}
                                onChange={(e) => setNewPatientForm({ ...newPatientForm, patient_id: e.target.value })}
                                className="w-full px-3 py-2 bg-white border border-surface-4 rounded-xl text-xs focus:outline-none focus:border-[#D20A2E] text-ink font-mono font-bold"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] text-ink-muted uppercase font-bold font-mono">Full Name</label>
                              <input
                                type="text"
                                placeholder="e.g. John Doe"
                                value={newPatientForm.name}
                                onChange={(e) => setNewPatientForm({ ...newPatientForm, name: e.target.value })}
                                className="w-full px-3 py-2 bg-white border border-surface-4 rounded-xl text-xs focus:outline-none focus:border-[#D20A2E] text-ink font-medium"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label className="text-[10px] text-ink-muted uppercase font-bold font-mono">Age</label>
                                <input
                                  type="text"
                                  placeholder="e.g. 38"
                                  value={newPatientForm.age}
                                  onChange={(e) => setNewPatientForm({ ...newPatientForm, age: e.target.value })}
                                  className="w-full px-3 py-2 bg-white border border-surface-4 rounded-xl text-xs focus:outline-none focus:border-[#D20A2E] text-ink"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-ink-muted uppercase font-bold font-mono">Sex</label>
                                <select
                                  value={newPatientForm.sex}
                                  onChange={(e) => setNewPatientForm({ ...newPatientForm, sex: e.target.value })}
                                  className="w-full px-3 py-1.5 bg-white border border-surface-4 rounded-xl text-xs focus:outline-none focus:border-[#D20A2E] text-ink"
                                >
                                  <option value="Male">Male</option>
                                  <option value="Female">Female</option>
                                  <option value="Other">Other</option>
                                </select>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] text-ink-muted uppercase font-bold font-mono">Clinical Notes / History</label>
                              <textarea
                                rows={3}
                                placeholder="Optional pre-existing conditions, allergies, or past diagnosis details..."
                                value={newPatientForm.notes}
                                onChange={(e) => setNewPatientForm({ ...newPatientForm, notes: e.target.value })}
                                className="w-full px-3 py-2 bg-white border border-surface-4 rounded-xl text-xs focus:outline-none focus:border-[#D20A2E] text-ink resize-none"
                              />
                            </div>

                            <button
                              type="submit"
                              className="w-full inline-flex items-center justify-center h-10 text-xs font-semibold bg-[#D20A2E] text-white hover:bg-[#B20A27] rounded-full shadow-sm transition-colors mt-2"
                            >
                              Save Patient Record
                            </button>
                          </form>
                        ) : selectedPatient ? (
                          /* DETAILED SELECTED PATIENT SUMMARY */
                          <div className="p-4 space-y-5 flex-1 flex flex-col overflow-hidden">
                            
                            {/* Patient Demographics Card */}
                            <GlassCard className="p-4 border-surface-4 bg-white/70 space-y-3 shrink-0">
                              <div className="flex items-center justify-between border-b border-surface-4 pb-2">
                                <div className="flex flex-col">
                                  <h4 className="font-display text-base font-bold text-ink leading-tight">{selectedPatient.name}</h4>
                                  <span className="font-mono text-[9px] text-[#D20A2E] font-bold mt-0.5">{selectedPatient.patient_id}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setSelectedPatient(null)}
                                  className="text-[10px] font-semibold text-ink-faint hover:text-ink transition-colors"
                                >
                                  Close
                                </button>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                <div className="bg-surface-2 p-1.5 rounded-lg border border-surface-4 flex flex-col">
                                  <span className="text-[9px] text-ink-faint uppercase font-mono">Age</span>
                                  <span className="font-bold text-ink">{selectedPatient.age}</span>
                                </div>
                                <div className="bg-surface-2 p-1.5 rounded-lg border border-surface-4 flex flex-col">
                                  <span className="text-[9px] text-ink-faint uppercase font-mono">Sex</span>
                                  <span className="font-bold text-ink">{selectedPatient.sex}</span>
                                </div>
                                <div className="bg-surface-2 p-1.5 rounded-lg border border-surface-4 flex flex-col items-center justify-center">
                                  <div className="w-2 h-2 rounded-full bg-emerald-500 mb-0.5 animate-pulse" />
                                  <span className="text-[9px] text-emerald-800 font-bold uppercase font-mono leading-none">Active</span>
                                </div>
                              </div>
                              {selectedPatient.notes && (
                                <div className="text-[11px] text-ink-muted leading-relaxed bg-surface-2/40 p-2 rounded-lg border border-surface-4">
                                  <span className="font-bold text-ink">Notes: </span>{selectedPatient.notes}
                                </div>
                              )}
                            </GlassCard>

                            {/* Scan History Timeline Section */}
                            <div className="flex-1 flex flex-col min-h-0">
                              <h4 className="font-mono text-[10px] text-ink-faint uppercase tracking-widest mb-3 shrink-0">Scan History Timeline</h4>
                              
                              {!selectedPatient.scans || selectedPatient.scans.length === 0 ? (
                                <div className="flex-1 border-2 border-dashed border-surface-4 rounded-2xl flex flex-col items-center justify-center p-6 text-center text-ink-faint">
                                  <Calendar className="w-8 h-8 text-ink/10 mb-2 stroke-[1.5]" />
                                  <span className="text-[11px] font-bold">No past scans recorded</span>
                                  <p className="text-[9px] mt-0.5 max-w-[150px]">Any new scans run for this patient will be automatically logged here.</p>
                                </div>
                              ) : (
                                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-hide">
                                  {selectedPatient.scans.map((scan: any) => {
                                    const dateStr = new Date(scan.created_at).toLocaleDateString(undefined, {
                                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                                    });
                                    const isCurrent = apiResult?.saved_scan_id === scan.id;
                                    const displayModality = scan.modality.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
                                    
                                    return (
                                      <div
                                        key={scan.id}
                                        onClick={() => handleReloadHistoricalScan(scan)}
                                        className={cn(
                                          "p-3 rounded-xl border transition-all cursor-pointer text-left flex flex-col gap-1",
                                          isCurrent 
                                            ? "bg-[#FDF3F5] border-[#D20A2E] shadow-sm"
                                            : "bg-white border-surface-4 hover:border-ink/20 hover:shadow-[0_4px_12px_rgba(0,0,0,0.01)]"
                                        )}
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-bold text-ink">{displayModality}</span>
                                          <span className="text-[9px] font-mono text-ink-faint">{dateStr}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px]">
                                          <div className="flex items-center gap-1">
                                            <span className="text-ink-muted">Finding:</span>
                                            <span className="font-semibold text-ink">{scan.prediction}</span>
                                          </div>
                                          <span className="font-mono text-[#D20A2E] font-bold">{Math.round(scan.confidence * 100)}%</span>
                                        </div>
                                        {scan.llm_report && (
                                          <div className="text-[9px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5 font-semibold uppercase tracking-wider font-mono self-start mt-0.5">
                                            Report Compiled
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          /* SCROLLABLE PATIENT SEARCH LIST */
                          <div className="flex-1 flex flex-col overflow-hidden">
                            {loadingPatients ? (
                              <div className="flex-1 flex items-center justify-center p-8">
                                <Loader2 className="w-6 h-6 animate-spin text-cherry" />
                              </div>
                            ) : (
                              <div className="flex-1 overflow-y-auto scrollbar-hide divide-y divide-surface-4">
                                {patients.filter(p => 
                                  p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                  p.patient_id.toLowerCase().includes(searchQuery.toLowerCase())
                                ).length === 0 ? (
                                  <div className="p-8 text-center text-ink-faint text-xs font-medium">
                                    No patients matching query.
                                  </div>
                                ) : (
                                  patients
                                    .filter(p => 
                                      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                      p.patient_id.toLowerCase().includes(searchQuery.toLowerCase())
                                    )
                                    .map((p) => (
                                      <div
                                        key={p.patient_id}
                                        onClick={() => handleSelectPatient(p)}
                                        className="p-4 hover:bg-surface-2 transition-all cursor-pointer flex items-center justify-between text-left group"
                                      >
                                        <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                                          <span className="font-semibold text-xs text-ink group-hover:text-[#D20A2E] transition-colors truncate">{p.name}</span>
                                          <div className="flex items-center gap-1.5 text-[10px] text-ink-faint font-mono font-bold">
                                            <span>{p.patient_id}</span>
                                            <span>·</span>
                                            <span className="uppercase">{p.sex[0]}{p.age}</span>
                                          </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-ink-faint group-hover:text-cherry group-hover:translate-x-0.5 transition-all shrink-0" />
                                      </div>
                                    ))
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                    </div>
                  )}
                </div>
              )}

              {/* --- DIAGNOSTICS/WORKSPACE TAB PANEL --- */}
              {rightSidebarTab === "diagnostics" && (
                fileState !== "analyzed" ? (
                  /* INPUT PANEL - Only visible if not analyzed */
                  <div className="p-6 space-y-6 flex flex-col h-full bg-surface-1 overflow-y-auto scrollbar-hide text-left flex-1">
                    <div className="flex flex-col gap-2">
                      <h2 className="font-display text-xl text-ink font-semibold leading-tight">Image Input</h2>
                      <p className="text-sm text-ink-muted">Load a scan to run on-device inference.</p>
                    </div>

                    {selectedPatient && (
                      <GlassCard className="p-3 bg-emerald-50/50 border-emerald-200/60 flex items-center justify-between shrink-0">
                        <div className="flex flex-col text-left">
                          <span className="text-[9px] text-emerald-800 font-bold uppercase font-mono tracking-wider">Active Patient</span>
                          <span className="font-semibold text-xs text-ink truncate max-w-[180px]">{selectedPatient.name}</span>
                        </div>
                        <span className="font-mono text-[9px] font-bold text-cherry">{selectedPatient.patient_id}</span>
                      </GlassCard>
                    )}

                    <button
                      type="button"
                      disabled={fileState === "empty" || fileState === "analyzing"}
                      onClick={handleAnalyze}
                      className={cn(
                        "inline-flex items-center justify-center w-full max-w-sm mx-auto px-8 py-3 text-base font-semibold rounded-full shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#D20A2E]",
                        fileState !== "empty" && fileState !== "analyzing"
                          ? "bg-[#D20A2E] text-white hover:bg-[#B20A27] active:bg-[#8E0820] shadow-md shadow-[#D20A2E]/20"
                          : "bg-[#F6E3E6] text-[#C7A4AF] cursor-not-allowed"
                      )}
                    >
                      {fileState === "analyzing" ? "Running inference…" : "Run inference"}
                    </button>

                    {fileState === "uploaded" && (
                      <SpotlightCard className="p-4 flex flex-col gap-1 shrink-0" glowColor="neutral">
                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span className="text-ink font-medium truncate max-w-[150px]">{rawFile?.name || 'uploaded_image.png'}</span>
                          <span className="text-ink-faint">{rawFile ? `${(rawFile.size / (1024 * 1024)).toFixed(1)} MB` : '1.2 MB'}</span>
                        </div>
                        <div className="text-[12px] font-medium flex items-center gap-1.5 text-emerald-600">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                          Ready to analyze
                        </div>
                      </SpotlightCard>
                    )}

                    <div className="flex-1 border-2 border-dashed border-surface-4 rounded-2xl flex flex-col items-center justify-center p-6 text-center text-ink-faint">
                       <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mb-4 border border-surface-4 shadow-inner">
                          <Settings className="w-6 h-6 text-ink-muted" />
                       </div>
                       <span className="text-xs font-semibold text-ink">Model: {activeScan.model}</span>
                       <p className="text-[10px] mt-1 max-w-[160px] leading-relaxed">INT8-quantized weights resident in Pi 5 memory.</p>
                    </div>
                  </div>
                ) : (
                  /* DIAGNOSTICS RESULTS - Only visible if analyzed */
                  apiResult && (
                    <div className="flex-1 flex flex-col overflow-hidden bg-surface-1">
                      <div className="p-6 border-b border-surface-4 shrink-0 text-left bg-surface-2">
                         <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full bg-[#D20A2E] animate-pulse" />
                            <span className="text-[10px] font-mono font-bold text-[#D20A2E] uppercase tracking-wider">Detection Complete</span>
                         </div>
                         <h2 className="font-display text-3xl font-bold text-ink mb-1">{apiResult.top_label}</h2>
                         <div className="flex items-center gap-4 mt-4">
                            <div className="flex flex-col">
                              <span className="text-[10px] text-ink-faint uppercase font-mono">Confidence</span>
                              <span className="text-lg font-display font-bold text-ink">{Math.round(apiResult.top_probability * 100)}%</span>
                            </div>
                            {apiResult.db_save_status && (
                              <div className="flex flex-col text-left">
                                <span className="text-[10px] text-ink-faint uppercase font-mono">Patient Logging</span>
                                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  Saved to DB
                                </span>
                              </div>
                            )}
                         </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide text-left">
                        {apiResult?.distribution?.length > 0 && (
                          <section>
                            <h3 className="text-xs font-medium tracking-widest uppercase text-muted-foreground mb-4 font-mono text-[10px]">
                              Classification details
                            </h3>
                            <PredictionDistribution distribution={apiResult.distribution} highlightLabel={apiResult.top_label} />
                          </section>
                        )}
                        
                        {/* Segmentation Map Toggles */}
                        {apiResult.segmentation?.available && apiResult.segmentation.classes?.length > 0 && (
                          <div className="space-y-3">
                             <h3 className="font-mono text-[10px] text-ink-faint uppercase tracking-widest">Active Masks</h3>
                             <div className="flex flex-wrap gap-2">
                                {apiResult.segmentation.classes.map((cls: any, i: number) => (
                                   <MaskChip
                                     key={i}
                                     label={formatLabel(cls.label)}
                                     active={!!activeMasks[cls.label]}
                                     onClick={() => setActiveMasks(prev => ({ ...prev, [cls.label]: !prev[cls.label] }))}
                                   />
                                ))}
                             </div>
                          </div>
                        )}

                        <div className="space-y-4 pt-4">
                          <h3 className="font-mono text-[10px] text-ink-faint uppercase tracking-widest">Diagnostic Note</h3>
                          <GlassCard className="p-4 border-surface-4 bg-surface-2">
                             <p className="text-[13px] leading-relaxed text-ink-muted">
                               Top class: <span className="font-medium text-ink">{apiResult.top_label}</span>. Correlate with clinical context before reporting.
                             </p>
                          </GlassCard>
                        </div>
                      </div>

                      <div className="p-4 mt-auto border-t border-surface-4 bg-surface-2">
                         <button 
                           type="button"
                           onClick={() => setRightSidebarTab("copilot")}
                           className="w-full h-11 text-xs flex items-center justify-center bg-white hover:bg-surface-3 border border-surface-4 rounded-xl transition-all font-semibold text-ink shadow-sm"
                         >
                            <Cpu className="w-4 h-4 mr-2 text-cherry" />
                            Consult AI Copilot & Report
                         </button>
                      </div>
                    </div>
                  )
                )
              )}

              {/* --- COPILOT TAB PANEL --- */}
              {rightSidebarTab === "copilot" && fileState === "analyzed" && (
                <div className="flex-1 flex flex-col overflow-hidden text-left">
                  {!reportText && !isGeneratingReport ? (
                    /* Context form input */
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide flex flex-col justify-between h-full">
                      <div className="space-y-6">
                        <div className="space-y-4">
                          <h3 className="font-mono text-[10px] text-ink-faint uppercase tracking-widest">Patient Demographics</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-xs text-ink-muted font-medium">Age</label>
                              <input 
                                type="text"
                                placeholder="e.g. 45"
                                value={patientAge}
                                onChange={(e) => setPatientAge(e.target.value)}
                                className="w-full px-3 py-2 bg-white/70 border border-surface-4 rounded-xl text-sm focus:outline-none focus:border-[#D20A2E] text-ink"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-[#8A5B60] font-medium">Sex</label>
                              <select 
                                value={patientSex}
                                onChange={(e) => setPatientSex(e.target.value)}
                                className="w-full px-3 py-2 bg-white/70 border border-surface-4 rounded-xl text-sm focus:outline-none focus:border-[#D20A2E] text-ink"
                              >
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs text-ink-muted font-medium">Primary Clinical Complaint</label>
                          <textarea 
                            rows={4}
                            placeholder="e.g. Cough, fever, chest pain, trauma details..."
                            value={patientComplaint}
                            onChange={(e) => setPatientComplaint(e.target.value)}
                            className="w-full px-3 py-2 bg-white/70 border border-surface-4 rounded-xl text-sm focus:outline-none focus:border-[#D20A2E] text-ink resize-none"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleGenerateReport}
                        className="w-full inline-flex items-center justify-center h-11 text-xs font-semibold bg-[#D20A2E] text-white hover:bg-[#B20A27] rounded-full shadow-sm transition-colors mt-4 shrink-0"
                      >
                        <Cpu className="w-4 h-4 mr-2" />
                        Generate Clinical Report
                      </button>
                    </div>
                  ) : (
                    /* Structured report text display */
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide border-b border-surface-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="font-mono text-[10px] text-ink-faint uppercase tracking-widest font-bold">Structured Findings</h3>
                            {isGeneratingReport ? (
                              <div className="flex items-center gap-1.5 text-xs text-cherry font-medium animate-pulse">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Compiling...
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button 
                                  type="button"
                                  onClick={() => window.print()}
                                  className="p-1.5 hover:bg-surface-2 rounded-lg text-ink-muted hover:text-ink transition-colors border border-surface-4 bg-white shadow-sm"
                                  title="Print report"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          <GlassCard className="p-4 border-surface-4 bg-white/80 max-h-[620px] overflow-y-auto scrollbar-hide text-left">
                            <div className="space-y-2 select-text font-body text-[13px] leading-relaxed">
                              {renderFormattedText(reportText)}
                            </div>
                          </GlassCard>

                          {!isGeneratingReport && (
                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setReportText("");
                                  setChatMessages([]);
                                }}
                                className="text-[11px] font-semibold text-ink-muted hover:text-cherry transition-colors"
                              >
                                Clear / Reset Case
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
