"use client";

import { useRouter } from "next/navigation";
import { 
  ArrowLeft, ArrowRight, Upload, Edit3, Activity, Shield, Stethoscope, GraduationCap,
  Wind, Flame, Droplet, Activity as TbIcon, Bone
} from "lucide-react";
import StackedPanels from "@/components/ui/stacked-panels";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { motion } from "motion/react";
import React from "react";

const TEACH_MODULES = [
  { 
    slug: "chest_xray", 
    name: "Chest X-Ray", 
    desc: "Pathology identification across pulmonary radiographs.",
    icon: Wind 
  },
  { 
    slug: "bone_fracture", 
    name: "Bone Fracture", 
    desc: "Growth analysis and bone fracture/abnormality detection.",
    icon: Bone 
  },
  { 
    slug: "wound_burn", 
    name: "Wound & Burn Care", 
    desc: "Acute wound infection classification and burn-depth grading.",
    icon: Flame 
  },
  { 
    slug: "tb", 
    name: "Tuberculosis", 
    desc: "Specific TB detection and screening workflow.",
    icon: TbIcon 
  },
  { 
    slug: "malaria", 
    name: "Malaria Screening", 
    desc: "Giemsa-stained thin blood smear cell screening.",
    icon: Droplet 
  },
];

export default function TeachLanding() {
  const router = useRouter();

  return (
    <div className="relative min-h-screen bg-teach-bg text-teach-text-primary selection:bg-teach-accent-bright/20 selection:text-teach-accent-bright flex flex-col font-sans overflow-x-hidden">
      
      {/* Header with Logo */}
      <header className="fixed top-0 left-0 right-0 w-full z-50 bg-teach-bg/80 backdrop-blur-md border-b border-teach-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-4 flex items-center justify-between">
          <div className="cursor-pointer group flex items-center gap-4" onClick={() => router.push("/")}>
            <div className="w-8 h-8 rounded-lg bg-teach-bg-elevated flex items-center justify-center border border-teach-border group-hover:bg-teach-card transition-colors">
              <ArrowLeft className="w-4 h-4 text-teach-text-secondary" />
            </div>
            <img src="/logo.png" alt="radpi logo" className="h-24 w-auto object-contain brightness-0 opacity-70" />
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-teach-accent-deep/30 rounded-full text-[11px] font-bold tracking-wider uppercase border border-teach-accent-bright/20 shadow-sm text-teach-accent-bright">
            <GraduationCap className="w-3.5 h-3.5" />
            Training Environment
          </div>
        </div>
      </header>

      <main className="flex-1 w-full flex flex-col pt-16">
        
        {/* Hero Section - Split Layout */}
        <section 
          className="relative w-full max-w-7xl mx-auto px-6 lg:px-12 pt-20 lg:pt-32 pb-12 flex flex-col lg:flex-row items-center gap-16 lg:gap-24 overflow-hidden"
        >
          {/* Left Side: Content */}
          <div className="relative z-10 w-full lg:w-3/5 text-left flex flex-col items-start pointer-events-none">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-teach-accent-bright/10 rounded-lg text-[10px] font-mono font-bold tracking-[0.2em] uppercase text-teach-accent-bright mb-8 border border-teach-accent-bright/20 animate-in fade-in slide-in-from-bottom-4 duration-700 pointer-events-auto">
              Diagnostic Intelligence Training
            </div>
            
            <h1 className="text-4xl md:text-7xl font-bold tracking-tight text-teach-text-primary leading-[1.1] mb-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100 pointer-events-auto">
              Refine Your Clinical <br/><span className="text-teach-accent-bright">Diagnostic Intuition</span>
            </h1>

            <p className="text-lg md:text-xl text-teach-text-secondary leading-relaxed max-w-2xl mb-12 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 pointer-events-auto">
              Practice scan interpretation across five key emergency modules, then compare against the same on-device models RadPi deploys clinically. Read first, reveal second.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 pointer-events-auto">
              <button 
                onClick={() => {
                  const el = document.getElementById("modality-selection");
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="w-full sm:w-auto bg-teach-accent-bright text-teach-bg px-10 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                Start Training Now
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Right Side: Moving Files Card Deck */}
          <div className="w-full lg:w-2/5 h-[500px] lg:h-[700px] relative flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-1000 delay-200">
            <div className="absolute inset-0">
              <StackedPanels />
            </div>
            <div className="absolute bottom-0 font-mono text-[11px] text-teach-text-muted uppercase tracking-wider">
              Move cursor to interact
            </div>
          </div>
        </section>

        {/* Modality Selection */}
        <section id="modality-selection" className="w-full max-w-7xl mx-auto px-6 lg:px-12 py-24 scroll-mt-20">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-teach-accent-bright mb-4">Modality Selection</h2>
              <p className="text-3xl font-bold text-teach-text-primary">Choose a training path</p>
            </div>
            <p className="text-teach-text-secondary max-w-sm text-sm">
              Each module offers a complete workflow including region annotation, classification, and AI-assisted feedback.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {TEACH_MODULES.map((mod, i) => (
              <SpotlightCard 
                key={mod.slug}
                glowColor="teach-accent-bright"
                onClick={() => router.push(`/teach/${mod.slug}`)}
                className="group cursor-pointer p-8 transition-all duration-500 hover:-translate-y-1 !bg-teach-card/40 !border-teach-border hover:!border-teach-accent-bright/30"
              >
                <div className="mb-6 flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-teach-bg-elevated flex items-center justify-center border border-teach-border group-hover:bg-teach-accent-bright/10 group-hover:border-teach-accent-bright/20 transition-all duration-500">
                    <mod.icon className="w-6 h-6 text-teach-text-secondary group-hover:text-teach-accent-bright transition-colors" />
                  </div>
                  <div className="w-8 h-8 rounded-full bg-teach-bg-elevated flex items-center justify-center border border-teach-border group-hover:bg-teach-accent-bright group-hover:border-transparent transition-all duration-500 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0">
                    <ArrowRight className="w-4 h-4 text-teach-bg" />
                  </div>
                </div>
                
                <h3 className="text-xl font-bold text-teach-text-primary mb-3 group-hover:text-teach-accent-bright transition-colors">
                  {mod.name}
                </h3>
                <p className="text-sm text-teach-text-secondary leading-relaxed">
                  {mod.desc}
                </p>
              </SpotlightCard>
            ))}
          </div>
        </section>

        {/* Training Methodology */}
        <section className="bg-teach-bg-elevated/50 border-y border-teach-border w-full">
          <div className="max-w-7xl mx-auto px-6 lg:px-12 py-24">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-teach-text-muted mb-12 text-center">The Training Workflow</h2>
            
            <div className="grid md:grid-cols-3 gap-12">
               {[
                 {
                   title: "1. Blind Assessment",
                   icon: Upload,
                   text: "Annotate regions of interest and commit to a primary diagnosis before any AI output is shown."
                 },
                 {
                   title: "2. AI Comparison",
                   icon: Activity,
                   text: "Run the on-device model and view its predicted class and confidence beside your own."
                 },
                 {
                   title: "3. Knowledge Loop",
                   icon: Edit3,
                   text: "Read the model's findings and the visual features that drove them. Recalibrate."
                 }
               ].map((step, i) => (
                 <div key={i} className="flex flex-col items-center text-center space-y-4">
                    <div className="w-16 h-16 rounded-3xl bg-teach-bg flex items-center justify-center border border-teach-border mb-4 text-teach-accent-bright">
                       <step.icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold text-teach-text-primary">{step.title}</h3>
                    <p className="text-sm text-teach-text-secondary leading-relaxed">
                      {step.text}
                    </p>
                 </div>
               ))}
            </div>
          </div>
        </section>

        {/* CTA Footer */}
        <section className="w-full max-w-5xl mx-auto px-6 py-32 text-center">
           <div className="p-12 md:p-20 rounded-[3rem] bg-gradient-to-br from-teach-accent-deep/40 to-teach-bg-elevated border border-teach-accent-bright/20 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-teach-accent-bright/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-96 h-96 bg-teach-accent-bright/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/3" />
              
              <div className="relative z-10 flex flex-col items-center">
                 <div className="w-20 h-20 rounded-full bg-teach-bg flex items-center justify-center border border-teach-border mb-8 shadow-xl">
                    <Shield className="w-10 h-10 text-teach-accent-bright opacity-80" />
                 </div>
                 <h2 className="text-3xl md:text-5xl font-bold text-teach-text-primary mb-6">Fully Local & Secure</h2>
                 <p className="text-lg text-teach-text-secondary max-w-2xl mx-auto mb-10">
                   INT8-quantized models, CPU-only inference on Pi 5. No cloud, no data ever leaves the device.
                 </p>
                 <button 
                  onClick={() => router.push("/teach/chest_xray")}
                  className="bg-teach-text-primary text-teach-bg px-10 py-4 rounded-xl font-bold hover:bg-teach-accent-bright transition-all shadow-xl active:scale-95"
                 >
                   Launch Training Module
                 </button>
              </div>
           </div>
        </section>

      </main>

      <footer className="w-full border-t border-teach-border bg-teach-bg py-8">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] font-mono uppercase tracking-[0.2em] text-teach-text-muted">
          <span>RadPi Teaching Mode v2.0.0</span>
          <span>&copy; 2026 Diagnostic Intelligence</span>
        </div>
      </footer>
    </div>
  );
}
