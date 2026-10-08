import { Network, Router, ShieldAlert, Wifi, Eye, Wrench } from 'lucide-react';
import ServiceLayout from '../components/ServiceLayout';

const areas = [
  {
    title: 'Perimeter Hardening',
    desc: 'Firewall rule audit, DMZ design, VPN configuration review, and edge-device patching.',
    icon: <ShieldAlert className="w-6 h-6" />,
  },
  {
    title: 'Segmentation & Zero Trust',
    desc: 'VLAN design, micro-segmentation, and least-privilege access between internal zones.',
    icon: <Router className="w-6 h-6" />,
  },
  {
    title: 'Wireless Security',
    desc: 'WPA3-Enterprise rollout, rogue AP detection, and guest network isolation.',
    icon: <Wifi className="w-6 h-6" />,
  },
  {
    title: 'Monitoring & Detection',
    desc: 'IDS/IPS tuning, NetFlow analysis, and SIEM integration for real-time anomaly detection.',
    icon: <Eye className="w-6 h-6" />,
  },
  {
    title: 'Infrastructure Patching',
    desc: 'Firmware lifecycle management, automated patch validation, and rollback planning.',
    icon: <Wrench className="w-6 h-6" />,
  },
];

export default function NetworkHardeningPage() {
  return (
    <ServiceLayout
      title="Network Hardening"
      subtitle="Perimeter, segment, and monitor with measurable posture improvement."
      icon={<Network className="w-7 h-7 text-navy-base" />}
    >
      <div className="space-y-16">
        <section>
          <h2 className="text-2xl font-serif font-bold text-white mb-4">
            Your Network Is Bigger Than You Think
          </h2>
          <p className="text-[#94a3b8] leading-relaxed mb-6">
            Shadow IT, IoT devices, and remote work have expanded most SME networks far beyond their
            documented perimeter. We map your real attack surface, close unnecessary exposure, and
            build monitoring that catches lateral movement before it reaches critical assets.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {areas.map((a) => (
              <div
                key={a.title}
                className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6"
              >
                <div className="text-alux-cyan mb-3">{a.icon}</div>
                <h4 className="font-semibold mb-2">{a.title}</h4>
                <p className="text-[#94a3b8] text-sm leading-relaxed">{a.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-serif font-bold text-white mb-4">Measurable Outcomes</h2>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8">
            <div className="grid md:grid-cols-3 gap-8 text-center">
              <div>
                <div className="text-3xl font-bold gradient-text-cyan mb-2">-70%</div>
                <p className="text-[#94a3b8] text-sm">
                  Average reduction in external attack surface within 30 days
                </p>
              </div>
              <div>
                <div className="text-3xl font-bold gradient-text-cyan mb-2">100%</div>
                <p className="text-[#94a3b8] text-sm">
                  Of clients pass external penetration test post-hardening
                </p>
              </div>
              <div>
                <div className="text-3xl font-bold gradient-text-cyan mb-2">4h</div>
                <p className="text-[#94a3b8] text-sm">
                  Mean time to detect anomalous lateral movement after deployment
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </ServiceLayout>
  );
}
