import { useState } from 'react';
import { Link } from 'react-router';
import {
  Bot,
  ChevronDown,
  CreditCard,
  DatabaseBackup,
  Network,
  Radar,
  ScanSearch,
  ShieldAlert,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Service {
  title: string;
  line: string;
  get: string;
  icon: LucideIcon;
  to?: string;
}

const services: Service[] = [
  {
    title: 'If you get hacked',
    line: 'A plan your team can follow, step by step.',
    get: 'Response plan and playbook',
    icon: ShieldAlert,
    to: '/services/incident-response',
  },
  {
    title: 'Find weak spots',
    line: 'We test your systems and rank what to fix first.',
    get: 'Findings report',
    icon: ScanSearch,
    to: '/services/vulnerability-assessment',
  },
  {
    title: 'Card payments (PCI DSS)',
    line: 'Check you meet the rules for taking card payments.',
    get: 'Fix checklist',
    icon: CreditCard,
    to: '/services/compliance-readiness',
  },
  {
    title: 'Customer data (Kenya DPA)',
    line: 'Check you handle personal data the way the law asks.',
    get: 'Audit report',
    icon: Users,
    to: '/services/data-protection-audit',
  },
  {
    title: 'Network check',
    line: 'Review your firewall and what is open to the internet.',
    get: 'Hardening checklist',
    icon: Network,
    to: '/services/network-hardening',
  },
  {
    title: 'AI product check',
    line: 'Test AI features for data leaks and tricks.',
    get: 'Findings report',
    icon: Bot,
  },
  {
    title: 'Threat briefing',
    line: 'The threats that matter in your sector, in plain language.',
    get: 'Short briefing',
    icon: Radar,
  },
  {
    title: 'Backups and encryption',
    line: 'Prove you can get your data back after an attack.',
    get: 'Audit report',
    icon: DatabaseBackup,
  },
];

export default function Services() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section
      id="services"
      className="scroll-mt-16 bg-site-base py-20 md:py-28 border-t border-site-rule"
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8 grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-4">
          <h2 className="font-head font-semibold text-3xl sm:text-4xl tracking-tight text-site-text">
            What we do
          </h2>
          <p className="font-text text-lg text-site-muted mt-4">Tap one to see what you get.</p>
        </div>

        <ul className="lg:col-span-8 border-t border-site-rule">
          {services.map((s, i) => {
            const isOpen = open === i;
            const Icon = s.icon;
            return (
              <li key={s.title} className="border-b border-site-rule">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={`service-${i}`}
                  className="w-full flex items-center gap-4 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
                >
                  <span
                    className={`shrink-0 w-11 h-11 rounded border flex items-center justify-center transition-colors ${
                      isOpen
                        ? 'border-site-accent text-site-accent'
                        : 'border-site-rule text-site-muted'
                    }`}
                  >
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="flex-1 font-head font-semibold text-xl text-site-text">
                    {s.title}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-site-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                <div
                  id={`service-${i}`}
                  aria-hidden={!isOpen}
                  className={`grid transition-[grid-template-rows] duration-200 ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                >
                  <div className="overflow-hidden">
                    <div className="pb-5 pl-[3.75rem]">
                      <p className="font-text text-lg text-site-text">{s.line}</p>
                      <p className="font-mono text-sm text-site-muted mt-2">You get: {s.get}</p>
                      {s.to && (
                        <Link
                          to={s.to}
                          tabIndex={isOpen ? 0 : -1}
                          className="inline-block mt-3 font-text text-base text-site-accent underline underline-offset-4 hover:text-site-accent-hover"
                        >
                          More detail
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
