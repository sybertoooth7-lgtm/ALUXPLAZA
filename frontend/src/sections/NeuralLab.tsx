import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { FlaskConical, Brain, BarChart3 } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const researchItems = [
  {
    num: '01',
    color: '#a855f7',
    title: 'Post-Quantum Readiness',
    description:
      'Assessing exposure to "harvest now, decrypt later" risk and readiness for post-quantum cryptography migration.',
  },
  {
    num: '02',
    color: '#00d4ff',
    title: 'LLM & AI Security Review',
    description:
      'Applying the OWASP LLM Top 10 (2025) to products that integrate AI or LLM features.',
  },
  {
    num: '03',
    color: '#00ff88',
    title: 'Threat Intelligence Briefings',
    description:
      'Curated, sourced threat intelligence relevant to businesses operating in Kenya and East Africa.',
  },
  {
    num: '04',
    color: '#f97316',
    title: 'Honeypot & Deception Monitoring',
    description:
      'Deploying decoy systems and monitoring them to study real attacker behavior against our own infrastructure.',
  },
];

const methodologies = [
  { label: 'Incident Response', standard: 'NIST SP 800-61' },
  { label: 'Compliance Readiness', standard: 'PCI DSS SAQ A v4.0.1' },
  { label: 'Data Protection Audit', standard: "Kenya's DPA 2019" },
  { label: 'LLM Security Review', standard: 'OWASP LLM Top 10 2025' },
  { label: 'Vulnerability Assessment', standard: 'Documented methodology' },
];

export default function NeuralLab() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    const leftCol = sectionRef.current.querySelector('.lab-left');
    const rightCol = sectionRef.current.querySelector('.lab-right');

    if (leftCol) {
      gsap.fromTo(
        leftCol,
        { opacity: 0, x: -40 },
        {
          opacity: 1,
          x: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 60%',
            once: true,
          },
        }
      );
    }

    if (rightCol) {
      gsap.fromTo(
        rightCol,
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          delay: 0.2,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 60%',
            once: true,
          },
        }
      );
    }
  }, []);

  return (
    <section
      ref={sectionRef}
      id="ai-lab"
      className="py-24 md:py-32 bg-navy-dark relative overflow-hidden matrix-bg"
    >
      {/* Holographic Scanline Overlay */}
      <div className="scanline-overlay animate-flicker">
        <div className="scanline-crt" />
        <div className="scanline-chromatic-left" />
        <div className="scanline-chromatic-right" />
        <div className="scanline-vignette" />
      </div>

      {/* Neural glow background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 20% 50%, rgba(0,212,255,0.06) 0%, transparent 40%), radial-gradient(circle at 80% 80%, rgba(168,85,247,0.04) 0%, transparent 40%)',
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-alux-cyan/10 border border-alux-cyan/20 text-alux-cyan text-sm font-medium mb-4">
            <FlaskConical className="w-4 h-4 mr-2" />
            Research & Methodology
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-white mb-6">
            What We're <span className="gradient-text-cyan">Working On</span>
          </h2>
          <p className="text-[#94a3b8] text-lg max-w-2xl mx-auto">
            The focus areas behind our service offerings, and the standards each deliverable is
            actually built against.
          </p>
        </div>

        {/* Two Column Layout */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Research Initiatives */}
          <div className="lab-left glass-effect-cyan rounded-2xl p-8">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Brain className="w-5 h-5 text-alux-cyan" />
              Research Initiatives
            </h3>
            <div className="space-y-4">
              {researchItems.map((item, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-4 p-4 rounded-lg ${
                    i < researchItems.length - 1 ? 'border-b border-white/[0.06]' : ''
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-mono text-xs font-bold"
                    style={{ backgroundColor: `${item.color}26`, color: item.color }}
                  >
                    {item.num}
                  </div>
                  <div>
                    <h4 className="text-white text-sm font-semibold">{item.title}</h4>
                    <p className="text-[#475569] text-xs mt-1">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Documented Methodologies */}
          <div className="lab-right glass-effect-cyan rounded-2xl p-8">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-alux-green" />
              Documented Methodologies
            </h3>
            <div className="space-y-4">
              {methodologies.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 rounded-lg bg-white/[0.03] border border-white/[0.06]"
                >
                  <span className="text-white text-sm font-medium">{m.label}</span>
                  <span className="text-alux-cyan font-mono text-xs px-3 py-1 rounded-full bg-alux-cyan/10 border border-alux-cyan/20">
                    {m.standard}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[#475569] text-xs mt-6">
              Every deliverable is checked against a written methodology document, not produced ad
              hoc — ask for the methodology behind any service before you book it.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
