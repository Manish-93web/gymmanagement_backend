# Biometric Attendance — Setup & Troubleshooting Guide

## 1. How it actually works (read this first)

This platform supports biometric attendance through **one mechanism only: eSSL's ADMS push protocol.** The physical device — whether it's plugged into the gym's LAN via ethernet cable or connected over WiFi, it makes no difference — dials **out** to this backend over the internet and pushes each punch as it happens. The backend never dials into the device.

This is a hard requirement of the hosting model, not a configuration choice: the backend runs on Render (a cloud host), and there is no route from Render into a private network sitting behind a gym's router/NAT. A "pull" or "poll the device" sync mode is not supported and cannot be made to work here, regardless of device brand. If you ever see a device stuck in a permanent sync-failure loop, the fix is always the same: make sure it's configured for ADMS push (Section 2), not scheduled polling.

**Data flow, end to end:**

```
Member's finger/face on device
        │
        ▼
Device sends a heartbeat (GET) + pushes punch data (POST), tab-delimited ATTLOG lines
        │
        ▼
Backend: /essl/iclock/cdata  (essl-adms.controller.ts)
        │
        ▼
BiometricRawLog created (raw, unprocessed)
        │
        ▼
BiometricAttendanceService matches the device's enrollment ID
against a BiometricMember mapping for this tenant
        │
   ┌────┴────┐
   │ matched │ unmatched
   ▼         ▼
Attendance   Stays visible under "Unmatched Logs" until
record       someone enrolls that ID against a member
created      (Section 6)
```

Attendance records created this way carry `method: 'biometric'` / `source: 'biometric'`, and are visually distinguished (colored badge) from manual or QR check-ins wherever attendance is listed — the main **Attendance** page and a member's own profile.

## 2. Physically configuring an eSSL device

On the device itself (menu path varies by firmware/model — look for **Comm** → **Cloud Server Setting**, or **Network** → **ADMS**):

| Setting | Value |
|---|---|
| Server Mode | **ADMS** (not "Standalone"/"None") |
| Server Address | The backend's **public** address — see the warning below |
| Server Port | 80 (HTTP) or 443 (HTTPS), matching how the backend is actually exposed |
| Enable Domain Name | On, if you're using a domain rather than a raw IP |

The device will POST to `/iclock/cdata` (also available at `/essl/iclock/cdata`) on whatever host/port you configure — both paths are handled identically.

> **Important — verify the address before relying on it.** These endpoints are mounted at the backend's raw root, not under `/api`. This repo's frontend calls its own API at `https://gymbodyflow.digitalbrandai.com/api/...`, but there's no proxy/rewrite config in this repo confirming that the *same* public domain also forwards non-`/api` paths like `/essl/iclock/cdata` through to the backend service — that depends on how DNS/routing was set up outside this codebase (a custom domain pointed straight at the Render backend service would work; a domain that only fronts the Next.js frontend would not, unless it has its own reverse-proxy rule for this path). **Confirm before configuring a real device**: open `https://<candidate-address>/iclock/cdata` in a browser (a plain GET, no auth needed). If you get a response from this server (even an error) rather than the frontend's own 404 page, that address is correct. If in doubt, the backend's own Render service URL will always work directly.

**HTTPS note:** older eSSL firmware often only speaks plain HTTP, not HTTPS. If your device can't be configured for HTTPS, it needs an HTTP-reachable path to the backend — check with whoever manages the deployment/domain if this is a blocker.

Once the device successfully sends its first heartbeat, its real serial number appears automatically — you do not need to type it in manually (see Section 3).

## 3. Adding the device in the admin UI

**Sidebar → Biometric Devices** (`/dashboard/biometric`) → **Add Device**. Fields:

- **Branch** (required) — which branch this device belongs to.
- **Device Name** (required) — a friendly label, e.g. "Main Entrance."
- **Brand** — informational/matching-hint only; it does not change how the device connects. Every device uses the same ADMS push mechanism described in Section 1.
- **Device Type** — fingerprint, face, RFID, PIN, or hybrid.
- **Serial Number** — leave blank. It auto-fills the first time the device connects.
- **IP Address** — used only as a secondary matching hint if the device happens to connect from a stable, recognizable source IP. It is **not** used to dial out to the device, so a typical private LAN IP (`192.168.x.x`) is expected here and is harmless — don't worry if it looks like it "shouldn't work."
- **Sync Mode** — "Automatic (ADMS Push)" (the only real option) or "Manual (Paused)" to temporarily stop processing a device's incoming data.
- **Re-check Interval** — how often the backend re-checks for any punches not yet turned into attendance records. This does not poll the device; the device has already pushed the data by the time this runs.

## 4. Enrolling members' biometric IDs

Each member needs their **Device User ID / Enroll ID** (the number assigned when they're enrolled on the physical device) linked to their member profile:

- From a member's profile: **Biometric** tab (`members/[id]/biometric`), or
- From the device dashboard's member panel.

Enter the exact Enroll ID as shown on the device. Leading zeros are normalized automatically server-side, but the digits must match.

## 5. Verifying device connectivity/health

"Online" here means **a recent heartbeat**, not a live network probe — ADMS devices dial out, they never listen for incoming connections, so there's nothing to "ping" in the traditional sense. The device card shows:

- **Last Seen** — from the device's most recent heartbeat (`GET /iclock/cdata`).
- **Last Sync** — when punches from this device were last turned into attendance records.
- **Consecutive Failures** / **Last Error** — only relevant if something in the processing pipeline itself is failing (not connectivity).

A background health check runs every 5 minutes and raises an alert if a device goes quiet past the tenant's configured offline threshold, if sync failures pile up, or if unmatched punches spike (usually means a batch of members were never enrolled — see Section 6).

## 6. Resolving unmatched punches

A punch with no matching `BiometricMember` enrollment never becomes an attendance record — it sits visible under **Unmatched Logs** (from the Biometric Devices dashboard) instead of silently disappearing.

To resolve:
1. Open **Unmatched Logs**, find the Enroll ID that doesn't match anyone.
2. Enroll that ID against the correct member (Section 4).
3. Reprocess — either **Reprocess All** (dashboard's Diagnostic tab) or reset that specific device's cursor (**Reset Cursor** on the device card), which also re-queues its previously-skipped punches.

## 7. Troubleshooting

**Device shows offline, but is physically powered on and connected:**
- Confirm Server Mode is ADMS, not Standalone.
- Re-verify the Server Address per the warning in Section 2 — a wrong or stale address is the most common cause.
- Check the gym's router/firewall allows outbound HTTP/HTTPS from the device — some locked-down networks block outbound traffic by port or destination.

**Punches never turn into attendance records:**
- Check Sync Mode isn't set to Manual (paused).
- Check **Unmatched Logs** (Section 6) — the punch may be arriving but has no member mapping.

**A device that used to work is now stuck failing every sync:**
- If this device predates this platform's fix removing pull/scheduled sync, it may have been left in a legacy "Scheduled" mode that never worked. Re-save it with Sync Mode set to "Automatic (ADMS Push)."

**One device's punches are appearing on the wrong tenant, or a device won't adopt its real serial number:**
- This happens when a serial number is stuck on a stale device record (often another tenant's old/replaced device). This can only be fixed by a Super Admin, via the serial-conflict resolution endpoint (`POST /api/biometric/devices/fix-serial-conflict`) — it's deliberately restricted to Super Admin because it can modify another tenant's device record.

**A gym owner's Edit Device changes to Sync Mode don't seem to take effect:**
- This was a real bug (the edit form wasn't persisting Sync Mode to the field the sync worker reads) that's now fixed. If you still see this, confirm you're on the current deployed version.
