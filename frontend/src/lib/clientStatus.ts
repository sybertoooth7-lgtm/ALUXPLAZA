// frontend/src/lib/clientStatus.ts
// Shared types and status styling for the client area (dashboard + compliance
// pages), so both render a checklist item's status identically.
//
// Colours follow the pattern the admin pages already use: a readable
// light-theme pair first, then the neon `alux-*` accent under `dark:`. The
// neon accents (#00ff88, #00d4ff, #ff3366) are tuned for the navy background
// and fail contrast on the light theme, so they must not be used bare.

export type ComplianceStatus = 'pending' | 'in_progress' | 'passing' | 'failing' | 'not_applicable';

export interface ComplianceItem {
  id: number;
  framework: string;
  item_key: string;
  title: string;
  description: string | null;
  status: ComplianceStatus;
  notes: string | null;
  updated_at: string | null;
}

export const STATUS_STYLES: Record<ComplianceStatus, { label: string; className: string }> = {
  pending: { label: 'Not yet assessed', className: 'bg-muted text-muted-foreground' },
  in_progress: {
    label: 'In progress',
    className: 'bg-cyan-100 text-cyan-800 dark:bg-alux-cyan/15 dark:text-alux-cyan',
  },
  passing: {
    label: 'Passing',
    className: 'bg-green-100 text-green-800 dark:bg-alux-green/15 dark:text-alux-green',
  },
  failing: {
    label: 'Needs attention',
    className: 'bg-red-100 text-red-800 dark:bg-alux-red/15 dark:text-alux-red',
  },
  not_applicable: { label: 'Not applicable', className: 'bg-muted text-muted-foreground' },
};

export function styleFor(status: string) {
  return STATUS_STYLES[status as ComplianceStatus] ?? STATUS_STYLES.pending;
}

// Text colours that stay readable on both themes.
export const GOLD_TEXT = 'text-amber-700 dark:text-alux-gold';
export const SECTION_HEADING = 'font-serif text-lg text-cyan-800 dark:text-alux-cyan';
