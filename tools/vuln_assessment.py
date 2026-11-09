#!/usr/bin/env python3
"""
Vulnerability Assessment & Risk Scoring Tool
--------------------------------------------
A real, working scanner for the "Vulnerability Assessment & Risk Scoring"
service (formerly "Predictive Risk Engine" on the Alux Plaza site).

What it actually checks (no fake AI, no simulated findings):
  1. Exposed sensitive paths - a capped list of paths that should never
                                be publicly reachable (.git internals,
                                .env files, common backup/config files)
                                tested with real HTTP requests.
  2. Software fingerprinting  - Server/X-Powered-By headers and generator
                                meta tags, to flag outdated or disclosed
                                software versions (attackers use this
                                same information to target known CVEs).
  3. Weak TLS protocol support - attempts real handshakes forcing legacy
                                TLS 1.0/1.1, which should be rejected by
                                a properly hardened server.
  4. security.txt presence    - a real, checkable best-practice signal
                                (RFC 9116) for whether the site has a
                                disclosed vulnerability-reporting channel.

Findings are aggregated into a weighted risk score (0-100, lower is
better) using a simple, transparent rubric printed alongside the score -
not an opaque AI prediction.

Usage:
    python3 vuln_assessment.py https://example.com

This is a PASSIVE, READ-ONLY, NON-DESTRUCTIVE tool. Every check is an
ordinary HTTP GET request or standard TLS handshake attempt - the same
category of request a browser makes - never an exploitation attempt.

IMPORTANT: Only run this against sites you own or have explicit written
authorization to test.
"""

import argparse
import os
import re
import socket
import ssl
import sys
import warnings
from urllib.parse import urljoin, urlparse

import requests

# TLS verification is on by default. Set ALUX_INSECURE_TLS=1 only for a
# target whose certificate you cannot validate (self-signed lab host).
VERIFY_TLS = os.environ.get("ALUX_INSECURE_TLS") != "1"

warnings.filterwarnings("ignore", category=DeprecationWarning)

requests.packages.urllib3.disable_warnings()

GOOD = "\033[92m"
WARN = "\033[93m"
BAD = "\033[91m"
INFO = "\033[96m"
END = "\033[0m"

# Severity weights for the risk score (higher = worse)
SEVERITY_WEIGHT = {"FAIL": 10, "WARN": 4, "PASS": 0, "INFO": 0}

# A capped, deliberately small list of sensitive paths that should never
# be publicly exposed. Not a directory brute-force wordlist.
SENSITIVE_PATHS = {
    "/.git/HEAD": "Git repository internals",
    "/.env": "Environment/credentials file",
    "/.env.local": "Environment/credentials file",
    "/config.json": "Configuration file",
    "/wp-config.php.bak": "WordPress config backup",
    "/backup.zip": "Backup archive",
    "/.DS_Store": "macOS directory metadata (reveals file listing)",
    "/server-status": "Apache server-status (internals disclosure)",
}


def status_line(level, msg):
    color = {"PASS": GOOD, "WARN": WARN, "FAIL": BAD, "INFO": INFO}[level]
    print(f"  [{color}{level}{END}] {msg}")


class RiskReport:
    def __init__(self, target):
        self.target = target
        self.findings = []

    def add(self, category, level, message, recommendation=None):
        self.findings.append((category, level, message, recommendation))
        status_line(level, message)

    def summary(self):
        counts = {"PASS": 0, "WARN": 0, "FAIL": 0, "INFO": 0}
        for _, lvl, _, _ in self.findings:
            counts[lvl] += 1
        return counts

    def risk_score(self):
        """
        Transparent, weighted risk score. Not a black-box AI prediction -
        just: sum of severity weights, capped at 100, so the client can
        see exactly how the number was derived.
        """
        raw = sum(SEVERITY_WEIGHT[lvl] for _, lvl, _, _ in self.findings)
        return min(raw, 100)

    def risk_category(self):
        score = self.risk_score()
        if score == 0:
            return "Minimal"
        elif score <= 15:
            return "Low"
        elif score <= 40:
            return "Moderate"
        elif score <= 70:
            return "High"
        else:
            return "Critical"


def check_exposed_paths(session, base_url, report):
    print(f"\n{INFO}== 1. Exposed Sensitive Paths =={END}")

    # Establish a baseline: many sites (especially SPAs or username-routed
    # platforms like GitHub) return HTTP 200 with a generic app shell for
    # ANY path. Compare against a random, definitely-nonexistent path so
    # we don't flag that generic behavior as a real exposure.
    baseline_content = None
    try:
        baseline_url = urljoin(base_url, "/definitely-nonexistent-path-audit-baseline-8f2k1")
        baseline_resp = session.get(baseline_url, timeout=8, verify=VERIFY_TLS, allow_redirects=False)
        if baseline_resp.status_code == 200:
            baseline_content = baseline_resp.content
    except requests.exceptions.RequestException:
        pass

    found_any = False
    for path, description in SENSITIVE_PATHS.items():
        url = urljoin(base_url, path)
        try:
            resp = session.get(url, timeout=8, verify=VERIFY_TLS, allow_redirects=False)
            if resp.status_code != 200 or len(resp.content) == 0:
                continue
            if baseline_content is not None and resp.content == baseline_content:
                # Same content as a known-fake path - this is a catch-all/SPA
                # response, not a real exposure of this specific file.
                continue
            found_any = True
            report.add(
                "exposure", "FAIL",
                f"'{path}' ({description}) is publicly accessible (HTTP 200) with distinct content.",
                f"Block public access to {path} immediately - e.g. via web server config or removing it from the deployed directory."
            )
        except requests.exceptions.RequestException:
            pass

    if not found_any:
        report.add("exposure", "PASS", f"None of {len(SENSITIVE_PATHS)} checked sensitive paths are publicly exposed.")


def fingerprint_software(session, base_url, report):
    print(f"\n{INFO}== 2. Software Fingerprinting =={END}")
    try:
        resp = session.get(base_url, timeout=8, verify=VERIFY_TLS)
    except requests.exceptions.RequestException as e:
        report.add("fingerprint", "INFO", f"Could not fetch target: {e}")
        return

    headers = {k.lower(): v for k, v in resp.headers.items()}
    disclosed = []

    if "server" in headers:
        disclosed.append(f"Server: {headers['server']}")
    if "x-powered-by" in headers:
        disclosed.append(f"X-Powered-By: {headers['x-powered-by']}")

    generator_match = re.search(r'<meta[^>]+name=["\']generator["\'][^>]+content=["\']([^"\']+)["\']', resp.text, re.IGNORECASE)
    if generator_match:
        disclosed.append(f"generator meta tag: {generator_match.group(1)}")

    if disclosed:
        report.add(
            "fingerprint", "WARN",
            f"Software/version information disclosed: {'; '.join(disclosed)}.",
            "Suppress version disclosure where possible (remove/generalize Server and X-Powered-By headers, remove generator meta tags) to reduce targeted attacks against known CVEs for that specific version."
        )
    else:
        report.add("fingerprint", "PASS", "No obvious software/version disclosure found in headers or meta tags.")


def check_weak_tls(host, report):
    print(f"\n{INFO}== 3. Legacy TLS Protocol Support =={END}")

    legacy_protocols = []
    if hasattr(ssl, "TLSVersion"):
        legacy_protocols = [
            ("TLSv1.0", ssl.TLSVersion.TLSv1, ssl.TLSVersion.TLSv1),
            ("TLSv1.1", ssl.TLSVersion.TLSv1_1, ssl.TLSVersion.TLSv1_1),
        ]

    if not legacy_protocols:
        report.add("tls", "INFO", "Python ssl module does not support explicit legacy-protocol testing on this system.")
        return

    any_legacy_accepted = False
    for name, min_v, max_v in legacy_protocols:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        try:
            context.minimum_version = min_v
            context.maximum_version = max_v
        except (ValueError, AttributeError):
            continue

        try:
            with socket.create_connection((host, 443), timeout=8) as sock:
                with context.wrap_socket(sock, server_hostname=host) as ssock:
                    negotiated = ssock.version()
            any_legacy_accepted = True
            report.add(
                "tls", "FAIL",
                f"Server accepted a connection using legacy {negotiated} - this protocol has known weaknesses and should be disabled.",
                "Disable TLS 1.0 and 1.1 server-side; require TLS 1.2 or higher."
            )
        except ssl.SSLError:
            report.add("tls", "PASS", f"Server correctly rejected legacy {name}.")
        except (socket.timeout, ConnectionRefusedError, OSError) as e:
            report.add("tls", "INFO", f"Could not test {name}: {e}")

    if not any_legacy_accepted:
        pass  # individual PASS lines already added


def check_security_txt(session, base_url, report):
    print(f"\n{INFO}== 4. security.txt (RFC 9116) =={END}")
    for path in ["/.well-known/security.txt", "/security.txt"]:
        url = urljoin(base_url, path)
        try:
            resp = session.get(url, timeout=8, verify=VERIFY_TLS)
            if resp.status_code == 200 and "contact" in resp.text.lower():
                report.add("disclosure", "PASS", f"security.txt found at {path} with a contact field - good practice for coordinated vulnerability disclosure.")
                return
        except requests.exceptions.RequestException:
            pass
    report.add(
        "disclosure", "WARN",
        "No security.txt found.",
        "Consider adding a /.well-known/security.txt file (RFC 9116) so security researchers have a clear, safe channel to report vulnerabilities to you."
    )


def main():
    parser = argparse.ArgumentParser(description="Vulnerability Assessment & Risk Scoring Tool")
    parser.add_argument("url", help="Base URL of the site to assess, e.g. https://example.com")
    args = parser.parse_args()

    parsed = urlparse(args.url)
    if not parsed.scheme:
        print("Error: URL must include scheme, e.g. https://example.com")
        sys.exit(1)

    print(f"{INFO}Vulnerability Assessment & Risk Scoring{END}")
    print(f"Target: {args.url}")
    print("=" * 60)

    session = requests.Session()
    session.headers.update({"User-Agent": "VulnAssessmentTool/1.0 (authorized-security-review)"})

    report = RiskReport(args.url)
    check_exposed_paths(session, args.url, report)
    fingerprint_software(session, args.url, report)
    check_weak_tls(parsed.netloc, report)
    check_security_txt(session, args.url, report)

    summary = report.summary()
    score = report.risk_score()
    category = report.risk_category()

    print("\n" + "=" * 60)
    print(f"{INFO}Findings:{END} "
          f"{GOOD}{summary['PASS']} passed{END}, "
          f"{WARN}{summary['WARN']} warnings{END}, "
          f"{BAD}{summary['FAIL']} failed{END}, "
          f"{INFO}{summary['INFO']} info{END}")

    score_color = GOOD if score <= 15 else (WARN if score <= 40 else BAD)
    print(f"\n{INFO}Risk Score:{END} {score_color}{score}/100 ({category}){END}")
    print(f"{INFO}Scoring method:{END} each FAIL adds 10 points, each WARN adds 4 points, "
          f"PASS/INFO add 0 - a transparent sum, not an opaque prediction. "
          f"Capped at 100.")


if __name__ == "__main__":
    main()
