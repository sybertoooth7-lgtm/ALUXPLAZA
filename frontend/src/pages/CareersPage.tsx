import { Briefcase, MapPin, Clock, ChevronRight } from 'lucide-react';
import Navigation from '../sections/Navigation';
import Footer from '../sections/Footer';

const openings = [
  {
    title: 'Senior Security Consultant',
    location: 'Nairobi, Kenya (Hybrid)',
    type: 'Full-time',
    desc: 'Lead vulnerability assessments and compliance audits for SME clients across East Africa. Deep knowledge of NIST SP 800-53 or PCI DSS required.',
  },
  {
    title: 'Incident Response Analyst',
    location: 'Nairobi, Kenya (On-site)',
    type: 'Full-time',
    desc: 'First responder for client security incidents. Build playbooks, run tabletop exercises, and manage containment during active breaches.',
  },
  {
    title: 'Full-Stack Engineer (Security)',
    location: 'Remote (East Africa Time)',
    type: 'Full-time',
    desc: 'Build and maintain the Alux Plaza platform — React frontend, Node.js/Express backend, PostgreSQL, and our Shield detection pipeline.',
  },
  {
    title: 'Compliance Specialist',
    location: 'Nairobi, Kenya (Hybrid)',
    type: 'Full-time',
    desc: 'Guide clients through Kenya Data Protection Act readiness, PCI DSS SAQ preparation, and ISO 27001 gap analysis.',
  },
];

const benefits = [
  'Health insurance for you and dependents',
  'Annual security conference budget',
  'Certification sponsorship (CISSP, CISM, OSCP)',
  'Flexible remote policy',
  'Equity participation for senior roles',
  'Mentorship from senior consultants',
];

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-navy-base text-white">
      <Navigation />
      <main className="pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-serif font-bold mb-6">
              Join the <span className="gradient-text-cyan">Team</span>
            </h1>
            <p className="text-[#94a3b8] text-lg max-w-2xl mx-auto">
              We're building the security layer for East Africa's digital economy. If you care about
              standards, transparency, and real impact — you'll fit right in.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-12 mb-20">
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-2xl font-serif font-bold mb-6">Open Positions</h2>
              {openings.map((job) => (
                <div
                  key={job.title}
                  className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 hover:border-alux-cyan/30 transition-colors group cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold mb-2 group-hover:text-alux-cyan transition-colors">
                        {job.title}
                      </h3>
                      <p className="text-[#94a3b8] text-sm mb-4 leading-relaxed">{job.desc}</p>
                      <div className="flex flex-wrap gap-4 text-xs text-[#64748b]">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {job.location}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {job.type}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-[#475569] group-hover:text-alux-cyan transition-colors flex-shrink-0 mt-1" />
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 sticky top-24">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-alux-cyan" />
                  Benefits
                </h3>
                <ul className="space-y-3">
                  {benefits.map((b) => (
                    <li key={b} className="text-[#94a3b8] text-sm flex items-start gap-2">
                      <span className="w-1.5 h-1.5 bg-alux-cyan rounded-full mt-1.5 flex-shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
                <div className="mt-6 pt-6 border-t border-white/[0.06]">
                  <p className="text-[#64748b] text-xs">
                    Don't see a perfect fit? Send your CV and a note on what you'd build to{' '}
                    <span className="text-alux-cyan">careers@aluxplaza.co.ke</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
