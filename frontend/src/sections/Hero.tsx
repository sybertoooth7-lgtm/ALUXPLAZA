import { Link } from 'react-router';
import NetworkBackground from './NetworkBackground';
import QuickCheck from './QuickCheck';

const standards = ['PCI DSS 4.0.1', 'Kenya DPA 2019', 'NIST SP 800-61', 'OWASP LLM Top 10'];

interface Props {
  onRequest: (message: string) => void;
}

export default function Hero({ onRequest }: Props) {
  return (
    <section className="relative overflow-hidden bg-site-base pt-28 pb-16 md:pt-36">
      <NetworkBackground />
      <div className="cyber-glow absolute inset-0 pointer-events-none" aria-hidden="true" />
      <div className="relative max-w-6xl mx-auto px-5 sm:px-8">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-6">
            <h1 className="font-head font-semibold text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-site-text text-balance">
              Find out where your business is exposed.
            </h1>
            <p className="font-text text-xl sm:text-2xl leading-snug text-site-muted mt-6 max-w-md">
              Answer 5 quick questions. Then we fix the gaps with you.
            </p>
            <Link
              to="/#contact"
              className="inline-block mt-8 font-text text-lg text-site-text underline underline-offset-4 decoration-site-rule hover:decoration-site-accent"
            >
              Or ask for a full assessment
            </Link>
          </div>

          <div className="lg:col-span-6">
            <QuickCheck onRequest={onRequest} />
          </div>
        </div>

        <div className="mt-16 pt-6 border-t border-site-rule flex flex-wrap items-center gap-x-8 gap-y-2">
          <p className="font-text text-base text-site-muted">We work to</p>
          {standards.map((s) => (
            <p key={s} className="font-mono text-sm text-site-text">
              {s}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
