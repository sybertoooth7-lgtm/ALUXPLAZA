import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Brain, Zap, CheckCircle } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

function NeuralCoreSVG() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current;

    // Animate hub pulses
    const hubs = svg.querySelectorAll('.neural-hub');
    hubs.forEach((hub, i) => {
      gsap.fromTo(
        hub,
        { attr: { r: 16 } },
        {
          attr: { r: 20 },
          duration: 2,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: i * 0.6,
        }
      );
    });

    // Animate satellites
    const satellites = svg.querySelectorAll('.satellite-group');
    satellites.forEach((sat) => {
      const animateMotion = sat.querySelector('animateMotion');
      if (animateMotion) {
        gsap.fromTo(
          sat,
          { opacity: 0 },
          {
            opacity: 1,
            duration: 1,
            delay: 0.5,
          }
        );
      }
    });

    // Draw links
    const links = svg.querySelectorAll('.inter-link');
    links.forEach((link, i) => {
      const length = (link as SVGPathElement).getTotalLength?.() || 300;
      gsap.set(link, {
        strokeDasharray: length,
        strokeDashoffset: length,
      });
      gsap.to(link, {
        strokeDashoffset: 0,
        duration: 2,
        delay: 0.8 + i * 0.3,
        ease: 'power2.out',
      });
    });

    // Animate data packets
    const packets = svg.querySelectorAll('.data-packet');
    packets.forEach((packet, i) => {
      gsap.fromTo(
        packet,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 0.3,
          delay: 2 + i * 0.5,
        }
      );
    });
  }, []);

  // Cluster positions
  const clusters = [
    { cx: 200, cy: 250, color: '#00d4ff', label: 'STANDARDS ASSESSMENT' },
    { cx: 400, cy: 150, color: '#a855f7', label: 'ATTACK PATH MAPPING' },
    { cx: 600, cy: 250, color: '#00ff88', label: 'CONTINUOUS REVIEW' },
  ];

  // Satellite orbits for each cluster
  const satelliteData = [
    // Transformer satellites
    [
      { rx: 70, ry: 40, dur: 10, offset: 0 },
      { rx: 80, ry: 35, dur: 12, offset: 72 },
      { rx: 60, ry: 50, dur: 14, offset: 144 },
      { rx: 75, ry: 45, dur: 11, offset: 216 },
      { rx: 65, ry: 55, dur: 13, offset: 288 },
    ],
    // GNN satellites
    [
      { rx: 65, ry: 45, dur: 11, offset: 36 },
      { rx: 75, ry: 40, dur: 13, offset: 108 },
      { rx: 70, ry: 50, dur: 10, offset: 180 },
      { rx: 80, ry: 35, dur: 12, offset: 252 },
      { rx: 60, ry: 48, dur: 14, offset: 324 },
    ],
    // RL Agent satellites
    [
      { rx: 72, ry: 42, dur: 12, offset: 18 },
      { rx: 68, ry: 52, dur: 10, offset: 90 },
      { rx: 78, ry: 38, dur: 14, offset: 162 },
      { rx: 62, ry: 48, dur: 11, offset: 234 },
      { rx: 73, ry: 44, dur: 13, offset: 306 },
    ],
  ];

  // Inter-cluster links
  const links = [
    { d: 'M 220 230 C 300 200, 320 180, 380 165', color: '#00d4ff' },
    { d: 'M 420 165 C 480 180, 500 200, 580 230', color: '#a855f7' },
    { d: 'M 580 270 C 500 300, 300 300, 220 270', color: '#00ff88' },
  ];

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 800 500"
      className="w-full max-w-[700px] mx-auto h-auto"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <filter id="neuralGlow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="hubGlow">
          <feGaussianBlur stdDeviation="6" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Inter-cluster links */}
      {links.map((link, i) => (
        <path
          key={i}
          className="inter-link"
          d={link.d}
          stroke={link.color}
          strokeWidth="2"
          strokeOpacity="0.3"
          fill="none"
          strokeLinecap="round"
        />
      ))}

      {/* Data packets on links */}
      {links.map((link, i) => (
        <circle
          key={`packet-${i}`}
          className="data-packet"
          r="4"
          fill={link.color}
          filter="url(#neuralGlow)"
        >
          <animateMotion dur={`${3 + i * 0.5}s`} repeatCount="indefinite" path={link.d} />
        </circle>
      ))}

      {/* Clusters */}
      {clusters.map((cluster, ci) => (
        <g key={ci}>
          {/* Orbit ellipses */}
          {satelliteData[ci].map((sat, si) => (
            <ellipse
              key={`orbit-${ci}-${si}`}
              cx={cluster.cx}
              cy={cluster.cy}
              rx={sat.rx}
              ry={sat.ry}
              fill="none"
              stroke={cluster.color}
              strokeWidth="1"
              strokeOpacity="0.15"
              strokeDasharray="4 4"
            />
          ))}

          {/* Satellites */}
          {satelliteData[ci].map((sat, si) => {
            const orbitPath = `M ${cluster.cx - sat.rx} ${cluster.cy} A ${sat.rx} ${sat.ry} 0 1 1 ${cluster.cx + sat.rx} ${cluster.cy} A ${sat.rx} ${sat.ry} 0 1 1 ${cluster.cx - sat.rx} ${cluster.cy}`;
            return (
              <g key={`sat-${ci}-${si}`} className="satellite-group">
                <circle r="6" fill={cluster.color} fillOpacity="0.6" filter="url(#neuralGlow)">
                  <animateMotion
                    dur={`${sat.dur}s`}
                    repeatCount="indefinite"
                    path={orbitPath}
                    begin={`-${(sat.offset / 360) * sat.dur}s`}
                  />
                </circle>
              </g>
            );
          })}

          {/* Central hub */}
          <circle
            className="neural-hub"
            cx={cluster.cx}
            cy={cluster.cy}
            r="16"
            fill={cluster.color}
            filter="url(#hubGlow)"
          />
          <circle cx={cluster.cx} cy={cluster.cy} r="8" fill="white" fillOpacity="0.3" />

          {/* Label */}
          <text
            x={cluster.cx}
            y={cluster.cy + 40}
            textAnchor="middle"
            fill={cluster.color}
            fontSize="11"
            fontFamily="JetBrains Mono, monospace"
            letterSpacing="0.05em"
            opacity="0.8"
          >
            {cluster.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

const featureCards = [
  {
    icon: Brain,
    iconGradient: 'from-alux-purple to-purple-700',
    title: 'Standards-Based Assessment',
    description:
      "Every engagement is scored against a named standard — NIST SP 800-61, PCI DSS SAQ A, Kenya's DPA 2019, or OWASP LLM Top 10 — so findings map directly to something you can hand an auditor.",
    tagLeft: 'NIST · PCI DSS · OWASP',
    tagRight: 'Kenya DPA 2019',
  },
  {
    icon: Zap,
    iconGradient: 'from-alux-cyan to-blue-600',
    title: 'Attack Path Mapping',
    description:
      'We map how a real attacker would move through your infrastructure — lateral movement routes, privilege escalation chains — using a mix of automated scanning and manual review, not just a scanner report.',
    tagLeft: 'Manual + automated',
    tagRight: 'Prioritized findings',
  },
  {
    icon: CheckCircle,
    iconGradient: 'from-alux-green to-emerald-600',
    title: 'Continuous Review',
    description:
      'Methodologies get refined based on what we actually find in engagements — not a marketing claim about self-improving AI, just an honest practice of updating checklists when something new turns up.',
    tagLeft: 'Living checklists',
    tagRight: 'Updated per engagement',
  },
];

export default function AICore() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    const cards = sectionRef.current.querySelectorAll('.feature-card');
    gsap.fromTo(
      cards,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.15,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 60%',
          once: true,
        },
      }
    );
  }, []);

  return (
    <section
      ref={sectionRef}
      id="ai-core"
      className="py-24 md:py-32 bg-navy-base relative overflow-hidden"
    >
      {/* Neural glow background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(0,212,255,0.05) 0%, transparent 50%)',
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <div className="text-center mb-16 reveal">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-alux-purple/10 border border-alux-purple/20 text-alux-purple text-sm font-medium mb-4">
            <Zap className="w-4 h-4 mr-2" />
            Our Methodology
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-white mb-6">
            How We <span className="gradient-text-purple">Actually Work</span>
          </h2>
          <p className="text-[#94a3b8] text-lg max-w-2xl mx-auto">
            Three pillars, each grounded in a real standard — not a black-box AI claim you have to
            take on faith.
          </p>
        </div>

        {/* Neural Core SVG */}
        <div className="mb-16 reveal">
          <NeuralCoreSVG />
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {featureCards.map((card, i) => (
            <div
              key={i}
              className="feature-card glass-effect-purple rounded-2xl p-8 relative overflow-hidden group card-hover"
            >
              <div
                className="absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl opacity-30"
                style={{ background: i === 0 ? '#a855f7' : i === 1 ? '#00d4ff' : '#00ff88' }}
              />
              <div
                className={`w-16 h-16 bg-gradient-to-br ${card.iconGradient} rounded-2xl flex items-center justify-center mb-6 ai-pulse`}
              >
                <card.icon className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-serif font-bold text-white mb-3">{card.title}</h3>
              <p className="text-[#94a3b8] text-sm leading-relaxed mb-6">{card.description}</p>
              <div className="flex items-center justify-between text-xs font-mono">
                <span
                  className="px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10"
                  style={{ color: i === 0 ? '#a855f7' : i === 1 ? '#00d4ff' : '#00ff88' }}
                >
                  {card.tagLeft}
                </span>
                <span className="text-[#94a3b8]">{card.tagRight}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
