'use client';

import React from 'react';
import { PitchHeader } from './PitchHeader';
import { PitchHero } from './PitchHero';
import { PitchDilemmasSection } from './PitchDilemmasSection';
import { PitchMultiAgendasShowcase } from './PitchMultiAgendasShowcase';
import { PitchRoiCalculator } from './PitchRoiCalculator';
import { PitchHardwareTelemetry } from './PitchHardwareTelemetry';
import { PitchFooter } from './PitchFooter';

export default function PitchPage() {
  const handleScrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-brand-teal selection:text-white flex flex-col">
      {/* Fixed/Sticky Glassmorphic Header */}
      <PitchHeader onNavigateSection={handleScrollToSection} />

      {/* Main Content Sections */}
      <main className="flex-1">
        {/* 1. Hero Section with Value Props & Floating Metrics */}
        <PitchHero onScrollToRoi={() => handleScrollToSection('roi-calculator')} />

        {/* 2. The 3 Core Dilemmas (LGPD, Costs, Cheating vs Soberania) */}
        <PitchDilemmasSection />

        {/* 3. Interactive Showcase of the 5 Pedagogical Multi-Agendas */}
        <PitchMultiAgendasShowcase />

        {/* 4. Interactive TCO / ROI Cost Calculator */}
        <PitchRoiCalculator />

        {/* 5. Physical Appliance Architecture & Offline Telemetry */}
        <PitchHardwareTelemetry />
      </main>

      {/* 6. Footer with Compliance Seals & Direct Role Demo Links */}
      <PitchFooter />
    </div>
  );
}
