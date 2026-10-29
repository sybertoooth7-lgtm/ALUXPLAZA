import { Link } from 'react-router';
import { Check } from 'lucide-react';

const measures = [
  'Staff login needs a phone code',
  'Client and staff areas are separate',
  'Our code is scanned on every change',
  'Updates are tracked every week',
];

export default function Practice() {
  return (
    <section id="about" className="scroll-mt-16 bg-site-base py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 grid lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5">
          <h2 className="font-head font-semibold text-3xl sm:text-4xl tracking-tight text-site-text">
            One person, start to finish
          </h2>
          <p className="font-text text-xl leading-snug text-site-muted mt-5">
            Jinarous Gichobi scopes your work, tests your systems and writes your report.
          </p>
          <Link
            to="/about"
            className="inline-block mt-5 font-text text-lg text-site-accent underline underline-offset-4 hover:text-site-accent-hover"
          >
            About Alux Plaza
          </Link>
        </div>

        <div className="lg:col-span-6 lg:col-start-7">
          <h3 className="font-head font-semibold text-xl text-site-text">
            We secure our own platform too
          </h3>
          <ul className="mt-4 border-t border-site-rule">
            {measures.map((m) => (
              <li
                key={m}
                className="flex items-center gap-3 font-text text-lg text-site-text py-4 border-b border-site-rule"
              >
                <Check className="w-5 h-5 shrink-0 text-site-accent" aria-hidden="true" />
                {m}
              </li>
            ))}
          </ul>
          <Link
            to="/security"
            className="inline-block mt-5 font-text text-lg text-site-accent underline underline-offset-4 hover:text-site-accent-hover"
          >
            Read our security policy
          </Link>
        </div>
      </div>
    </section>
  );
}
