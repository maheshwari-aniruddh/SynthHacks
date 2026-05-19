"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, Wind, Bone, Smile, ScanFace, Eye, ArrowRight, GraduationCap } from "lucide-react";
import StackedPanels from "@/components/ui/stacked-panels";
import { FlowHoverButton } from "@/components/ui/flow-hover-button";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { GlassCard } from "@/components/ui/glass-card";

const MODULES = [
  { slug: "brain",    name: "Brain MRI",      desc: "4-class tumor classification: glioma, meningioma, pituitary, none.",    icon: Brain,    arch: "YOLOv8n",       size: "14 MB", latency: "<1 s" },
  { slug: "chest",    name: "Chest X-Ray",    desc: "18-pathology screen including pneumonia, effusion, cardiomegaly.",      icon: Wind,     arch: "DenseNet-121",  size: "30 MB", latency: "1–2 s" },
  { slug: "fracture", name: "Bone Fracture",  desc: "Wrist & long-bone fracture localization on the GRAZPEDWRI-DX dataset.", icon: Bone,     arch: "YOLOv8n",       size: "12 MB", latency: "3–10 fps" },
  { slug: "dental",   name: "Dental Panorex", desc: "Caries, impacted teeth, periapical lesion detection (DENTEX).",         icon: Smile,    arch: "YOLOv8n",       size: "6 MB",  latency: "<1 s" },
  { slug: "skin",     name: "Dermatology",    desc: "Lesion classification trained on HAM10000 / ISIC.",                     icon: ScanFace, arch: "MobileNetV2",   size: "9.2 MB", latency: "~150 ms" },
  { slug: "cataract", name: "Fundus Imaging", desc: "5-class diabetic retinopathy grading on APTOS-2019.",                   icon: Eye,      arch: "EfficientNet-B0", size: "20 MB", latency: "~0.5–1 s" },
];

export default function Home() {
  const router = useRouter();
  const [activities, setActivities] = useState<string[]>([]);

  useEffect(() => {
    const stored = sessionStorage.getItem("radpi_activity");
    if (stored) {
      setActivities(JSON.parse(stored));
    }
  }, []);

  return (
    <div className="relative min-h-screen bg-diag-bg selection:bg-diag-primary/20 selection:text-diag-primary flex flex-col font-body text-diag-body">
      {/* Noise Texture */}
      <div 
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.025]"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")" }}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-8 lg:px-12 flex flex-col z-10 relative pb-24">
        {/* HERO SECTION */}
        <section className="flex flex-col lg:flex-row min-h-[85vh] py-12 items-center">
          
          {/* Left Column */}
          <div className="w-full lg:w-1/2 flex flex-col justify-center pr-0 lg:pr-12 mt-12 lg:mt-0">
            {/* Logo */}
            <img src="/logo.png" alt="radpi logo" className="h-24 w-auto mb-12 object-contain" />

            <h1 className="font-display text-[48px] leading-[1.1] text-diag-heading mb-6">
              Diagnostic Intelligence, <br/>At the Point of Care
            </h1>
            
            <p className="font-body text-diag-body text-[16px] leading-relaxed max-w-lg mb-10">
              Six imaging modalities, INT8-quantized and benchmarked on Raspberry Pi 5. CPU-only inference, no cloud, no data leaves the room.
            </p>

            {/* Stat Pills */}
            <div className="flex flex-wrap gap-3 mb-12">
              {[
                { label: 'Pi 5 · 8 GB · ARM Cortex-A76',  color: 'diag-primary' },
                { label: 'INT8 ONNX + TFLite',            color: 'diag-secondary' },
                { label: '100–300 ms · MobileNet-class',  color: 'diag-primary' },
              ].map((stat, i) => (
                <GlassCard key={i} className={`!rounded-full px-4 py-1.5 border-${stat.color}/20 text-${stat.color} !bg-white/60`}>
                  <span className="text-[12px] font-mono tracking-tight">{stat.label}</span>
                </GlassCard>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row flex-wrap gap-4">
              <button 
                onClick={() => {
                  const el = document.getElementById("modules-section");
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="bg-diag-primary text-white px-8 py-3.5 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-diag-primary-hover transition-colors shadow-sm"
              >
                Explore Modules <ArrowRight className="w-4 h-4" />
              </button>

              <button 
                onClick={() => router.push("/teach")}
                className="bg-white text-diag-heading border border-diag-border px-8 py-3.5 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-diag-card transition-colors shadow-sm"
              >
                <GraduationCap className="w-4 h-4" />
                Open Teaching Mode
              </button>
            </div>
          </div>

          {/* Right Column */}
          <div className="w-full lg:w-1/2 h-[500px] lg:h-[800px] relative flex flex-col items-center justify-center">
            <div className="absolute inset-0">
              <StackedPanels />
            </div>
            <div className="absolute bottom-8 lg:bottom-12 font-mono text-[11px] text-diag-muted uppercase tracking-wider">
              Move cursor to interact
            </div>
          </div>
        </section>

        {/* MODULES SECTION */}
        <section id="modules-section" className="w-full pt-12">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-diag-muted mb-8 px-2">Modules</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {MODULES.map((mod) => (
              <SpotlightCard 
                key={mod.slug}
                onClick={() => router.push(`/module/${mod.slug}`)}
                className="group cursor-pointer p-6 transition-all duration-300 hover:-translate-y-[4px] hover:shadow-xl hover:border-diag-primary/30 flex flex-col h-full !bg-white/40"
                glowColor="diag-primary"
              >
                <div className="mb-6">
                  <mod.icon className="w-7 h-7 text-diag-primary" strokeWidth={1.5} />
                </div>
                
                <h3 className="font-display text-[20px] text-diag-heading mb-2 group-hover:text-diag-primary transition-colors">{mod.name}</h3>
                <p className="font-body text-[13px] text-diag-body leading-relaxed line-clamp-2 mb-5">
                  {mod.desc}
                </p>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-diag-muted uppercase tracking-wider mb-6">
                  <span>{mod.arch}</span>
                  <span className="w-1 h-1 rounded-full bg-diag-muted/60" />
                  <span>{mod.size}</span>
                  <span className="w-1 h-1 rounded-full bg-diag-muted/60" />
                  <span>{mod.latency}</span>
                </div>

                <div className="flex items-center text-diag-primary font-body text-[13px] font-medium mt-auto">
                  Open module
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform duration-150 group-hover:translate-x-1" />
                </div>
              </SpotlightCard>
            ))}
          </div>
        </section>
      </main>

      {/* RECENT ACTIVITY STRIP */}
      <GlassCard className="w-full border-t border-x-0 border-b-0 rounded-none py-4 px-8 z-10 relative mt-auto !bg-white/20">
        <div className="max-w-7xl mx-auto flex items-center gap-6">
          <span className="font-mono text-[10px] uppercase tracking-widest text-diag-muted whitespace-nowrap">
            Recent Activity
          </span>
          <div className="flex flex-wrap gap-3 overflow-hidden">
            {activities.length > 0 ? (
              activities.slice(0, 3).map((act, i) => (
                <SpotlightCard key={i} className="!rounded-full px-4 py-1.5 border-white/40 !bg-white/40 flex items-center gap-2" glowColor="neutral">
                  <span className="text-[12px] text-diag-body">{act.split('|')[0]}</span>
                  <span className="w-1 h-1 bg-diag-heading/10 rounded-full" />
                  <span className="text-diag-primary font-medium text-[12px]">{act.split('|')[1]}</span>
                  <span className="w-1 h-1 bg-diag-heading/10 rounded-full" />
                  <span className="font-mono text-[11px] text-diag-muted">{act.split('|')[2]}</span>
                </SpotlightCard>
              ))
            ) : (
              <span className="italic font-body text-[13px] text-diag-muted">No scans this session yet</span>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
