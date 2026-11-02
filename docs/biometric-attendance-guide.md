# Biometric Attendance — Setup & Troubleshooting Guide

## How it works (read this first)

The physical device — on LAN cable or WiFi, doesn't matter which — dials **out** to this backend over the internet and pushes each punch the moment it happens. The backend never dials into the device. This is the only supported mode; there is no "the platform polls the device" option, and there never will be, because a cloud-hosted backend has no route into a gym's private network.

```
Member's finger/face on device
        │
        ▼
Device pushes the punch to the server you configured on it
        │
        ▼
Backend matches the device's "User ID" against the member
you enrolled with that same ID
        │
   ┌────┴────┐
   │ matched │ unmatched
   ▼         ▼
Attendance   Stays under "Unmatched Logs" until
record       someone enrolls that ID (Part 5)
created
```

A biometric-sourced attendance record shows up wherever attendance normally shows up — the main **Attendance** page and the member's own profile — marked with a distinct "biometric" badge so it's visually distinguishable from manual/QR check-ins.

Follow Parts 1–6 in order. Don't skip Part 1 — getting the server address wrong is the single most common reason a device never connects.

---

## Part 1 — Find your server address

The device needs one thing above all else: the correct public address of this backend. Guessing this wrong is the #1 cause of "I did everything and it still shows offline."

1. Log in as a gym owner / branch manager and open **Biometric Devices** in the sidebar (`/dashboard/biometric`).
2. If you have at least one device already added, you'll see a **"Test Server"** button in the amber eSSL setup banner at the top of the page. Click it.
   - **"Server endpoint is reachable"** (green) → the address/port shown in that banner is correct. Copy it and use it in Part 3.
   - **"Endpoint not reachable"** (red) → the domain you're using does not currently forward device traffic to this backend. Do not proceed with device configuration until this is resolved — talk to whoever manages your deployment/DNS about routing `/iclock/*` to the backend service, or use the backend's own direct URL instead (e.g. its Render service URL) if you have it.
3. If you don't see this banner yet (no devices added), skip ahead to Part 2 to add a placeholder device record first, then come back here before touching the physical device.

Write down the exact **Server Address** and **Port** the banner confirms as reachable — you'll type these into the physical device in Part 3.

---

## Part 2 — Add the device record in the platform

1. Sidebar → **Biometric Devices** → **Add Device** button.
2. Fill in the form exactly as follows:

| Field | What to enter |
|---|---|
| **Branch** *(required)* | Select the branch this physical device sits at. |
| **Device Name** *(required)* | A name your staff will recognize, e.g. `Main Entrance` or `Reception Scanner`. |
| **Brand** *(required)* | Pick the closest match (`ESSL`, `ZKTECO`, etc.) — this is just a label for your reference, it does not change how the device connects. |
| **Device Type** *(required)* | `Fingerprint`, `Face Recognition`, `RFID Card`, `PIN Attendance`, or `Hybrid` — whatever the physical device actually is. |
| **Model** | Optional — the device's model number, e.g. `ZK400`, for your own records. |
| **Serial Number** | **Leave this blank.** It fills in automatically the first time the device successfully connects — you don't need to find it yourself. |
| **IP Address** *(required)* | The device's local IP on the gym's network (e.g. `192.168.1.73`) — check this on the device itself (Menu → Comm → Ethernet/WiFi, or similar). This is only used as a hint for matching, not to reach the device, so it's fine even though it's a private address. |
| **Port** | Leave as the default `4370` unless you specifically changed it on the device. |
| **Password / Key** | Only fill this in if you set a communication password/key on the device itself. Leave blank otherwise. |
| **Location / Label** | Optional — e.g. `Ground Floor Entrance`. |
| **Device Timezone** | Match the timezone the device's clock is actually set to — this matters for punch times to be correct. Most India-based gyms: `Asia/Kolkata`. |
| **Sync Mode** | Leave as **"Automatic (ADMS Push)"** — this is the only mode that works. Only switch to "Manual (Paused)" if you deliberately want to stop processing this device's data. |
| **Re-check Interval** | Leave the default (5 minutes) — this only controls how often the backend re-checks for anything not yet processed, it does not affect how fast a punch shows up (that happens instantly, see the diagram above). |

3. Click **Add Device**.

---

## Part 3 — Configure the physical device

On the device's own menu (exact path varies slightly by firmware — look for **Comm**, **Network**, or **Cloud Server Setting**):

1. Navigate to: **Menu → Network → ADMS** (some models: **Comm → Cloud Server Setting**).
2. Set the following:

| Setting | Value |
|---|---|
| **Server Mode** | `ADMS` — not "Standalone" or "None." |
| **Enable Domain Name** | `ON` if your server address is a domain name (not a raw IP). |
| **Server Address** | The address confirmed reachable in Part 1. |
| **Server Port** | The port confirmed reachable in Part 1 (typically `80` for HTTP or `443` for HTTPS). |
| **Enable Proxy** | `OFF`. |

3. Save the settings and let the device reboot if it asks to.
4. **If the device supports HTTPS and it doesn't connect**, try HTTP instead (many older eSSL units only speak plain HTTP, not modern TLS) — flip the setting and re-test rather than assuming it's misconfigured.

---

## Part 4 — Confirm the device connected

1. Back in **Biometric Devices**, wait 1–2 minutes after the device reboots.
2. Refresh the page. The device card should now show:
   - **Status: Online** (or a recent "Last Seen" time).
   - **Serial Number** auto-filled (confirms the device actually reached the server — if this stays blank, it hasn't connected yet; recheck Part 3).
3. If it's still offline after a few minutes, use the **Test** button on the device card, and see Part 9 (Troubleshooting) below.

---

## Part 5 — Enroll members (link a person to a device User ID)

Every member needs their device-assigned **User ID** (the number the device uses internally, assigned when you enroll their fingerprint on the device) linked to their profile in the platform. **Two ways to do this — either works:**

### Option A — from the Members list (fastest, recommended)
1. Go to the **Members** page.
2. Find the member's row — there's a small toggle switch next to their name.
3. Turn it **ON**. A popup titled "Enroll [Name]" appears.
   - It may pre-fill a suggested **Biometric User ID** (based on their member number) — you can use this, or type the exact ID you actually assigned on the device.
   - **Biometric User ID** *(required)* — type the exact number, e.g. `1`, `2`, `00042`. This must match, digit for digit, what you entered on the device when enrolling their fingerprint (device: **Menu → User Mgmt → All Users**, find them, note the User ID).
   - **RFID Card ID** *(optional)* — only if this device also reads RFID cards.
4. Click **Save & Activate**.

### Option B — from the member's own profile
1. Open the member's profile → **Biometric** tab.
2. Enter the same **Device User ID** in the field shown.
3. It saves automatically / on pressing Enter.

Either way, once saved: the next time that person punches the device using that User ID, their attendance marks automatically.

---

## Part 6 — Test it end-to-end

1. Have one enrolled person actually punch the physical device (fingerprint, face, or card, whichever it supports).
2. Within a few seconds, open the **Attendance** page — a new check-in should appear for that member, tagged as a biometric check-in.
3. If it doesn't appear:
   - Go to **Biometric Devices → Unmatched Logs** — if the punch shows up there instead, the User ID you entered in Part 5 doesn't exactly match what's enrolled on the device. Fix the ID and save — this automatically reprocesses that ID's previously-unmatched punches, no extra step needed. Refresh the Attendance page after saving.
   - If it still doesn't show up, use **Reset Cursor** on the device card as a fallback (also resets skipped punches for reprocessing).
   - If nothing shows up anywhere (not even Unmatched Logs), the device likely never reached the server — revisit Parts 1 and 3.

Once one real punch shows up correctly, the setup is done — every future punch behaves the same way automatically.

---

## Part 7 — Trainers and staff (attendance and salary)

Trainers and other staff use the same device as members, but their punches become **staff attendance** and drive **salary**, not member check-ins.

**Enrol a trainer**
1. Sidebar → **Trainer Management** → click the **fingerprint** button on the trainer's row.
2. Enter the **Device User ID** — the same ID you enrol the trainer's finger or face under on the device. Use an ID **no member has**; the platform rejects an ID already used by another staff member, a member enrolment, or a member's serial number.
3. Set the trainer's **Shift timing** (for example 06:00–14:00). Leave it empty to use the gym-wide shift from **Staff → Deduction Settings**. Shifts must finish on the same day.
4. Save. Punches the trainer made before being enrolled are picked up automatically.

**What a punch does**
- The **first** punch of the day is the check-in and the **last** is the check-out. Punches closer together than the dedupe window (default 5 minutes) are ignored.
- Check-in later than shift start plus grace (default 10 minutes) is marked **late**. Check-out before shift end is marked **early departure**.
- See it live on **Staff → Attendance** ("Today's Team", records with a Biometric badge) and on the trainer's row ("In since 09:12").

**How salary is calculated** (Staff → Payroll)
- Each attended day earns one day's pay (monthly salary ÷ working days, default 26). Paid leave earns the same.
- The part of the shift **not worked** is deducted at the hourly rate (daily rate ÷ shift hours). Being short by no more than the grace period is forgiven.
- Hours beyond the shift are paid as overtime (default 1.5×). A fixed fee per late arrival applies (default ₹50).
- A day with a check-in but **no check-out** is not paid until an owner fixes it.
- **Run Payroll** saves the month's payslips; **Mark as paid** freezes a payslip so later changes do not alter it.

**Fixing a missed punch, or marking leave**
- On **Staff → Attendance**, use **Add / fix day** or the pencil on a record. Set the check-in and check-out, or mark the day **Paid leave** or **Absent**. Hours, overtime and pay are recalculated and the record is noted as adjusted.

**Trainers see their own record**
- The trainer dashboard has **My Attendance & Pay**: today's check-in and check-out, the month's hours, and the pay earned so far.

---

## Part 8 — Any brand of machine (not only eSSL / ZKTeco)

GymBodyFlow accepts punches from every common machine. There are three ways in; use the one your machine supports.

| Your machine | How it connects |
|---|---|
| eSSL, ZKTeco, Biomax, other "ADMS / Cloud Server" firmware | Point the machine's server address at the backend (Part 2). Nothing else to set. |
| Hikvision, Dahua, Suprema, Matrix COSEC, Mantra, Anviz, CP Plus, Secureye, or the vendor's own software/middleware | **Push URL.** On the device card click **Connect / Import**, copy the URL, and paste it as the HTTP / event-push / webhook address. JSON, XML, CSV and tab-separated text are all read. |
| A machine that can only open a web link | Append `?id=<user>&time=<YYYY-MM-DD HH:MM:SS>[&status=0\|1]` to the push URL. |
| A machine with no network push (USB export, vendor PC software, Excel) | **File import.** On the device card click **Connect / Import**, upload the export (.csv / .txt / .dat / .json) or paste rows. Re-importing the same file is safe because repeats are ignored. |

Rules that apply to every route:
- Each row needs a **user ID** and a **date and time**. In/Out is optional (the first punch of the day is check-in and the last is check-out).
- Times with no timezone are read in the device's timezone (set on the device, default Asia/Kolkata). Times that carry an offset (`+05:30`, `Z`) or are Unix timestamps are used as they are. Dates like `05/10/2026` are read day-first.
- The same device user ID rules as before apply: a trainer's ID must not match any member.
- The push URL contains a secret. If it leaks, press the refresh button next to it to issue a new one; the old URL stops working at once.
- IDs that are not linked to anyone yet are kept under **Unmatched punches** and applied once you link them.

## Part 9 — Troubleshooting

**Device shows offline, but is physically on and connected to the network:**
- Re-check the Server Address/Port against what Part 1's "Test Server" button confirmed — a typo here is the most common cause.
- Confirm Server Mode is `ADMS`, not Standalone.
- Check the gym's WiFi/router isn't blocking outbound traffic on the port you configured.
- Try the HTTP option instead of HTTPS (Part 3, step 4).

**Punches aren't becoming attendance records:**
- Check **Unmatched Logs** first — the punch is very likely arriving fine, just with no member linked to that User ID yet (Part 5).
- If it is a **trainer or staff member**, enrol their User ID from Trainer Management (Part 7). Their earlier punches are then processed automatically.
- A trainer's day looks wrong or pay is missing: open **Staff → Attendance**, check for a day with no check-out (marked "no check-out yet"), and fix it with **Add / fix day**.
- Confirm the device's Sync Mode isn't set to "Manual (Paused)."

**A device that used to work now fails constantly:**
- If this device was set up before this platform switched to ADMS-only mode, edit it and confirm Sync Mode reads "Automatic (ADMS Push)," not any older "Scheduled" value.

**One device's punches are landing on the wrong gym/tenant, or it won't pick up its real serial number:**
- This means a serial number is stuck on a stale device record elsewhere in the system. Only a Super Admin can resolve this (it deliberately requires platform-level access since it touches another tenant's data) — have them use the serial-conflict resolution tool.

**A gym owner's edits to Sync Mode on an existing device don't seem to take effect:**
- This was a real bug that has since been fixed. If you still see it, you're likely on an older deployed version — confirm the latest backend build is live.
