import { useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import { Zap, BarChart3, ChevronDown } from 'lucide-react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  hue: number;
}

function useParticleCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let w = window.innerWidth;
    let h = window.innerHeight;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
    };
    resize();
    window.addEventListener('resize', resize);

    // Create particles
    const count = window.innerWidth < 768 ? 400 : 1200;
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        size: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.6 + 0.2,
        hue: Math.random() > 0.7 ? 270 : 190, // mostly cyan, some purple
      });
    }

    const animate = () => {
      ctx.fillStyle = 'rgba(5, 10, 18, 0.15)';
      ctx.fillRect(0, 0, w, h);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        const color = p.hue === 270 ? '168, 85, 247' : '0, 212, 255';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color}, ${p.alpha})`;
        ctx.fill();
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 212, 255, ${0.08 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [canvasRef]);
}

export default function Hero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useParticleCanvas(canvasRef);

  useEffect(() => {
    if (!contentRef.current) return;
    const els = contentRef.current.children;
    gsap.fromTo(
      els,
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.15,
        delay: 0.2,
      }
    );
  }, []);

  const scrollToSection = useCallback((href: string) => {
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Honest credibility markers — the standards our deliverables are built
  // against, not fabricated live counters. Update these if the service
  // lineup changes; never replace with invented numbers.
  const credibilityMarkers = [
    { value: 'NIST SP 800-61', label: 'Incident Response' },
    { value: 'PCI DSS SAQ A', label: 'Compliance Readiness' },
    { value: 'Kenya DPA 2019', label: 'Data Protection' },
    { value: 'OWASP LLM Top 10', label: 'AI/LLM Security' },
  ];

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen flex items-center justify-center hero-gradient grid-pattern-cyan overflow-hidden"
    >
      {/* Particle Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
      />

      {/* Radial overlay for text readability */}
      <div
        className="absolute inset-0 z-[2]"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(5,10,18,0.7) 0%, transparent 70%)',
        }}
      />

      {/* Content */}
      <div
        ref={contentRef}
        className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center pt-24 pb-16"
      >
        {/* Badge */}
        <div className="inline-flex items-center px-4 py-2 rounded-full bg-alux-cyan/10 border border-alux-cyan/30 text-alux-cyan text-sm font-medium mb-8">
          <span className="w-2 h-2 bg-alux-cyan rounded-full mr-2 animate-pulse"></span>
          <span className="font-mono text-xs tracking-wider uppercase">
            NAIROBI · CYBERSECURITY CONSULTING
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-serif font-bold text-white mb-6 leading-tight">
          Practical Security
          <br />
          <span className="gradient-text-cyan">You Can Verify</span>
          <br />
          <span className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-[#94a3b8]">
            Not Just Promises
          </span>
        </h1>

        {/* Description */}
        <p className="text-lg md:text-xl text-[#94a3b8] max-w-2xl mx-auto mb-10 leading-relaxed">
          Alux Plaza delivers{' '}
          <span className="text-alux-cyan font-semibold">incident response plans</span>,{' '}
          <span className="text-alux-purple font-semibold">compliance assessments</span>, and
          vulnerability reviews built on real standards —{' '}
          <span className="text-white font-semibold">
            NIST, PCI DSS, and Kenya's Data Protection Act
          </span>{' '}
          — with deliverables you can hand to an auditor.
        </p>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
          <button
            onClick={() => scrollToSection('#contact')}
            className="px-8 py-4 btn-gradient text-white font-bold rounded-full hover:shadow-xl hover:shadow-alux-cyan/30 transition-all hover:scale-105 text-lg flex items-center gap-2"
          >
            <Zap className="w-5 h-5" />
            Book a Consultation
          </button>
          <button
            onClick={() => scrollToSection('#services')}
            className="px-8 py-4 border border-alux-cyan/50 text-alux-cyan font-semibold rounded-full hover:bg-alux-cyan/10 transition-all text-lg flex items-center gap-2"
          >
            <BarChart3 className="w-5 h-5" />
            See Our Services
          </button>
        </div>

        {/* Standards / credibility markers — real, not fabricated stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {credibilityMarkers.map((item, i) => (
            <div
              key={i}
              className="glass-effect-cyan rounded-2xl p-5 md:p-6 text-center relative overflow-hidden group data-stream"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-alux-cyan/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="text-lg md:text-xl lg:text-2xl font-bold text-alux-cyan mb-1 font-mono">
                  {item.value}
                </div>
                <div className="text-[10px] md:text-xs text-[#94a3b8] uppercase tracking-wider">
                  {item.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce">
        <ChevronDown className="w-6 h-6 text-alux-cyan/30" />
      </div>
    </section>
  );
}
