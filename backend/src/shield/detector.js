// shield/detector.js
// Pattern-based request inspection with evasion-resistant normalization.
// Normalization runs BEFORE pattern matching so encoded/obfuscated
// payloads still get caught.
import { logger } from '../logger.js';

// Scanned per request part, on every request that isn't signature-exempt.
// Kept small on purpose: each pattern is a regex run against attacker-
// controlled text, and a table of hundreds would cost real latency on the hot
// path for diminishing detection value. Adding a signature should mean
// adding a reason it isn't already covered.

// Upper bound on the raw text normalized and pattern-matched per request
// part. express.json accepts 1mb, and normalization alone (three decode
// passes, NFKC, ~10 regex rewrites) plus multi-token patterns is enough to
// block the event loop for minutes on a small instance. Applied BEFORE
// normalization, which is also the cheap direction: percent- and
// entity-decoding only ever shrink the string, so a 64KB window can never
// grow past what it replaced. Head+tail is kept so payloads at either end
// of an oversized part stay detectable.
const MAX_SCAN_CHARS = 65536;

const BENIGN_TEXT_FIELD_RE =
  /(?:^|[_-])(?:message|comment|notes?|description|summary|search|query|content|review|report|feedback|detail|details|bio|about|text)$/i;

function shouldSkipField(key) {
  return typeof key === 'string' && BENIGN_TEXT_FIELD_RE.test(key);
}

function collectScannableValues(value) {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectScannableValues(item));
  }

  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => {
      if (shouldSkipField(key)) return [];
      return collectScannableValues(child);
    });
  }

  return [String(value)];
}

const SQLI_PATTERNS = [
  { name: 'sql_union', regex: /\bunion\b\s+(?:all\s+)?select\b/i },
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
  { name: 'xss_event_handler', regex: /on\w{0,30}\s*=/i },
  { name: 'xss_javascript_uri', regex: /javascript\s*:/i },
  { name: 'xss_iframe', regex: /<iframe[\s\S]{0,500}?<\/iframe>/i },
  { name: 'xss_vbscript', regex: /vbscript\s*:/i },
  { name: 'xss_expression', regex: /expression\s*\(/i },
];

const PATH_TRAVERSAL_PATTERNS = [
  { name: 'path_traversal_dotdot', regex: /\.\.[/\\]/ },
  { name: 'path_traversal_encoded', regex: /%2e%2e[%2f%5c]/i },
];

const CMDI_PATTERNS = [
  {
    name: 'cmdi_subshell',
    regex: /\$\(\s*(cat|curl|wget|id|whoami|uname|sh|bash|nc|perl|python\d?)\b/,
  },
  { name: 'cmdi_backtick', regex: /`\s*(cat|curl|wget|id|whoami|uname|sh|bash|nc)\b/ },
  {
    name: 'cmdi_chain',
    regex: /[;&|]\s*(cat|curl|wget|id|whoami|uname|rm|mv|cp|nc|chmod|chown)\b/,
  },
  { name: 'cmdi_and_chain', regex: /&&\s*(sh|bash|zsh|python\d?|perl|ruby|node)\b/ },
  { name: 'cmdi_reverse_shell', regex: /\/dev\/(tcp|udp)\/\S/ },
  { name: 'cmdi_nc_exec', regex: /\bnc\b[^\n]{0,20}\s-[a-z]*e\b/ },
];

const SSRF_PATTERNS = [
  { name: 'ssrf_cloud_metadata', regex: /\b169\.254\.169\.254\b/ },
  { name: 'ssrf_gcp_metadata', regex: /metadata\.google\.internal/ },
  { name: 'ssrf_aws_v6_metadata', regex: /\[fd00:ec2::254\]/ },
  { name: 'ssrf_file_scheme', regex: /\bfile:\/\// },
  { name: 'ssrf_gopher_scheme', regex: /\bgopher:\/\// },
  { name: 'ssrf_dict_scheme', regex: /\bdict:\/\// },
];

const XXE_PATTERNS = [
  { name: 'xxe_doctype', regex: /<!doctype\s+[a-z]/ },
  { name: 'xxe_entity', regex: /<!entity\s/ },
  { name: 'xxe_system_id', regex: /system\s+["'][^"']*:/ },
];

const LOG4J_PATTERNS = [
  { name: 'log4j_jndi', regex: /\$\{\s*jndi\s*:/ },
  { name: 'log4j_nested', regex: /\$\{\s*\$\{/ },
];

const DESER_PATTERNS = [
  { name: 'deser_java_b64', regex: /\bro0ab/i },
  { name: 'deser_php_object', regex: /\\?"o:\d{1,4}:\\?"[^"\\]{1,64}\\?"/i },
  { name: 'deser_python_pickle', regex: /\\?"__reduce__\\?"\s*:/ },
  { name: 'deser_node_json', regex: /\\?"_type\\?"\s*:\s*\\?"[^"\\]{1,40}\\?"/ },
];

const PROTO_PATTERNS = [
  { name: 'proto_pollution_dunder', regex: /\\?"__proto__\\?"\s*:/ },
  { name: 'proto_pollution_constructor', regex: /constructor\s*\[\s*\\?["']prototype\\?["']\s*\]/ },
  { name: 'proto_pollution_bracket', regex: /\\?["']__proto__\\?["']\s*[,}]/ },
];

const LDAP_PATTERNS = [
  { name: 'ldap_filter_break', regex: /\*\)\s*\(\s*[|&]/ },
  { name: 'ldap_filter_or', regex: /\(\s*[|&]\s*\w+\s*=/ },
];

const NOSQL_PATTERNS = [
  { name: 'nosql_where', regex: /\$where\b/ },
  { name: 'nosql_operator', regex: /"\$(ne|gt|lt|gte|lte|regex|exists|where)"\s*:/ },
];

const SSTI_PATTERNS = [
  { name: 'ssti_arithmetic', regex: /\{\{[^}]{0,40}[\w.]+\s*[*+/-]{1,2}\s*[\d.]+[^}]{0,20}\}\}/ },
  { name: 'ssti_constructor', regex: /\{\{\s*(constructor|__proto__|self|config|class)\b/ },
];

const ALL_PATTERNS = [
  ...SQLI_PATTERNS.map((p) => ({ ...p, category: 'sqli', severity: 'high' })),
  ...XSS_PATTERNS.map((p) => ({ ...p, category: 'xss', severity: 'high' })),
  ...CMDI_PATTERNS.map((p) => ({ ...p, category: 'cmdi', severity: 'high' })),
  ...XXE_PATTERNS.map((p) => ({ ...p, category: 'xxe', severity: 'high' })),
  ...LOG4J_PATTERNS.map((p) => ({ ...p, category: 'log4j', severity: 'high' })),
  ...SSRF_PATTERNS.map((p) => ({ ...p, category: 'ssrf', severity: 'high' })),
  ...DESER_PATTERNS.map((p) => ({ ...p, category: 'deserialization', severity: 'high' })),
  ...PROTO_PATTERNS.map((p) => ({ ...p, category: 'proto_pollution', severity: 'high' })),
  ...LDAP_PATTERNS.map((p) => ({ ...p, category: 'ldap_injection', severity: 'high' })),
  ...NOSQL_PATTERNS.map((p) => ({ ...p, category: 'nosql_injection', severity: 'medium' })),
  ...SSTI_PATTERNS.map((p) => ({ ...p, category: 'ssti', severity: 'high' })),
  ...PATH_TRAVERSAL_PATTERNS.map((p) => ({ ...p, category: 'path_traversal', severity: 'medium' })),
];

function normalizeInput(input) {
  if (input == null) return '';
  let s = String(input);

  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(s);
      if (decoded === s) break;
      s = decoded;
    } catch {
      break;
    }
  }

  s = s
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/gi, '&');

  s = s.normalize('NFKC');
  s = s.toLowerCase();
  s = s.replace(/\0/g, '');
  s = s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/#[^\n]*/g, ' ');
  s = s
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  s = s.replace(/\s+/g, ' ');

  return s.trim();
}

function capForScan(content, part) {
  if (content.length <= MAX_SCAN_CHARS) return content;
  logger.warn(
    { part, originalChars: content.length, scannedChars: MAX_SCAN_CHARS },
    'Shield truncated an oversized request part; content outside the scanned window was not inspected'
  );
  const half = Math.floor(MAX_SCAN_CHARS / 2);
  return `${content.slice(0, half)}\n${content.slice(-half)}`;
}

function extractScannableContent(req) {
  const parts = [];

  const addObject = (value, label) => {
    if (!value || typeof value !== 'object') return;
    const entries = collectScannableValues(value);
    if (entries.length > 0) {
      for (const entry of entries) {
        parts.push(normalizeInput(capForScan(entry, label)));
      }
    }
  };

  addObject(req.query, 'query');
  addObject(req.body, 'body');
  addObject(req.params, 'params');

  if (req.originalUrl) {
    parts.push(normalizeInput(capForScan(req.originalUrl, 'originalUrl')));
  }

  return parts.join(' ');
}

export function normalizeForTest(input) {
  return normalizeInput(input);
}

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

