#!/usr/bin/env python3
"""
Data Backup & Encryption Audit Tool
--------------------------------------------
A real, working scanner for the "Data Backup & Encryption Audit" service
(formerly "Neural Data Vault" on the Alux Plaza site).

What it actually checks (no fake AI, no simulated findings):
  1. Local backup folder scan  - finds sensitive files stored in plaintext
                                  (unencrypted SQL/CSV/JSON exports, .env
                                  files, private keys) and flags weak file
                                  permissions (world-readable files).
  2. Archive encryption check  - for .zip files found, tests whether they
                                  are password-protected (a real functional
                                  test, not a guess based on filename).
  3. Remote backup endpoint    - if a backup destination URL is given,
     transport check             checks it's served over HTTPS with a
                                  valid TLS certificate.
  4. Public bucket exposure    - if an S3-style bucket name is given,
                                  performs a real, passive, anonymous HTTP
                                  request to check whether the bucket
                                  allows public listing (a common and
                                  serious real-world misconfiguration).

Usage:
    python3 backup_audit.py --path /path/to/backup/folder
    python3 backup_audit.py --path ./exports --backup-url https://backups.example.com
    python3 backup_audit.py --path ./exports --s3-bucket my-store-backups

This is a PASSIVE, READ-ONLY tool. It does not modify, delete, decrypt, or
exfiltrate anything. The S3 check is a single anonymous GET request - the
same kind of request any browser makes - not an attack.

IMPORTANT: Only run the local scan against backups/exports you own or are
authorized to review. Only run the bucket/URL checks against
infrastructure you own or have explicit written authorization to test.
"""

import argparse
import os
import stat
import sys
import time
import zipfile
from urllib.parse import urlparse

import requests

# TLS verification is on by default. Set ALUX_INSECURE_TLS=1 only for a
# target whose certificate you cannot validate (self-signed lab host).
VERIFY_TLS = os.environ.get("ALUX_INSECURE_TLS") != "1"

requests.packages.urllib3.disable_warnings()

GOOD = "\033[92m"
WARN = "\033[93m"
BAD = "\033[91m"
INFO = "\033[96m"
END = "\033[0m"

SENSITIVE_EXTENSIONS = {
    ".sql": "database export",
    ".csv": "data export (may contain customer records)",
    ".json": "data export / config",
    ".env": "environment/credentials file",
    ".pem": "private key or certificate",
    ".key": "private key",
    ".p12": "certificate/key bundle",
    ".bak": "raw backup file",
}

ENCRYPTED_INDICATORS = {".gpg", ".pgp", ".enc", ".aes", ".age"}


def status_line(level, msg):
    color = {"PASS": GOOD, "WARN": WARN, "FAIL": BAD, "INFO": INFO}[level]
    print(f"  [{color}{level}{END}] {msg}")


class AuditReport:
    def __init__(self):
        self.findings = []

    def add(self, category, level, message, recommendation=None):
        self.findings.append((category, level, message, recommendation))
        status_line(level, message)

    def summary(self):
        counts = {"PASS": 0, "WARN": 0, "FAIL": 0, "INFO": 0}
        for _, lvl, _, _ in self.findings:
            counts[lvl] += 1
        return counts


def is_world_readable(filepath):
    try:
        mode = os.stat(filepath).st_mode
        return bool(mode & stat.S_IROTH)
    except OSError:
        return False


def scan_local_backups(path, report):
    print(f"\n{INFO}== 1. Local Backup Folder Scan: {path} =={END}")

    if not os.path.isdir(path):
        report.add("local", "FAIL", f"Path '{path}' is not a directory or does not exist.")
        return

    flagged_files = []
    encrypted_files = []
    total_files = 0

    for root, _dirs, files in os.walk(path):
        for fname in files:
            total_files += 1
            full = os.path.join(root, fname)
            ext = os.path.splitext(fname)[1].lower()

            if ext in ENCRYPTED_INDICATORS:
                encrypted_files.append(full)
                continue

            if ext in SENSITIVE_EXTENSIONS:
                world_readable = is_world_readable(full)
                flagged_files.append((full, ext, world_readable))

    if total_files == 0:
        report.add("local", "INFO", "No files found in the given path.")
        return

    report.add("local", "INFO", f"Scanned {total_files} file(s) under '{path}'.")

    if encrypted_files:
        report.add("local", "PASS", f"{len(encrypted_files)} file(s) found with encrypted-format extensions (.gpg/.enc/.aes/etc.) - good sign.")

    if not flagged_files:
        report.add("local", "PASS", "No plaintext sensitive-looking files (SQL/CSV/JSON/env/key exports) found unencrypted.")
    else:
        for full, ext, world_readable in flagged_files:
            kind = SENSITIVE_EXTENSIONS[ext]
            if world_readable:
                report.add(
                    "local", "FAIL",
                    f"'{full}' is a plaintext {kind} AND is world-readable (any local user/process can read it).",
                    "Encrypt this file (e.g. with gpg or age) and restrict permissions (chmod 600)."
                )
            else:
                report.add(
                    "local", "WARN",
                    f"'{full}' is a plaintext {kind} stored unencrypted.",
                    "Encrypt backups/exports at rest, especially any containing customer data (names, emails, addresses, order history)."
                )


def check_archive_encryption(path, report):
    print(f"\n{INFO}== 2. Archive Encryption Check =={END}")

    if not os.path.isdir(path):
        return

    zip_files = []
    for root, _dirs, files in os.walk(path):
        for fname in files:
            if fname.lower().endswith(".zip"):
                zip_files.append(os.path.join(root, fname))

    if not zip_files:
        report.add("archive", "INFO", "No .zip archives found to check.")
        return

    for zpath in zip_files:
        try:
            with zipfile.ZipFile(zpath) as zf:
                needs_password = any(info.flag_bits & 0x1 for info in zf.infolist())
                if needs_password:
                    report.add("archive", "PASS", f"'{zpath}' is password-protected.")
                else:
                    report.add(
                        "archive", "WARN",
                        f"'{zpath}' is a plain, unencrypted zip archive.",
                        "Use a password-protected/encrypted archive format (e.g. 7z with AES-256, or gpg-encrypt the archive) for anything containing customer or business data."
                    )
        except zipfile.BadZipFile:
            report.add("archive", "INFO", f"'{zpath}' could not be read as a zip file (may be corrupted or a different format).")


def check_backup_endpoint_transport(url, report):
    print(f"\n{INFO}== 3. Backup Destination Transport Security =={END}")
    if not url:
        report.add("transport", "INFO", "No --backup-url supplied - skipping remote endpoint check.")
        return

    parsed = urlparse(url)
    if parsed.scheme != "https":
        report.add("transport", "FAIL", f"Backup destination '{url}' is not HTTPS.", "Only send backups over HTTPS/TLS, never plain HTTP or unencrypted FTP.")
        return

    try:
        resp = requests.get(url, timeout=8, verify=True)
        report.add("transport", "PASS", f"Backup destination TLS certificate validates successfully (HTTP {resp.status_code}).")
    except requests.exceptions.SSLError as e:
        report.add("transport", "FAIL", f"TLS certificate validation failed for backup destination: {e}", "Fix the certificate before sending any backups here.")
    except requests.exceptions.RequestException as e:
        report.add("transport", "INFO", f"Could not reach '{url}': {e}")


def check_s3_public_exposure(bucket, report):
    print(f"\n{INFO}== 4. Cloud Storage Public-Exposure Check =={END}")
    if not bucket:
        report.add("cloud", "INFO", "No --s3-bucket supplied - skipping public-exposure check.")
        return

    candidate_urls = [
        f"https://{bucket}.s3.amazonaws.com/",
        f"https://s3.amazonaws.com/{bucket}/",
    ]

    for url in candidate_urls:
        try:
            resp = requests.get(url, timeout=8, verify=VERIFY_TLS)
        except requests.exceptions.RequestException as e:
            report.add("cloud", "INFO", f"Could not reach '{url}': {e}")
            continue

        if resp.status_code == 200 and ("<ListBucketResult" in resp.text or "<Contents>" in resp.text):
            report.add(
                "cloud", "FAIL",
                f"Bucket '{bucket}' allows anonymous public listing at {url} - its contents are exposed to anyone.",
                "Remove public read/list access immediately; use signed URLs or IAM policies for legitimate access instead."
            )
            return
        elif resp.status_code in (403, 401):
            report.add("cloud", "PASS", f"Bucket '{bucket}' correctly denies anonymous access at {url} (HTTP {resp.status_code}).")
            return
        elif resp.status_code == 404:
            continue

    report.add("cloud", "INFO", f"Could not determine bucket status for '{bucket}' definitively - verify manually via your cloud provider's console.")


def main():
    parser = argparse.ArgumentParser(description="Data Backup & Encryption Audit Tool")
    parser.add_argument("--path", help="Local path to a backup/export folder to scan", default=None)
    parser.add_argument("--backup-url", help="URL of a remote backup destination to check for HTTPS/TLS", default=None)
    parser.add_argument("--s3-bucket", help="S3-style bucket name to check for public exposure", default=None)
    args = parser.parse_args()

    if not any([args.path, args.backup_url, args.s3_bucket]):
        print("Error: supply at least one of --path, --backup-url, or --s3-bucket")
        sys.exit(1)

    print(f"{INFO}Data Backup & Encryption Audit{END}")
    print("=" * 60)

    report = AuditReport()

    if args.path:
        scan_local_backups(args.path, report)
        check_archive_encryption(args.path, report)
    else:
        print(f"\n{INFO}== 1-2. Local Backup Folder Scan =={END}")
        report.add("local", "INFO", "No --path supplied - skipping local backup scan.")

    check_backup_endpoint_transport(args.backup_url, report)
    check_s3_public_exposure(args.s3_bucket, report)

    summary = report.summary()
    print("\n" + "=" * 60)
    print(f"{INFO}Summary:{END} "
          f"{GOOD}{summary['PASS']} passed{END}, "
          f"{WARN}{summary['WARN']} warnings{END}, "
          f"{BAD}{summary['FAIL']} failed{END}, "
          f"{INFO}{summary['INFO']} info{END}")


if __name__ == "__main__":
    main()
