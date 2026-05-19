"use client";

import { useState, useRef, useCallback, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Brain, Wind, Eye, Activity as TbIcon, ScanFace, Bone,
  Upload, MousePointer2, Pencil, Trash2, CheckCircle2, XCircle, Activity, ChevronRight, Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AnnotationCanvas, BoundingBox } from "@/components/ui/annotation-canvas";
import { cn } from "@/lib/utils";
import { teachingApi } from "@/lib/teaching-api";

// --- MODULE CONFIGURATION ---
const MODULE_CONFIGS: Record<string, {
  name: string;
  icon: any;
  description: string;
  diagnoses: string[];
  taskModes: ("classification" | "segmentation")[];
  labels: string[];
  explanations: Record<string, string>;
}> = {
  brain: {
    name: "Brain MRI",
    icon: Brain,
    description: "Analyze neuroimaging for tumors and hemorrhages.",
    diagnoses: ["Normal", "Glioma", "Meningioma", "Pituitary Tumor", "Hemorrhage"],
    taskModes: ["classification", "segmentation"],
    labels: ["Tumor ROI", "Hemorrhage Site", "Edema"],
    explanations: {
      "Glioma": "Infiltrative mass with varying enhancement and perilesional edema typical of glial cell origin tumors.",
      "Normal": "No significant intracranial abnormalities, midline shift, or mass effect visualized.",
      "Meningioma": "Extra-axial, dural-based mass with strong, uniform enhancement and 'dural tail' sign."
    }
  },
  chest: {
    name: "Chest X-Ray",
    icon: Wind,
    description: "Screen for pneumonia, pneumothorax, and cardiomegaly.",
    diagnoses: ["Normal", "Pneumonia", "Effusion", "Pneumothorax", "Cardiomegaly"],
    taskModes: ["classification", "segmentation"],
    labels: ["Infiltration", "Pleural Space", "Heart Contour"],
    explanations: {
      "Pneumonia": "Consolidation or patchy opacities visualized, consistent with alveolar inflammatory process.",
      "Pneumothorax": "Visible visceral pleural line with absence of lung markings peripherally.",
      "Normal": "Clear lung fields, normal cardiothoracic ratio, and intact costophrenic angles."
    }
  },
  dr: {
    name: "Diabetic Retinopathy",
    icon: Eye,
    description: "Grade fundus images for diabetic complications.",
    diagnoses: ["No DR", "Mild NPDR", "Moderate NPDR", "Severe NPDR", "PDR"],
    taskModes: ["classification"],
    labels: ["Microaneurysm", "Exudate", "Hemorrhage"],
    explanations: {
      "No DR": "Clear retina with no visible microaneurysms or hemorrhages.",
      "Severe NPDR": "Extensive intraretinal hemorrhages and venous beading in multiple quadrants.",
      "PDR": "Evidence of neovascularization, indicating advanced proliferative stage."
    }
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
      "Negative": "No evidence of active pulmonary tuberculosis or significant hilar lymphadenopathy."
    }
  },
  skin: {
    name: "Skin Lesion",
    icon: ScanFace,
    description: "Classify dermatological lesions for malignancy.",
    diagnoses: ["Benign Nevus", "Melanoma", "BCC", "SCC", "Actinic Keratosis"],
    taskModes: ["classification"],
    labels: ["Lesion Border", "Atypical Region"],
    explanations: {
      "Melanoma": "Asymmetrical lesion with irregular borders, color variegation, and diameter >6mm.",
      "Benign Nevus": "Symmetrical lesion with regular borders and uniform pigmentation."
    }
  },
  bone: {
    name: "Pediatric Bone",
    icon: Bone,
    description: "Analyze pediatric radiographs for growth and fractures.",
    diagnoses: ["Normal Growth", "Simple Fracture", "Buckle Fracture", "Epiphyseal Injury"],
    taskModes: ["classification", "segmentation"],
    labels: ["Fracture Line", "Physis", "Abnormality"],
    explanations: {
      "Buckle Fracture": "Cortical bulging typical of pediatric greenstick/incomplete fracture patterns.",
      "Normal Growth": "Physeal plates are open and appear appropriate for developmental age."
    }
  }
};

export default function TeachWorkflowPage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const slug = resolvedParams.slug || "brain";
  
  const config = MODULE_CONFIGS[slug] || MODULE_CONFIGS.brain;

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
  const [modelPrediction, setModelPrediction] = useState<{
    diagnosis: string;
    confidence: number;
    explanation: string;
    isCorrect: boolean;
    modelBoxes: BoundingBox[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);

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
      setRawFile(file);
      const url = URL.createObjectURL(file);
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
  };

  const handleBoxDrawn = useCallback((newBox: Omit<BoundingBox, "id" | "source">) => {
    const box: BoundingBox = {
      ...newBox,
      id: Math.random().toString(36).substring(7),
      source: "user",
      label: config.labels[0] || "User ROI"
    };
    setAnnotations(prev => [...prev, box]);
  }, [config.labels]);

  const handleBoxMove = useCallback((id: string, x: number, y: number) => {
    setAnnotations(prev => prev.map(b => b.id === id ? { ...b, x, y } : b));
  }, []);

  const handleCheckAnswer = async () => {
    if (!rawFile) return;
    setIsChecking(true);

    try {
      // Map frontend slug to backend endpoint
      const slugMap: Record<string, any> = {
        brain: teachingApi.predictBrainMRI,
        chest: teachingApi.predictChestXray,
        bone: teachingApi.predictBoneFracture,
        dental: teachingApi.predictDental,
        skin: teachingApi.predictDermatology,
        dr: teachingApi.predictFundus,
        tb: teachingApi.predictTB,
      };

      const predictFn = slugMap[slug] || teachingApi.predictBrainMRI;
      const apiResponse = await predictFn(rawFile);

      const isCorrect = userDiagnosis === apiResponse.prediction;
      
      const modelBoxes: BoundingBox[] = (apiResponse.detections || []).map((d: any, i: number) => ({
        id: `model-${i}`,
        source: "model" as const,
        label: d.label,
        x: d.bbox[0],
        y: d.bbox[1],
        width: d.bbox[2] - d.bbox[0],
        height: d.bbox[3] - d.bbox[1],
        confidence: Math.round(d.confidence * 100)
      }));

      setModelPrediction({
        diagnosis: apiResponse.prediction,
        confidence: Math.round(apiResponse.confidence * 100),
        explanation: apiResponse.explanation || config.explanations[apiResponse.prediction] || "Model analysis complete.",
        isCorrect,
        modelBoxes
      });

      setIsChecking(false);
      setHasChecked(true);
    } catch (error) {
      console.error("Inference Error:", error);
      alert("Failed to run on-device inference. Check backend status.");
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
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-teach-text-muted group-hover:text-teach-text-primary transition-colors">Exit Session</span>
          </button>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-teach-accent-deep/50 flex items-center justify-center border border-teach-accent-bright/20 shadow-lg shadow-teach-accent-bright/5">
              <config.icon className="w-6 h-6 text-teach-accent-bright" />
            </div>
            <div>
              <h2 className="font-bold text-xl text-teach-text-primary leading-tight">{config.name}</h2>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-teach-accent-bright animate-pulse" />
                <span className="text-[10px] font-mono text-teach-accent-bright uppercase tracking-widest">Training Active</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
          
          {/* Step 1: Mode & Upload */}
          <div className="space-y-6">
             <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-teach-text-muted">Clinical Workflow</h3>
                {config.taskModes.length > 1 && (
                  <div className="flex p-1 bg-teach-bg rounded-lg border border-teach-border shadow-inner scale-90">
                    <button
                      onClick={() => { setTaskMode("classification"); resetState(); }}
                      title="Classification — pick a diagnosis"
                      aria-label="Classification mode"
                      className={cn("px-3 py-1 text-[10px] font-bold rounded-md transition-all", taskMode === "classification" ? "bg-teach-accent-bright text-teach-bg shadow-sm" : "text-teach-text-muted hover:text-teach-text-primary")}
                    >
                      DIAG
                    </button>
                    <button
                      onClick={() => { setTaskMode("segmentation"); resetState(); }}
                      title="Segmentation — draw regions of interest"
                      aria-label="Segmentation mode"
                      className={cn("px-3 py-1 text-[10px] font-bold rounded-md transition-all", taskMode === "segmentation" ? "bg-teach-accent-bright text-teach-bg shadow-sm" : "text-teach-text-muted hover:text-teach-text-primary")}
                    >
                      ROI
                    </button>
                  </div>
                )}
             </div>

             <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
             <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-6 rounded-2xl border-2 border-dashed border-teach-border flex flex-col items-center justify-center gap-3 hover:bg-teach-card/40 hover:border-teach-accent-bright/30 transition-all duration-300 bg-teach-bg group"
             >
                <div className="w-10 h-10 rounded-full bg-teach-bg-elevated flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Upload className="w-4 h-4 text-teach-text-secondary" />
                </div>
                <div className="text-center">
                  <span className="block text-xs font-bold text-teach-text-primary mb-1">{imageSrc ? "Replace Scan" : "Load Clinical Case"}</span>
                  <span className="block text-[10px] text-teach-text-muted">DICOM / JPG / PNG</span>
                </div>
             </button>
          </div>

          {/* Step 2: Assessment */}
          {imageSrc && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-teach-text-muted">Blind Assessment</h3>
              
              {taskMode === "classification" ? (
                <div className="grid grid-cols-1 gap-2.5">
                  {config.diagnoses.map(opt => (
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
                      <ChevronRight className={cn("w-4 h-4 transition-transform", userDiagnosis === opt ? "translate-x-0" : "opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0")} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 bg-teach-bg rounded-2xl border border-teach-border flex flex-col gap-4 shadow-inner">
                   <div className="flex bg-teach-bg-elevated rounded-xl p-1.5 border border-teach-border shadow-inner">
                      <button 
                        onClick={() => setTool("draw")} 
                        disabled={hasChecked} 
                        className={cn("flex-1 py-2 rounded-lg flex justify-center transition-all", tool === "draw" ? "bg-teach-accent-bright text-teach-bg shadow-md" : "text-teach-text-muted hover:text-teach-text-primary")}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setTool("select")} 
                        disabled={hasChecked} 
                        className={cn("flex-1 py-2 rounded-lg flex justify-center transition-all", tool === "select" ? "bg-teach-accent-bright text-teach-bg shadow-md" : "text-teach-text-muted hover:text-teach-text-primary")}
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
                   <><Activity className="w-5 h-5 animate-spin" /> Running Inference...</>
                 ) : (
                   <>Check clinical answer</>
                 )}
               </button>
            </div>
          )}

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
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-teach-text-muted">Workspace Canvas</span>
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
               <button onClick={resetState} className="w-10 h-10 rounded-full bg-teach-bg-elevated border border-teach-border flex items-center justify-center hover:bg-teach-accent-bright hover:text-teach-bg transition-all group">
                 <Trash2 className="w-4 h-4 text-teach-text-muted group-hover:text-teach-bg" />
               </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar pb-24">
               
               {/* Match Status Card */}
               <div className={cn(
                 "p-8 rounded-[2rem] flex flex-col items-center text-center border relative overflow-hidden group",
                 modelPrediction.isCorrect 
                   ? "bg-emerald-500/5 border-emerald-500/20 shadow-[0_20px_40px_rgba(16,185,129,0.05)]" 
                   : "bg-rose-500/5 border-rose-500/20 shadow-[0_20px_40px_rgba(244,63,94,0.05)]"
               )}>
                 <div className={cn(
                   "w-20 h-20 rounded-full flex items-center justify-center mb-6 relative z-10",
                   modelPrediction.isCorrect ? "bg-emerald-500 text-teach-bg" : "bg-rose-500 text-teach-bg"
                 )}>
                   {modelPrediction.isCorrect ? (
                     <CheckCircle2 className="w-10 h-10" />
                   ) : (
                     <XCircle className="w-10 h-10" />
                   )}
                 </div>
                 <h4 className={cn("text-2xl font-bold mb-2 relative z-10", modelPrediction.isCorrect ? "text-emerald-400" : "text-rose-400")}>
                   {modelPrediction.isCorrect ? "Clinical Agreement" : "Review Discrepancy"}
                 </h4>
                 <p className={cn("text-sm leading-relaxed relative z-10 max-w-xs", modelPrediction.isCorrect ? "text-emerald-500/70" : "text-rose-500/70")}>
                   {modelPrediction.isCorrect
                    ? "Your read matches the model's top class."
                    : "The model converged on a different class. Compare findings below."}
                 </p>
                 
                 {/* Decorative background circle */}
                 <div className={cn(
                   "absolute -bottom-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-20",
                   modelPrediction.isCorrect ? "bg-emerald-500" : "bg-rose-500"
                 )} />
               </div>

               {/* Comparison Grid */}
               <div className="space-y-4">
                 <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-teach-text-muted">Inference Comparison</h4>
                 
                 <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 bg-teach-bg rounded-[1.5rem] border border-teach-border shadow-inner group">
                       <span className="text-[10px] font-mono uppercase text-teach-text-muted mb-2 block group-hover:text-teach-text-secondary transition-colors">Your Answer</span>
                       <span className="font-bold text-base text-teach-text-primary block leading-tight">
                         {taskMode === "classification" ? (userDiagnosis || "Unlabeled") : `${annotations.length} ROI Selection`}
                       </span>
                    </div>
                    <div className="p-6 bg-teach-accent-deep/20 rounded-[1.5rem] border border-teach-accent-bright/20 shadow-lg ring-1 ring-teach-accent-bright/10">
                       <span className="text-[10px] font-mono uppercase text-teach-accent-bright/60 mb-2 block">RadPi AI</span>
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
                          <span className="text-[10px] text-teach-accent-bright font-bold">{modelPrediction.confidence}%</span>
                       </div>
                    </div>
                 </div>
               </div>

               {/* Explanation Section */}
               <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-teach-text-muted">Clinical Findings</h4>
                    <span className="text-[9px] bg-teach-bg border border-teach-border px-2 py-0.5 rounded text-teach-text-muted">EXPLANATION</span>
                  </div>
                  <div className="p-6 bg-teach-bg/60 rounded-[1.5rem] border border-teach-border shadow-inner relative group">
                    <p className="text-sm text-teach-text-secondary leading-relaxed italic">
                      "{modelPrediction.explanation}"
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

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(56, 189, 248, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(56, 189, 248, 0.2);
        }
      `}</style>

    </div>
  );
}
