import { Check, FileText, MessageSquare, Search } from 'lucide-react';

const steps = [
  { title: 'Talk', line: 'We agree what to check.', icon: MessageSquare },
  { title: 'Check', line: 'We test your systems.', icon: Search },
  { title: 'Report', line: 'You get a clear list of fixes.', icon: FileText },
  { title: 'Re-check', line: 'We confirm the fixes worked.', icon: Check },
];

export default function Process() {
  return (
    <section id="process" className="scroll-mt-16 bg-site-raised py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <h2 className="font-head font-semibold text-3xl sm:text-4xl tracking-tight text-site-text">
          How it works
        </h2>

        <ol className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="border-t border-site-accent pt-5">
                <Icon className="w-7 h-7 text-site-accent" aria-hidden="true" />
                <p className="font-mono text-sm text-site-muted mt-4">Step {i + 1}</p>
                <h3 className="font-head font-semibold text-xl text-site-text mt-1">
                  {step.title}
                </h3>
                <p className="font-text text-lg text-site-muted mt-2">{step.line}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
