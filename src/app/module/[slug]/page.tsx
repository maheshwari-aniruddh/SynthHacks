"use client";

/** RadPi Diagnostic Module Page - Build Trigger 1 **/
import { useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, UploadCloud, Brain, Wind, Bone, Smile, ScanFace, Eye,
  Wifi, Activity, FileText, ZoomIn, ZoomOut, Download, Loader2, Settings
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GlassCard } from "@/components/ui/glass-card";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { cn } from "@/lib/utils";
import { teachingApi, API_BASE_URL } from "@/lib/teaching-api";

const MODULES = [
  { slug: "brain", name: "Brain", icon: Brain },
  { slug: "chest", name: "Chest", icon: Wind },
  { slug: "fracture", name: "Fracture", icon: Bone },
  { slug: "dental", name: "Dental", icon: Smile },
  { slug: "skin", name: "Dermatology", icon: ScanFace },
  { slug: "cataract", name: "Cataract", icon: Eye },
];

const DEMO_SCANS: Record<string, any> = {
  brain: { img: "https://images.unsplash.com/photo-1559757175-0eb30cd8c063?w=1200&q=80", type: "Brain MRI", model: "EfficientNetB3 + U-Net" },
  chest: { img: "https://images.unsplash.com/photo-1530026405186-ed1f139313f8?w=1200&q=80", type: "Chest X-Ray", model: "DenseNet-121" },
  fracture: { img: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=1200&q=80", type: "Radiograph", model: "YOLOv8m-Seg + ViT" },
  dental: { img: "https://images.unsplash.com/photo-1607990281513-2c110a25bd8c?w=1200&q=80", title: "Panorex_Full.png", size: "3.5 MB", type: "Panorex", model: "YOLOv8 instance" },
  skin: { img: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=1200&q=80", title: "Lesion_Derm.jpg", size: "1.2 MB", type: "Dermoscopy", model: "EfficientNetV2-S" },
  cataract: { img: "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=1200&q=80", title: "Fundus_Left.png", size: "2.8 MB", type: "Fundus", model: "MobileNetV3-Small" },
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
interface PredictionDistributionProps { distribution: DistributionItem[]; }

export function PredictionDistribution({ distribution }: PredictionDistributionProps) {
  if (!distribution?.length) return null;
  const sorted = [...distribution].sort((a, b) => b.probability - a.probability);
  const top = sorted[0].label;

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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeScan = DEMO_SCANS[slug] || DEMO_SCANS.brain;
  const displayImage = previewUrl || activeScan.img;

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setRawFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setFileState("uploaded");
    }
  };

  const handleAnalyze = async () => {
    if (fileState === "uploaded" && rawFile) {
      setFileState("analyzing");
      
      try {
        const slugMap: Record<string, any> = {
          brain: teachingApi.predictBrainMRI,
          chest: teachingApi.predictChestXray,
          fracture: teachingApi.predictBoneFracture,
          dental: teachingApi.predictDental,
          skin: teachingApi.predictDermatology,
          cataract: teachingApi.predictCataract,
        };

        const predictFn = slugMap[slug] || teachingApi.predictBrainMRI;
        const result = await predictFn(rawFile);
        
        setApiResult(result);
        
        if (result.segmentation?.available && result.segmentation.type === "mask") {
           const initialMasks: Record<string, boolean> = {};
           result.segmentation.classes.forEach((c: any) => initialMasks[c.label] = true);
           setActiveMasks(initialMasks);
        }

        setFileState("analyzed");
        setActiveTab(result.segmentation?.available ? "analysis" : (result.explanation?.available ? "gradcam" : "original"));
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
            <button onClick={() => router.push("/")} className="h-9 px-4 text-xs flex items-center hover:bg-surface-2 rounded-lg transition-colors">
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
                {fileState !== "empty" ? `${activeScan.title || 'scan_result.png'} · 512×512 · ${activeScan.type}` : "No scan loaded"}
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
                    onClick={() => { /* viewer zoom not wired in demo */ }}
                    className="p-1.5 hover:bg-white rounded text-ink-muted hover:text-ink transition-all"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Zoom in"
                    onClick={() => { /* viewer zoom not wired in demo */ }}
                    className="p-1.5 hover:bg-white rounded text-ink-muted hover:text-ink transition-all"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  aria-label="Download scan"
                  onClick={() => { /* viewer export not wired in demo */ }}
                  className="w-8 h-8 flex items-center justify-center bg-surface-2 border border-surface-4 rounded-lg text-ink-muted hover:bg-white hover:text-ink transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* IMAGE AREA */}
            <div className="flex-1 relative flex items-center justify-center p-8 overflow-hidden bg-surface-3 shadow-inner">
              <AnimatePresence mode="wait">
                {fileState === "empty" ? (
                  <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center">
                    <img src="/logo.png" alt="radpi logo" className="h-10 w-auto object-contain mb-8 opacity-20 grayscale" />
                    <div
                      className="min-h-[220px] w-80 flex flex-col items-center justify-center px-6 py-8 text-center border-2 border-dashed border-ink/10 rounded-3xl cursor-pointer hover:border-ink/20 transition-all bg-white/40"
                      onClick={handleUploadClick}
                    >
                      <UploadCloud className="w-10 h-10 text-ink/20 mb-3" />
                      <h3 className="font-display text-lg text-ink/40">Drop your scan here</h3>
                      <p className="font-mono text-[10px] text-ink/20 uppercase tracking-widest mt-2">PNG · JPG · DICOM</p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="loaded" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="relative max-w-full max-h-full flex items-center justify-center">
                    <div className="p-2 bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-surface-4 overflow-hidden relative">
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
          <aside className="w-[320px] shrink-0 flex flex-col bg-surface-1 h-full overflow-hidden">
            
            {/* INPUT PANEL - Only visible if not analyzed */}
            {fileState !== "analyzed" && (
              <div className="p-6 space-y-6 flex flex-col h-full bg-surface-1">
                <div className="flex flex-col gap-2">
                  <h2 className="font-display text-xl text-ink font-semibold leading-tight">Image Input</h2>
                  <p className="text-sm text-ink-muted">Load a scan to run on-device inference.</p>
                </div>

                <button
                  type="button"
                  disabled={fileState === "empty" || fileState === "analyzing"}
                  onClick={handleAnalyze}
                  className={[
                    "inline-flex items-center justify-center w-full max-w-sm mx-auto px-8 py-3 text-base font-semibold rounded-full shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#D20A2E]",
                    fileState !== "empty" && fileState !== "analyzing"
                      ? "bg-[#D20A2E] text-white hover:bg-[#B20A27] active:bg-[#8E0820]"
                      : "bg-[#F6E3E6] text-[#C7A4AF] cursor-not-allowed"
                  ].join(" ")}
                >
                  {fileState === "analyzing" ? "Running…" : "Run inference"}
                </button>

                {fileState === "uploaded" && (
                  <SpotlightCard className="p-4 flex flex-col gap-1 shrink-0" glowColor="neutral">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="text-ink font-medium truncate max-w-[150px]">{activeScan.title || 'uploaded_image.png'}</span>
                      <span className="text-ink-faint">{activeScan.size || '1.2 MB'}</span>
                    </div>
                    <div className="text-[12px] font-medium flex items-center gap-1.5 text-emerald-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                      Ready to analyze
                    </div>
                  </SpotlightCard>
                )}

                <div className="flex-1 border-2 border-dashed border-surface-4 rounded-2xl flex flex-col items-center justify-center p-6 text-center text-ink-faint">
                   <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mb-4">
                      <Settings className="w-6 h-6" />
                   </div>
                   <span className="text-xs font-medium">Model: {activeScan.model}</span>
                   <p className="text-[10px] mt-1 max-w-[160px]">INT8-quantized weights resident in Pi 5 memory.</p>
                </div>
              </div>
            )}

            {/* RESULTS PANEL - Only visible if analyzed */}
            {fileState === "analyzed" && apiResult && (
              <div className="flex-1 flex flex-col overflow-hidden bg-surface-1">
                <div className="p-6 border-b border-surface-4 shrink-0">
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
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
                  {apiResult?.distribution?.length > 0 && (
                    <section className="mt-6">
                      <h3 className="text-xs font-medium tracking-widest uppercase text-muted-foreground mb-4">
                        Classification details
                      </h3>
                      <PredictionDistribution distribution={apiResult.distribution} />
                    </section>
                  )}
                  
                  {/* Segmentation Map Toggles */}
                  {apiResult.segmentation?.available && apiResult.segmentation.type === "mask" && (
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

                <div className="p-4 mt-auto">
                   <button className="w-full h-11 text-xs flex items-center justify-center bg-surface-2 hover:bg-surface-3 border border-surface-4 rounded-lg transition-colors">
                      <FileText className="w-4 h-4 mr-2" />
                      Export DICOM Report
                   </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
