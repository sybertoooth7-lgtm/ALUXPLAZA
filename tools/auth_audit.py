#!/usr/bin/env python3
"""
Access Control & Authentication Audit Tool
------------------------------------------
A real, working scanner for the "Access Control & Authentication Audit" service.
"""

import argparse
import os
import base64
import io
import json
import sys
import time
from urllib.parse import urljoin, urlparse

import requests
import urllib3

# TLS verification is on by default. Set ALUX_INSECURE_TLS=1 only for a
# target whose certificate you cannot validate (self-signed lab host).
VERIFY_TLS = os.environ.get("ALUX_INSECURE_TLS") != "1"

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

GOOD = "\033[92m"
WARN = "\033[93m"
BAD = "\033[91m"
INFO = "\033[96m"
END = "\033[0m"

def status_line(level, msg, quiet=False):
    if quiet:
        return
    color = {"PASS": GOOD, "WARN": WARN, "FAIL": BAD, "INFO": INFO}[level]
    print(f" [{color}{level}{END}] {msg}")

class AuthAuditReport:
    def __init__(self, target, quiet=False):
        self.target = target
        self.quiet = quiet
        self.findings = []

    def add(self, category, level, message, recommendation=None):
        self.findings.append((category, level, message, recommendation))
        status_line(level, message, quiet=self.quiet)

    def to_dict(self):
        return {
            "target": self.target,
            "generated": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
            "findings": [
                {"category": c, "level": lvl, "message": m, "recommendation": r}
                for c, lvl, m, r in self.findings
            ],
            "summary": self.summary(),
        }

    def summary(self):
        counts = {"PASS": 0, "WARN": 0, "FAIL": 0, "INFO": 0}
        for _, lvl, _, _ in self.findings:
            counts[lvl] += 1
        return counts

def check_transport_security(session, base_url, report):
    print(f"\n{INFO}== 1. Transport Security =={END}")
    parsed = urlparse(base_url)

    if parsed.scheme != "https":
        report.add("transport", "FAIL", "Site is being served over plain HTTP.", "Serve all traffic over HTTPS.")
        return

    try:
        http_url = "http://" + parsed.netloc + parsed.path
        resp = session.get(http_url, allow_redirects=False, timeout=8, verify=VERIFY_TLS)
        if resp.status_code in (301, 302, 307, 308) and resp.headers.get("Location", "").startswith("https"):
            report.add("transport", "PASS", "HTTP requests are redirected to HTTPS.")
        else:
            report.add("transport", "WARN", f"HTTP endpoint responded with {resp.status_code} instead of redirecting to HTTPS.", "Force a 301 redirect from HTTP to HTTPS.")
    except requests.exceptions.RequestException:
        report.add("transport", "PASS", "Plain HTTP does not appear to be served.")

    try:
        resp = session.get(base_url, timeout=8, verify=True)
        report.add("transport", "PASS", "TLS certificate validates successfully.")
    except requests.exceptions.SSLError as e:
        report.add("transport", "FAIL", f"TLS certificate validation failed: {e}", "Install a valid certificate.")

def check_security_headers(session, base_url, report):
    print(f"\n{INFO}== 2. Security Headers =={END}")
    try:
        resp = session.get(base_url, timeout=8, verify=VERIFY_TLS)
    except requests.exceptions.RequestException as e:
        report.add("headers", "FAIL", f"Could not fetch target: {e}")
        return

    headers = {k.lower(): v for k, v in resp.headers.items()}

    checks = [
        ("strict-transport-security", "HSTS", "Add 'Strict-Transport-Security: max-age=31536000; includeSubDomains'."),
        ("x-content-type-options", "X-Content-Type-Options", "Add 'X-Content-Type-Options: nosniff'."),
        ("x-frame-options", "X-Frame-Options", "Add 'X-Frame-Options: DENY' or CSP frame-ancestors."),
        ("content-security-policy", "Content-Security-Policy", "Add a CSP to restrict script sources."),
        ("referrer-policy", "Referrer-Policy", "Add 'Referrer-Policy: strict-origin-when-cross-origin'."),
    ]

    for header_key, label, rec in checks:
        if header_key in headers:
            report.add("headers", "PASS", f"{label} header is present.")
        else:
            report.add("headers", "WARN", f"{label} header is missing.", rec)

    server_header = headers.get("server") or headers.get("x-powered-by")
    if server_header:
        report.add("headers", "WARN", f"Server version disclosed: '{server_header}'.", "Suppress Server/X-Powered-By headers.")
    else:
        report.add("headers", "PASS", "No Server/X-Powered-By version disclosure.")

def check_cookies(session, base_url, report):
    print(f"\n{INFO}== 3. Cookie Security =={END}")
    try:
        resp = session.get(base_url, timeout=8, verify=VERIFY_TLS)
    except requests.exceptions.RequestException as e:
        report.add("cookies", "FAIL", f"Could not fetch target: {e}")
        return

    if not resp.cookies:
        report.add("cookies", "INFO", "No cookies set on landing page.")
        return

    for cookie in resp.cookies:
        flags = []
        if not cookie.secure:
            flags.append("missing Secure flag")
        httponly = cookie._rest.get("HttpOnly", False) if hasattr(cookie, "_rest") else False
        if not httponly:
            flags.append("missing HttpOnly flag")
        samesite = cookie._rest.get("SameSite") if hasattr(cookie, "_rest") else None
        if not samesite:
            flags.append("missing SameSite attribute")

        if flags:
            report.add("cookies", "WARN", f"Cookie '{cookie.name}': {', '.join(flags)}.", "Set Secure, HttpOnly, and SameSite on all session cookies.")
        else:
            report.add("cookies", "PASS", f"Cookie '{cookie.name}' has all security flags set.")

def check_jwt(jwt_token, report):
    print(f"\n{INFO}== 4. JWT Hygiene =={END}")
    if not jwt_token:
        report.add("jwt", "INFO", "No JWT supplied — skipping token analysis.")
        return

    parts = jwt_token.split(".")
    if len(parts) != 3:
        report.add("jwt", "FAIL", "Provided token is not a standard 3-part JWT.")
        return

    def b64decode(segment):
        padded = segment + "=" * (-len(segment) % 4)
        return json.loads(base64.urlsafe_b64decode(padded))

    try:
        header = b64decode(parts[0])
        payload = b64decode(parts[1])
    except Exception as e:
        report.add("jwt", "FAIL", f"Could not decode JWT: {e}")
        return

    alg = header.get("alg", "").lower()
    if alg == "none":
        report.add("jwt", "FAIL", "JWT uses alg=none — signature is not verified.", "Reject alg=none tokens server-side.")
    elif alg.startswith("hs"):
        report.add("jwt", "WARN", f"JWT uses symmetric algorithm '{alg.upper()}'.", "Ensure the HMAC secret is long and random.")
    elif alg.startswith("rs") or alg.startswith("es"):
        report.add("jwt", "PASS", f"JWT uses asymmetric algorithm '{alg.upper()}'.")
    else:
        report.add("jwt", "WARN", f"Unrecognized algorithm '{alg}'.")

    if "exp" not in payload:
        report.add("jwt", "FAIL", "JWT has no 'exp' claim — token never expires.", "Always set a short expiry.")
    else:
        exp = payload["exp"]
        remaining = exp - time.time()
        if remaining < 0:
            report.add("jwt", "INFO", "Supplied token is already expired.")
        elif remaining > 60 * 60 * 24:
            report.add("jwt", "WARN", f"Token expiry is unusually long ({remaining/3600:.1f} hours).", "Shorten access-token lifetime.")
        else:
            report.add("jwt", "PASS", f"Token expiry is reasonable ({remaining/60:.0f} minutes remaining).")

    sensitive_keys = {"password", "ssn", "credit_card", "secret"}
    leaked = sensitive_keys.intersection(k.lower() for k in payload.keys())
    if leaked:
        report.add("jwt", "FAIL", f"Payload contains sensitive claim(s): {', '.join(leaked)}.", "Never place sensitive data in JWT payload.")
    else:
        report.add("jwt", "PASS", "No obviously sensitive fields found in JWT payload.")

def check_login_hardening(session, base_url, login_path, report, attempts=5):
    print(f"\n{INFO}== 5. Login Endpoint Hardening (passive probe, {attempts} requests max) =={END}")
    if not login_path:
        report.add("login", "INFO", "No --login-path supplied — skipping login hardening probe.")
        return

    login_url = urljoin(base_url, login_path)
    statuses = []
    try:
        for i in range(attempts):
            resp = session.post(
                login_url,
                json={"username": "audit_test_user_do_not_use", "password": "audit_test_invalid"},
                timeout=8, verify=VERIFY_TLS
            )
            statuses.append(resp.status_code)
            time.sleep(0.5)
    except requests.exceptions.RequestException as e:
        report.add("login", "INFO", f"Could not reach login endpoint: {e}")
        return

    if any(s == 429 for s in statuses):
        report.add("login", "PASS", "Login endpoint returned HTTP 429 (rate limited).")
    elif len(set(statuses)) == 1 and statuses.count(statuses[0]) == attempts:
        report.add("login", "WARN", f"No rate-limiting observed after {attempts} rapid attempts.", "Add rate limiting and account lockout.")
    else:
        report.add("login", "INFO", f"Mixed responses observed: {statuses}. Manual review recommended.")

def main():
    parser = argparse.ArgumentParser(description="Access Control & Authentication Audit Tool")
    parser.add_argument("url", help="Base URL, e.g. https://example.com")
    parser.add_argument("--login-path", help="Path to login endpoint", default=None)
    parser.add_argument("--jwt", help="Sample JWT to analyze", default=None)
    parser.add_argument("--attempts", type=int, default=5, help="Requests for rate-limit probe")
    parser.add_argument("--out", help="Write JSON report to file", default=None)
    parser.add_argument("--json", action="store_true", help="Output only JSON")
    args = parser.parse_args()

    if not urlparse(args.url).scheme:
        if args.json:
            print(json.dumps({"error": "URL must include scheme, e.g. https://example.com"}))
        else:
            print("Error: URL must include scheme.")
        sys.exit(1)

    if not args.json:
        print(f"{INFO}Access Control & Authentication Audit{END}")
        print(f"Target: {args.url}")
        print("=" * 60)

    session = requests.Session()
    session.headers.update({"User-Agent": "AuthAuditTool/1.0 (authorized-security-review)"})

    report = AuthAuditReport(args.url, quiet=args.json)

    if args.json:
        real_stdout = sys.stdout
        sys.stdout = io.StringIO()
        try:
            check_transport_security(session, args.url, report)
            check_security_headers(session, args.url, report)
            check_cookies(session, args.url, report)
            check_jwt(args.jwt, report)
            check_login_hardening(session, args.url, args.login_path, report, attempts=args.attempts)
        finally:
            sys.stdout = real_stdout
    else:
        check_transport_security(session, args.url, report)
        check_security_headers(session, args.url, report)
        check_cookies(session, args.url, report)
        check_jwt(args.jwt, report)
        check_login_hardening(session, args.url, args.login_path, report, attempts=args.attempts)

    summary = report.summary()

    if args.json:
        print(json.dumps(report.to_dict(), indent=2))
    else:
        print("\n" + "=" * 60)
        print(f"{INFO}Summary:{END} "
              f"{GOOD}{summary['PASS']} passed{END}, "
              f"{WARN}{summary['WARN']} warnings{END}, "
              f"{BAD}{summary['FAIL']} failed{END}, "
              f"{INFO}{summary['INFO']} info{END}")

    if args.out:
        with open(args.out, "w") as f:
            json.dump(report.to_dict(), f, indent=2)
        if not args.json:
            print(f"\nJSON report written to {args.out}")

if __name__ == "__main__":
    main()
