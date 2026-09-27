// shield/detector.js
// Pattern-based request inspection with evasion-resistant normalization.
// Normalization runs BEFORE pattern matching so encoded/obfuscated
// payloads still get caught.

// Upper bound on the raw text normalized and pattern-matched per request
// part. express.json accepts 1mb, and normalization alone (three decode
// passes, NFKC, ~10 regex rewrites) plus multi-token patterns is enough to
// block the event loop for minutes on a small instance. Applied BEFORE
// normalization, which is also the cheap direction: percent- and
// entity-decoding only ever shrink the string, so a 64KB window can never
// grow past what it replaced. Head+tail is kept so payloads at either end
// of an oversized part stay detectable.
const MAX_SCAN_CHARS = 65536;

const SQLI_PATTERNS = [
  { name: 'sql_union', regex: /\bunion\b[\s\S]{0,200}?\bselect\b/i },
  { name: 'sql_or_injection', regex: /\bor\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i },
  { name: 'sql_comment', regex: /(--|#|\/\*)\s*$/ },
  { name: 'sql_stacked', regex: /;\s*(drop|delete|insert|update|alter|create)\s+/i },
  { name: 'sql_sleep', regex: /\b(sleep|benchmark|pg_sleep|waitfor\s+delay)\s*\(/i },
  { name: 'sql_into_outfile', regex: /\binto\s+(outfile|dumpfile)\b/i },
  { name: 'sql_exec', regex: /\bexec\s*\(/i },
  { name: 'sql_information_schema', regex: /\b(information_schema|sysdatabases|sysobjects)\b/i },
];

const XSS_PATTERNS = [
  { name: 'xss_script_tag', regex: /<script[\s\S]{0,500}?<\/script>/i },
  { name: 'xss_event_handler', regex: /on\w+\s*=/i },
  { name: 'xss_javascript_uri', regex: /javascript\s*:/i },
  { name: 'xss_iframe', regex: /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/i },
  { name: 'xss_vbscript', regex: /vbscript\s*:/i },
  { name: 'xss_expression', regex: /expression\s*\(/i },
];

const PATH_TRAVERSAL_PATTERNS = [
  { name: 'path_traversal_dotdot', regex: /\.\.[/\\]/ },
  { name: 'path_traversal_encoded', regex: /%2e%2e[%2f%5c]/i },
];

const ALL_PATTERNS = [
  ...SQLI_PATTERNS.map((p) => ({ ...p, category: 'sqli', severity: 'high' })),
  ...XSS_PATTERNS.map((p) => ({ ...p, category: 'xss', severity: 'high' })),
  ...PATH_TRAVERSAL_PATTERNS.map((p) => ({ ...p, category: 'path_traversal', severity: 'medium' })),
];

/**
 * Evasion-resistant normalization pipeline.
 * Runs before pattern matching so encoded/obfuscated attacks still hit.
 */
function normalizeInput(input) {
  if (input == null) return '';
  let s = String(input);

  // 1. Recursive URL-decode (up to 3 levels — prevents ReDoS from infinite %25 loops)
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(s);
      if (decoded === s) break;
      s = decoded;
    } catch {
      break; // malformed URI sequence
    }
  }

  // 2. HTML entity decode (numeric + named)
  s = s
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/gi, '&');

  // 3. Unicode NFKC normalization (catches homoglyphs / compatibility chars)
  s = s.normalize('NFKC');

  // 4. Lowercase
  s = s.toLowerCase();

  // 5. Remove null bytes
  s = s.replace(/\0/g, '');

  // 6. Strip SQL comments
  s = s
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // /* ... */
    .replace(/--[^\n]*/g, ' ') // -- ...
    .replace(/#[^\n]*/g, ' '); // # ...

  // 7. Decode hex/unicode escapes commonly used in obfuscation
  s = s
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  // 8. Collapse all whitespace to single spaces
  s = s.replace(/\s+/g, ' ');

  return s.trim();
}

// Truncates one request part to a bounded head+tail window. Runs before
// normalizeInput so an oversized body is cheap to decode as well as to scan.
function capForScan(content) {
  if (content.length <= MAX_SCAN_CHARS) return content;
  const half = Math.floor(MAX_SCAN_CHARS / 2);
  return `${content.slice(0, half)}\n${content.slice(-half)}`;
}

/**
 * Flattens req.query, req.body, req.params, req.originalUrl into a
 * single normalized string for scanning.
 */
function extractScannableContent(req) {
  const parts = [];
  if (req.query) parts.push(normalizeInput(capForScan(JSON.stringify(req.query))));
  if (req.body) parts.push(normalizeInput(capForScan(JSON.stringify(req.body))));
  if (req.params) parts.push(normalizeInput(capForScan(JSON.stringify(req.params))));
  if (req.originalUrl) parts.push(normalizeInput(capForScan(req.originalUrl)));
  return parts.join(' ');
}

/**
 * Scans a request for known attack signatures.
 * Returns the first match found, or null if clean.
 */
export function scanRequest(req) {
  const content = extractScannableContent(req);
  if (!content) return null;

  for (const pattern of ALL_PATTERNS) {
    const match = content.match(pattern.regex);
    if (match) {
      return {
        eventType: pattern.category,
        matchedPattern: pattern.name,
        severity: pattern.severity,
        snippet: match[0].slice(0, 100),
      };
    }
  }
  return null;
}
