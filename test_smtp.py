#!/usr/bin/env python3
"""
SMTP connectivity tester.
Run this on Render via a one-off job or locally to diagnose SMTP issues.

Usage:
  python test_smtp.py
"""

import smtplib
import socket
import ssl
import sys

HOST = "smtp.gmail.com"
PORTS = [465, 587, 2525]
USER = "sanchakgargss@gmail.com"
PASS = "fwyuidjrshwgkdwn"   # App password
TO   = "sanchakgargss@gmail.com"

print(f"\n=== Step 1: DNS resolution ===")
try:
    # Force IPv4
    infos = socket.getaddrinfo(HOST, None, socket.AF_INET)
    for info in infos[:3]:
        print(f"  IPv4: {info[4][0]}")
    ipv4 = infos[0][4][0]
except Exception as e:
    print(f"  DNS FAILED: {e}")
    sys.exit(1)

print(f"\n=== Step 2: Raw TCP connectivity on each port ===")
for port in PORTS:
    try:
        sock = socket.create_connection((ipv4, port), timeout=8)
        sock.close()
        print(f"  Port {port}: OPEN OK")
    except socket.timeout:
        print(f"  Port {port}: TIMEOUT FAIL (likely BLOCKED by firewall/Render)")
    except ConnectionRefusedError:
        print(f"  Port {port}: REFUSED FAIL")
    except Exception as e:
        print(f"  Port {port}: ERROR — {e}")

print(f"\n=== Step 3: SMTP auth test on port 465 (SSL) ===")
try:
    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(ipv4, 465, context=context, timeout=10) as smtp:
        smtp.login(USER, PASS)
        print("  Login: SUCCESS OK")
        smtp.sendmail(USER, TO, f"Subject: SMTP Test\n\nTest from Python script.")
        print("  Send: SUCCESS OK — check your inbox!")
except socket.timeout:
    print("  Port 465 SSL: TIMEOUT FAIL — port is BLOCKED")
except smtplib.SMTPAuthenticationError as e:
    print(f"  Auth FAILED FAIL — wrong App Password? {e}")
except Exception as e:
    print(f"  FAILED FAIL — {e}")

print(f"\n=== Step 4: SMTP auth test on port 587 (STARTTLS) ===")
try:
    with smtplib.SMTP(ipv4, 587, timeout=10) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(USER, PASS)
        print("  Login: SUCCESS OK")
        smtp.sendmail(USER, TO, f"Subject: SMTP Test (587)\n\nTest from Python script on port 587.")
        print("  Send: SUCCESS OK — check your inbox!")
except socket.timeout:
    print("  Port 587 STARTTLS: TIMEOUT FAIL — port is BLOCKED")
except smtplib.SMTPAuthenticationError as e:
    print(f"  Auth FAILED FAIL — wrong App Password? {e}")
except Exception as e:
    print(f"  FAILED FAIL — {e}")

print("\n=== Done ===")
