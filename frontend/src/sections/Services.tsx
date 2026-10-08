import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Shield, BarChart3, Database, Zap, Fingerprint, FileCheck, Bug, Globe } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const services = [
  {
    title: 'Incident Response Planning',
    description:
      'A tailored IR plan aligned to NIST SP 800-61: roles, playbooks, and escalation paths your team can actually run during a breach — not a template that sits unread.',
    icon: Zap,
    accent: '#c9a84c',
    tags: ['NIST SP 800-61', 'Deliverable: IR plan + playbook'],
    wide: true,
  },
  {
    title: 'Vulnerability Assessment',
    description:
      'A scoped scan and manual review of your systems, with findings ranked by real-world exploitability, not just CVSS score alone.',
    icon: Bug,
    accent: '#a855f7',
    tags: ['Prioritized findings', 'Deliverable: report'],
    wide: false,
  },
  {
    title: 'PCI DSS Compliance Readiness',
    description:
      'Gap assessment against PCI DSS SAQ A v4.0.1 for merchants handling card data, with a remediation checklist mapped to each requirement.',
    icon: FileCheck,
    accent: '#00d4ff',
    tags: ['PCI DSS SAQ A v4.0.1', 'Deliverable: checklist'],
    wide: false,
  },
  {
    title: 'Data Protection & Access Audit',
    description:
      "Review of access controls and data handling against Kenya's Data Protection Act 2019, so client and employee data is handled lawfully.",
    icon: Fingerprint,
    accent: '#ff3366',
    tags: ['Kenya DPA 2019', 'Deliverable: audit report'],
    wide: false,
  },
  {
    title: 'Network Hardening Review',
    description:
      'Configuration review of firewalls, network segmentation, and exposed services, with a prioritized hardening checklist your team can execute.',
    icon: Shield,
    accent: '#00d4ff',
    tags: ['Config review', 'Deliverable: hardening checklist'],
    wide: true,
  },
  {
    title: 'LLM & AI Security Review',
    description:
      'Assessment of AI/LLM-integrated products against the OWASP LLM Top 10 (2025) — prompt injection, data leakage, and insecure output handling.',
    icon: Globe,
    accent: '#a855f7',
    tags: ['OWASP LLM Top 10 2025', 'Deliverable: findings report'],
    wide: false,
  },
  {
    title: 'Threat Intelligence Briefing',
    description:
      'A curated, sourced briefing on threats relevant to your sector — written for decision-makers, not just security teams.',
    icon: BarChart3,
    accent: '#00ff88',
    tags: ['Sourced & cited', 'Deliverable: briefing doc'],
    wide: false,
  },
  {
    title: 'Backup & Encryption Audit',
    description:
      "Review of backup recoverability and encryption-at-rest practices, so a ransomware event or hardware failure doesn't become a data-loss event too.",
    icon: Database,
    accent: '#00ff88',
    tags: ['Recoverability tested', 'Deliverable: audit report'],
    wide: false,
  },
];

export default function Services() {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gridRef.current) return;
    const tiles = gridRef.current.querySelectorAll('.bento-tile');

    gsap.fromTo(
      tiles,
      { opacity: 0, y: 60, rotateX: 15 },
      {
        opacity: 1,
        y: 0,
        rotateX: 0,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.08,
        scrollTrigger: {
          trigger: gridRef.current,
          start: 'top 75%',
          once: true,
        },
      }
    );

    // Parallax depth on scroll
    const rows = Array.from(tiles);
    rows.forEach((tile, i) => {
      gsap.to(tile, {
        z: 30 + (i % 3) * 15,
        scrollTrigger: {
          trigger: gridRef.current,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1,
        },
      });
    });
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const grid = gridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    grid.style.transform = `rotateY(${x * 3}deg) rotateX(${-y * 3}deg)`;
  };

  const handleMouseLeave = () => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.style.transform = 'rotateY(0deg) rotateX(0deg)';
  };

  return (
    <section id="services" className="py-24 md:py-32 bg-navy-base relative overflow-hidden">
      {/* Subtle radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(0,212,255,0.04) 0%, transparent 60%)',
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <div className="text-center mb-16 reveal">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-alux-cyan/10 border border-alux-cyan/20 text-alux-cyan text-sm font-medium mb-4">
            Standards-Based Security Services
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-white mb-6">
            <span className="gradient-text-cyan">Security Services</span>{' '}
            <span className="gradient-text-purple">Grounded in Real Standards</span>
          </h2>
          <p className="text-[#94a3b8] text-lg max-w-2xl mx-auto">
            Every engagement is mapped to a named standard — NIST, PCI DSS, Kenya DPA 2019, OWASP —
            with a concrete deliverable, not a vague promise.
          </p>
        </div>

        {/* Bento Grid */}
        <div
          ref={gridRef}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          style={{
            perspective: '1000px',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.3s ease-out',
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {services.map((service, i) => (
            <div
              key={i}
              className={`bento-tile bg-navy-surface border border-white/[0.06] rounded-2xl p-7 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] ${
                service.wide ? 'md:col-span-2' : ''
              }`}
              style={{ transformStyle: 'preserve-3d' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = `${service.accent}4D`;
                (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px ${service.accent}26`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
            >
              <div
                className="w-10 h-10 rounded-[10px] flex items-center justify-center mb-4"
                style={{
                  background: `linear-gradient(135deg, ${service.accent}, ${service.accent}99)`,
                }}
              >
                <service.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-serif font-semibold text-white mb-2">{service.title}</h3>
              <p className="text-[#94a3b8] text-sm leading-relaxed mb-4">{service.description}</p>
              <div className="flex flex-wrap gap-2">
                {service.tags.map((tag, ti) => (
                  <span
                    key={ti}
                    className="px-2 py-0.5 rounded-full text-[11px] font-mono"
                    style={{
                      backgroundColor: `${service.accent}26`,
                      color: service.accent,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
