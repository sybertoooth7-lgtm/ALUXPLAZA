// frontend/src/lib/clientStatus.ts
// Shared status vocabulary for the authenticated client area: the styling
// for compliance statuses, the section-heading and gold-accent classes, and
// the ComplianceItem shape served by GET /api/client/compliance. Keeping
// these in one place is what lets the dashboard summary, the full
// checklist, and the layout agree on what "failing" looks like.

export type ComplianceStatus = 'passing' | 'in_progress' | 'failing' | 'pending' | 'not_applicable';

export interface ComplianceItem {
  id: number;
  framework: string;
  item_key: string;
  title: string;
  description: string | null;
  sort_order: number;
  status: ComplianceStatus;
  notes: string | null;
  updated_at: string;
}

export interface StatusStyle {
  label: string;
  className: string;
}

// Each class pairs a light-mode colour (readable on white cards) with a
// dark: override for the navy theme, mirroring how the rest of the client
// area pairs e.g. bg-green-600 with dark:bg-alux-green. Exported because the
// compliance page counts statuses per filter chip straight off this map.
export const STATUS_STYLES: Record<ComplianceStatus, StatusStyle> = {
  passing: {
    label: 'Passing',
    className: 'bg-green-100 text-green-800 dark:bg-alux-green/15 dark:text-alux-green',
  },
  in_progress: {
    label: 'In progress',
    className: 'bg-amber-100 text-amber-800 dark:bg-alux-gold/15 dark:text-alux-gold',
  },
  failing: {
    label: 'Needs attention',
    className: 'bg-red-100 text-red-800 dark:bg-alux-red/15 dark:text-alux-red',
  },
  pending: {
    label: 'Not yet assessed',
    className: 'bg-muted text-muted-foreground',
  },
  not_applicable: {
    label: 'Not applicable',
    className: 'bg-muted text-muted-foreground',
  },
};

// An unknown status (a value the frontend hasn't met yet) renders as
// "not yet assessed" rather than crashing the page.
export function styleFor(status: string): StatusStyle {
  return STATUS_STYLES[status as ComplianceStatus] ?? STATUS_STYLES.pending;
}

// Gold accents: amber on light backgrounds, the brand gold on the dark theme.
export const GOLD_TEXT = 'text-amber-700 dark:text-alux-gold';

export const SECTION_HEADING = 'font-serif text-lg';
