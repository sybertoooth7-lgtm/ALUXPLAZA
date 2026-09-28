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
  // \w+ is capped: unbounded, it backtracks once per character from every
  // 'on' in the input, so a 64KB body of "ononon..." cost ~2.6s. Real
  // handler names top out well under 30 characters.
  { name: 'xss_event_handler', regex: /on\w{0,30}\s*=/i },
  { name: 'xss_javascript_uri', regex: /javascript\s*:/i },
  // Same nested-quantifier shape as xss_script_tag, and far worse: this hung
  // outright at 16KB. Bounded the same way.
  { name: 'xss_iframe', regex: /<iframe[\s\S]{0,500}?<\/iframe>/i },
  { name: 'xss_vbscript', regex: /vbscript\s*:/i },
  { name: 'xss_expression', regex: /expression\s*\(/i },
];

const PATH_TRAVERSAL_PATTERNS = [
  { name: 'path_traversal_dotdot', regex: /\.\.[/\\]/ },
  { name: 'path_traversal_encoded', regex: /%2e%2e[%2f%5c]/i },
];

// Command injection. Each alternative is anchored to a shell metacharacter
// immediately preceding a command name, rather than matching the command
// name bare — "cat" or "id" appear in ordinary prose ("update your id",
// "contact us") and matching them bare would block innocent requests. The
// leading [;&|`$] is what makes these injection-shaped instead of English.
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
  // `&&` before a shell invocation is the classic "first command failed, run
  // this instead" shape.
  { name: 'cmdi_and_chain', regex: /&&\s*(sh|bash|zsh|python\d?|perl|ruby|node)\b/ },
  // Reverse shell: bash -i >& /dev/tcp/…, nc -e /bin/sh …
  { name: 'cmdi_reverse_shell', regex: /\/dev\/(tcp|udp)\/\S/ },
  { name: 'cmdi_nc_exec', regex: /\bnc\b[^\n]{0,20}\s-[a-z]*e\b/ },
];

// SSRF. Deliberately limited to targets that are never legitimate in a
// browser request: the cloud metadata endpoints and the non-HTTP URL
// schemes that reach local files and internal listeners. A bare
// 169.254.169.254 or "localhost" alone is not matched, because those appear
// in ordinary text (a support ticket about a customer's local server, a blog
// post in a notes field) and would block real users for no security gain.
const SSRF_PATTERNS = [
  { name: 'ssrf_cloud_metadata', regex: /\b169\.254\.169\.254\b/ },
  { name: 'ssrf_gcp_metadata', regex: /metadata\.google\.internal/ },
  { name: 'ssrf_aws_v6_metadata', regex: /\[fd00:ec2::254\]/ },
  { name: 'ssrf_file_scheme', regex: /\bfile:\/\// },
  { name: 'ssrf_gopher_scheme', regex: /\bgopher:\/\// },
  { name: 'ssrf_dict_scheme', regex: /\bdict:\/\// },
];

// XXE and log4j / JNDI lookup. These are high-signal: a <!DOCTYPE or a
// ${jndi: reference has no place in a JSON API request body.
const XXE_PATTERNS = [
  { name: 'xxe_doctype', regex: /<!doctype\s+[a-z]/ },
  { name: 'xxe_entity', regex: /<!entity\s/ },
  { name: 'xxe_system_id', regex: /system\s+["'][^"']*:/ },
];

const LOG4J_PATTERNS = [
  { name: 'log4j_jndi', regex: /\$\{\s*jndi\s*:/ },
  // Obfuscated nesting, e.g. ${${lower:j}ndi:...}
  { name: 'log4j_nested', regex: /\$\{\s*\$\{/ },
];

// Deserialization. Magic bytes / markers rather than class names, because
// a class name alone ("java.lang.Runtime", "ObjectInputStream") shows up in
// error messages and blog posts pasted into free text.
//
// Every pattern here has to be written against the NORMALIZED string, which
// shapes them in two ways that are easy to get wrong:
//
//   1. normalizeInput() lowercases, so anything matching literal bytes has to
//      be /i. The Java serialized-object magic is \xac\xed\x00\x05 and its
//      base64 form rO0AB — case-sensitive here means it can never match.
//   2. The body is JSON.stringify'd before scanning, so a quote inside a
//      string value arrives as \" . Patterns anchored on a bare "key" have to
//      tolerate the optional backslash, or they only ever match a key at the
//      top level of the object.
//
// NOTE: there is deliberately no pattern for the raw \xac\xed\x00\x05 byte
// sequence. normalizeInput() step 7 decodes \xNN escapes, so by the time
// patterns run that sequence is already decoded to binary and can no longer
// be recognised as itself. The base64 form survives normalization intact,
// which is why that is what is matched — a signature for the raw form would
// be dead code that reads as coverage.
const DESER_PATTERNS = [
  // The Java serialized-object magic \xac\xed\x00\x05 is `rO0AB` in base64,
  // and lowercasing turns that into `ro0ab` — the `o` is part of the prefix,
  // not a separator. (An earlier version wrote /r0ab/i, which could never
  // match anything.)
  { name: 'deser_java_b64', regex: /\bro0ab/i },
  { name: 'deser_php_object', regex: /\\?"o:\d{1,4}:\\?"[^"\\]{1,64}\\?"/i },
  { name: 'deser_python_pickle', regex: /\\?"__reduce__\\?"\s*:/ },
  { name: 'deser_node_json', regex: /\\?"_type\\?"\s*:\s*\\?"[^"\\]{1,40}\\?"/ },
];

// Prototype pollution. Relevant because this app parses attacker-supplied
// JSON into objects, and a __proto__ key survives JSON.parse as an own
// property on some paths. Same normalization constraints as above: the
// optional backslash before each quote is what makes these match a payload
// arriving inside a JSON string value.
const PROTO_PATTERNS = [
  { name: 'proto_pollution_dunder', regex: /\\?"__proto__\\?"\s*:/ },
  { name: 'proto_pollution_constructor', regex: /constructor\s*\[\s*\\?["']prototype\\?["']\s*\]/ },
  { name: 'proto_pollution_bracket', regex: /\\?["']__proto__\\?["']\s*[,}]/ },
];

// LDAP / header injection. CRLF is deliberately absent: normalizeInput()
// collapses all whitespace — including the \r\n that percent-decoding
// produces — to a single space before patterns run, so a %0d%0a payload is
// no longer recognizable by the time matching happens. A pattern for it
// would be dead code that looks like coverage. Express itself rejects raw
// CRLF in header values, so the transport-level defence is already in place.
const LDAP_PATTERNS = [
  { name: 'ldap_filter_break', regex: /\*\)\s*\(\s*[|&]/ },
  { name: 'ldap_filter_or', regex: /\(\s*[|&]\s*\w+\s*=/ },
];

// NoSQL operator injection. This app is Postgres-only, so these are not
// exploitable today; they are cheap to detect and would be the first thing an
// attacker tried if a document store were ever introduced.
const NOSQL_PATTERNS = [
  { name: 'nosql_where', regex: /\$where\b/ },
  { name: 'nosql_operator', regex: /"\$(ne|gt|lt|gte|lte|regex|exists|where)"\s*:/ },
];

// Server-side template injection. Both halves are required, which is what
// keeps it off ordinary prose: "use {{ and }} for emphasis" is not a match,
// but {{constructor}} and {{7*7}} are.
const SSTI_PATTERNS = [
  { name: 'ssti_arithmetic', regex: /\{\{[^}]{0,40}[\w.]+\s*[*+/-]{1,2}\s*[\d.]+[^}]{0,20}\}\}/ },
  { name: 'ssti_constructor', regex: /\{\{\s*(constructor|__proto__|self|config|class)\b/ },
];

// Order is significant: scanRequest() returns the FIRST match, so a category
// that tends to appear *inside* another category's payload must be tested
// first or it will never be the one reported. `<!ENTITY x SYSTEM
// "file:///etc/passwd">` contains both an XXE and an SSRF signature; XXE is
// the more specific finding, so it is tested first.
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
  // Kept last, and at medium, so it stays the lowest-signal category: a
  // legitimate request can contain "../" in a search box more plausibly than
  // it can contain "union select".
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
//
// The cap is not free: content in the omitted middle is never inspected. That
// is logged rather than left silent, so an oversized body shows up in the logs
// instead of quietly going unscanned.
function capForScan(content, part) {
  if (content.length <= MAX_SCAN_CHARS) return content;
  logger.warn(
    { part, originalChars: content.length, scannedChars: MAX_SCAN_CHARS },
    'Shield truncated an oversized request part; content outside the scanned window was not inspected'
  );
  const half = Math.floor(MAX_SCAN_CHARS / 2);
  return `${content.slice(0, half)}\n${content.slice(-half)}`;
}

/**
 * Flattens req.query, req.body, req.params, req.originalUrl into a
 * single normalized string for scanning.
 */
function extractScannableContent(req) {
  const parts = [];
  if (req.query) parts.push(normalizeInput(capForScan(JSON.stringify(req.query), 'query')));
  if (req.body) parts.push(normalizeInput(capForScan(JSON.stringify(req.body), 'body')));
  if (req.params) parts.push(normalizeInput(capForScan(JSON.stringify(req.params), 'params')));
  if (req.originalUrl) {
    parts.push(normalizeInput(capForScan(req.originalUrl, 'originalUrl')));
  }
  return parts.join(' ');
}

/**
 * Exposed for tests that need to reason about what patterns actually see.
 * Patterns run against the NORMALIZED string, not the raw input, so a
 * signature written against raw text can silently never match — the probe
 * this backs is how that gets caught.
 */
export function normalizeForTest(input) {
  return normalizeInput(input);
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
