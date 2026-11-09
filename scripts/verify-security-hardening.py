#!/usr/bin/env python3
"""Static verification for the ALUXPLAZA security hardening changes.

Runs without Node or a database so it can gate a PR before the slower test
suite. Every check is an invariant that a later refactor could silently
undo; the script fails loudly instead of assuming the code still matches the
review it came from.

Usage:
    python3 scripts/verify-security-hardening.py [--root PATH]
"""

import argparse
import re
import sys
from pathlib import Path

CHECKS = []


def check(name):
    def register(fn):
        CHECKS.append((name, fn))
        return fn

    return register


def read(root, relative):
    return (root / relative).read_text(encoding="utf-8")


def require(text, needle, where):
    if needle not in text:
        raise AssertionError(f"{where}: missing {needle!r}")


@check("config exposes per-plane JWT secrets with JWT_SECRET fallback")
def check_config(root):
    text = read(root, "backend/src/config.js")
    for name in ("jwtAdminSecret", "jwtClientSecret", "mfaTokenSecret"):
        require(text, name, "config.js")
    require(text, "process.env.JWT_ADMIN_SECRET || jwtSecret", "config.js")
    require(text, "process.env.JWT_CLIENT_SECRET || jwtSecret", "config.js")
    require(text, "process.env.MFA_TOKEN_SECRET || jwtSecret", "config.js")


@check("admin session auth uses admin key and requires admin_access")
def check_admin_auth(root):
    text = read(root, "backend/src/middleware/auth.js")
    require(text, "config.jwtAdminSecret", "auth.js")
    require(text, "decoded.type !== 'admin_access'", "auth.js")
    if "config.jwtSecret" in text:
        raise AssertionError("auth.js still references the shared jwtSecret")


@check("client session auth uses client key and requires client_access")
def check_client_auth(root):
    text = read(root, "backend/src/middleware/clientAuth.js")
    require(text, "config.jwtClientSecret", "clientAuth.js")
    require(text, "decoded.type !== 'client_access'", "clientAuth.js")
    if "config.jwtSecret" in text:
        raise AssertionError("clientAuth.js still references the shared jwtSecret")


@check("session tokens are signed with a plane key and an explicit type")
def check_session_signing(root):
    admin = read(root, "backend/src/routes/admin.js")
    client = read(root, "backend/src/routes/clientAuth.js")
    if admin.count("type: 'admin_access'") != 2:
        raise AssertionError("admin.js should tag exactly two session tokens")
    if admin.count("config.jwtAdminSecret") != 2:
        raise AssertionError("admin.js should sign exactly two session tokens with jwtAdminSecret")
    require(client, "type: 'client_access'", "clientAuth.js")
    require(client, "config.jwtClientSecret", "clientAuth.js")


@check("MFA challenge uses its own key")
def check_mfa_key(root):
    text = read(root, "backend/src/lib/mfa.js")
    require(text, "config.mfaTokenSecret", "mfa.js")
    if "jwt.sign({ sub: userId, email, type: 'mfa_challenge' }, config.jwtSecret" in text:
        raise AssertionError("MFA challenge still signed with JWT_SECRET")
    if "jwt.verify(token, config.jwtSecret" in text:
        raise AssertionError("MFA challenge still verified with JWT_SECRET")


@check("Shield requires corroboration before persisting a signature block")
def check_shield_corroboration(root):
    guard = read(root, "backend/src/shield/bruteForceGuard.js")
    middleware = read(root, "backend/src/middleware/shieldMiddleware.js")
    require(guard, "export async function corroborateSignatureMatch", "bruteForceGuard.js")
    require(guard, "SIGNATURE_THRESHOLD", "bruteForceGuard.js")
    require(middleware, "corroborateSignatureMatch", "shieldMiddleware.js")
    require(middleware, "shouldPersistBlock", "shieldMiddleware.js")
    if re.search(r"if \(attributable\) \{\s*try \{\s*await blockIp", middleware):
        raise AssertionError("shieldMiddleware still blocks on the first signature match")


@check("Shield identity decoding uses the right plane key and type")
def check_shield_identity(root):
    text = read(root, "backend/src/middleware/shieldMiddleware.js")
    require(text, "config.jwtAdminSecret", "shieldMiddleware.js")
    require(text, "config.jwtClientSecret", "shieldMiddleware.js")
    if "config.jwtSecret" in text:
        raise AssertionError("shieldMiddleware.js still references the shared jwtSecret")


@check("CSRF token rotates when a session is issued")
def check_csrf_rotation(root):
    csrf = read(root, "backend/src/middleware/csrf.js")
    admin = read(root, "backend/src/routes/admin.js")
    client = read(root, "backend/src/routes/clientAuth.js")
    require(csrf, "export function rotateCsrfToken", "csrf.js")
    if admin.count("rotateCsrfToken(res)") != 2:
        raise AssertionError("admin.js must rotate CSRF on both session-issuing paths")
    if client.count("rotateCsrfToken(res)") != 1:
        raise AssertionError("clientAuth.js must rotate CSRF on login")


@check("admin login fails closed when MFA is enabled without a secret")
def check_mfa_fail_closed(root):
    text = read(root, "backend/src/routes/admin.js")
    require(text, "user.mfa_enabled && !user.mfa_secret", "admin.js")
    if "if (user.mfa_enabled && user.mfa_secret) {" in text:
        raise AssertionError("admin.js still has the old fall-through MFA check")


@check("new-device stdout log does not contain the email address")
def check_pii_log(root):
    text = read(root, "backend/src/middleware/loginAudit.js")
    match = re.search(r"console\.log\(\s*`\[SECURITY\] New device login[^`]*`", text, re.S)
    if not match:
        raise AssertionError("could not find the new-device log line")
    if "${email}" in match.group(0):
        raise AssertionError("new-device log still interpolates the email address")


@check("alert webhook has a timeout")
def check_webhook_timeout(root):
    text = read(root, "backend/src/monitoring.js")
    require(text, "AbortSignal.timeout(5000)", "monitoring.js")


@check("failed audit writes are reported to error tracking")
def check_audit_visibility(root):
    text = read(root, "backend/src/middleware/auditLog.js")
    require(text, "captureError(err", "auditLog.js")


@check("production compose does not publish the app directly")
def check_compose(root):
    text = read(root, "docker-compose.prod.yml")
    require(text, "'127.0.0.1:3001:3001'", "docker-compose.prod.yml")
    require(text, "TRUST_PROXY_HOPS=${TRUST_PROXY_HOPS:-1}", "docker-compose.prod.yml")
    require(text, "JWT_ADMIN_SECRET=${JWT_ADMIN_SECRET:-}", "docker-compose.prod.yml")


@check("Vercel frontend sends the full security header set")
def check_vercel_headers(root):
    import json

    cfg = json.loads(read(root, "frontend/vercel.json"))
    headers = {}
    for rule in cfg.get("headers", []):
        for header in rule.get("headers", []):
            headers[header["key"].lower()] = header["value"]

    expected = {
        "content-security-policy": "default-src 'self'",
        "x-frame-options": "DENY",
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
        "permissions-policy": "camera=()",
        "x-xss-protection": "0",
        "cache-control": "max-age=0",
        "cross-origin-opener-policy": "same-origin",
        "cross-origin-resource-policy": "same-origin",
    }
    for key, value in expected.items():
        actual = headers.get(key)
        if actual is None:
            raise AssertionError(f"vercel.json: missing {key}")
        if value not in actual:
            raise AssertionError(f"vercel.json: {key} lacks {value!r} (got {actual!r})")


@check("nginx frontend sends the same header set from the shared snippet")
def check_nginx_headers(root):
    snippet = read(root, "frontend/security-headers.conf")
    for needle in (
        "Content-Security-Policy",
        'X-Frame-Options "DENY"',
        'X-Content-Type-Options "nosniff"',
        'Referrer-Policy "strict-origin-when-cross-origin"',
        "Permissions-Policy",
        'X-XSS-Protection "0"',
    ):
        require(snippet, needle, "security-headers.conf")

    nginx = read(root, "frontend/nginx.conf")
    require(nginx, "include /etc/nginx/security-headers.conf;", "nginx.conf")
    require(nginx, 'Cache-Control "public, max-age=0, must-revalidate"', "nginx.conf")
    require(read(root, "frontend/Dockerfile"), "security-headers.conf", "frontend/Dockerfile")


@check("backend helmet sends frame denial, permissions policy and no-store")
def check_backend_headers(root):
    helmet = read(root, "backend/src/middleware/helmetConfig.js")
    require(helmet, "frameguard: { action: 'deny' }", "helmetConfig.js")
    require(helmet, "Permissions-Policy", "helmetConfig.js")
    require(helmet, "X-Permitted-Cross-Domain-Policies", "helmetConfig.js")
    require(helmet, "xssFilter: true", "helmetConfig.js")

    index = read(root, "backend/src/index.js")
    require(index, "app.use(securityHeaders)", "index.js")
    require(index, "res.set('Cache-Control', 'no-store')", "index.js")


@check("GitHub Actions are pinned to full commit SHAs")
def check_workflow_pinning(root):
    pattern = re.compile(r"uses:\s*[^@\s]+@([^\s#]+)")
    for wf in sorted((root / ".github/workflows").glob("*.yml")):
        for line in wf.read_text(encoding="utf-8").splitlines():
            match = pattern.search(line)
            if match and not re.fullmatch(r"[0-9a-f]{40}", match.group(1)):
                raise AssertionError(f"{wf.name}: unpinned action -> {line.strip()}")


@check("audit tools verify TLS unless explicitly opted out")
def check_tool_tls(root):
    for path in sorted((root / "tools").glob("*.py")):
        text = path.read_text(encoding="utf-8")
        if "verify=False" in text:
            raise AssertionError(f"{path.name}: still contains verify=False")
        if "requests." in text or "session." in text:
            if "VERIFY_TLS" not in text:
                raise AssertionError(f"{path.name}: network tool without VERIFY_TLS")


@check("test helpers sign tokens with the new claims")
def check_test_helpers(root):
    for path in sorted((root / "backend/test").glob("*.js")):
        text = path.read_text(encoding="utf-8")
        if "jwt.sign(" not in text:
            continue
        if "type: 'admin_access'" not in text and "type: 'client_access'" not in text:
            raise AssertionError(f"{path.name}: jwt.sign without an explicit token type")


@check("risk-score share lifetime is capped at 90 days")
def check_share_expiry(root):
    text = read(root, "backend/src/routes/adminRiskScore.js")
    require(text, "MAX_SHARE_EXPIRY_DAYS = 90", "adminRiskScore.js")


@check("Python audit tools compile")
def check_python_tools(root):
    import py_compile

    for path in sorted((root / "tools").glob("*.py")):
        py_compile.compile(str(path), doraise=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        default=str(Path(__file__).resolve().parent.parent),
        help="repository root (defaults to the parent of this script)",
    )
    args = parser.parse_args()
    root = Path(args.root).resolve()

    failures = 0
    for name, fn in CHECKS:
        try:
            fn(root)
        except Exception as exc:  # noqa: BLE001 - report every failure, not the first
            failures += 1
            print(f"FAIL  {name}\n      {exc}")
        else:
            print(f"PASS  {name}")

    print(f"\n{len(CHECKS) - failures}/{len(CHECKS)} checks passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
