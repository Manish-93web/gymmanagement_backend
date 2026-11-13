# Connect Your Biometric Machine to GymBodyFlow

A step-by-step guide for gym owners. After these steps, when a **member** or a **trainer** punches In or Out on the machine, the attendance appears in GymBodyFlow on its own. For trainers, it also feeds their salary.

Time needed: about 30 minutes for the first machine. You do not need technical knowledge, but keep the machine's menu and your GymBodyFlow login open side by side.

---

## What you need before you start

| You need | Why |
|---|---|
| Owner or branch-manager login for GymBodyFlow | To add the machine and link people |
| The biometric machine, powered on | Any brand works (see Step 1) |
| The machine connected to your gym's internet, by LAN cable or WiFi | It sends each punch to GymBodyFlow online |
| The machine's admin (menu) access | Some machines ask for the admin password or the admin's fingerprint to open the menu |
| A list of your trainers and members | You will give each one a number on the machine |

---

## How it works, in one picture

```
Person punches on the machine
        |
        v
Machine sends the punch to GymBodyFlow over the internet
        |
        v
GymBodyFlow looks at the machine's User ID
   |-- belongs to a MEMBER  -> member check-in on the Attendance page
   |-- belongs to a TRAINER -> staff attendance (check-in / check-out) and salary
   |-- belongs to nobody yet -> kept under "Unmatched Logs" until you link it
```

The one rule that makes everything work: **the number you give a person on the machine is the same number you type for that person in GymBodyFlow.** Digit for digit.

---

## Step 1: Pick how your machine connects

| Your machine | Connection method | Go to |
|---|---|---|
| eSSL, ZKTeco, Biomax, or any machine with a **Cloud Server / ADMS** setting | Machine pushes punches by itself | Steps 2 to 7 |
| Hikvision, Dahua, Suprema, Matrix COSEC, Mantra, Anviz, CP Plus, Secureye, or any machine with an **HTTP push / event / webhook** setting | Machine (or its vendor software) sends punches to a private link | Step 8A |
| A machine with no network feature, or one that only exports to a USB drive or its PC software | You upload the exported file | Step 8B |

Not sure? Open the machine's menu and look under **Comm**, **Network** or **Cloud Server**. If you see "Cloud Server Setting" or "ADMS", use the first row.

---

## Step 2: Note down your server address

1. Log in to GymBodyFlow and open **Biometric Devices** in the sidebar, then the **Setup Guide** tab. This same guide is there, with your real values filled in.
2. The box at the top shows the **Server Address** and **Server Port**, each with a copy button. Write them here:

   - Server Address: ______________________ (a web address without `https://`; it is the GymBodyFlow server, not the address of your gym's PC)
   - Server Port: ______ (usually `443`)

3. Click **Test Server**. A green "Server is reachable" message means the address is right. If it is red, do not touch the machine yet. Ask GymBodyFlow support to check the server.

The same details also appear in an amber box on the Devices tab for eSSL and ZKTeco machines that have not connected yet.

---

## Step 3: Add the machine in GymBodyFlow

Sidebar → **Biometric Devices** → **Add Device**. Fill the form like this:

| Field | Required | What to enter |
|---|---|---|
| **Branch** | Yes | The branch where this machine is fixed |
| **Device Name** | Yes | A name your team knows, for example `Main Entrance` |
| **Brand** | Yes | Your machine's brand. Choose `GENERIC` if yours is not listed. This is a label only |
| **Device Type** | Yes | `Fingerprint`, `Face Recognition`, `RFID Card`, `PIN Attendance` or `Hybrid`, whatever your machine really is |
| **Model** | No | For your records, for example `ZK400` |
| **Serial Number** | No | **Leave blank.** It fills itself the first time the machine connects |
| **IP Address** | Yes | The machine's address on your gym network, for example `192.168.1.73`. Read it on the machine: Menu → Comm → Ethernet (or WiFi) |
| **Port** | No | Leave `4370` unless you changed it on the machine |
| **Password / Key** | No | Only if you set a communication password on the machine. Otherwise blank |
| **Location / Label** | No | For example `Ground Floor Entrance` |
| **Device Timezone** | Yes | The timezone the machine's clock is set to. For India choose `Asia/Kolkata` |
| **Sync Mode** | Yes | Keep **Automatic (ADMS Push)**. Choose Manual (Paused) only if you want to stop this machine on purpose |
| **Re-check Interval** | No | Leave `5` minutes. It does not slow down punches |

Click **Add Device**. The machine now appears as a card, probably showing "Offline" for now.

---

## Step 4: Set up the machine (eSSL / ZKTeco / Biomax and other ADMS machines)

Menu names differ a little between models. Look for **Menu → Comm** (or **Network**), then **Cloud Server Setting** (or **ADMS**).

### 4a. Network settings of the machine

| Setting | Value |
|---|---|
| IP Address | Automatic (DHCP) is fine. If you set it by hand, it must match the IP you typed in Step 3 |
| Subnet Mask / Gateway | As your router gives, usually `255.255.255.0` and your router's address |
| **DNS** | Set to `8.8.8.8` (needed so the machine can find a website name) |

### 4b. Cloud Server / ADMS settings

| Setting on the machine | Value to enter |
|---|---|
| **Server Mode** | `ADMS` (not "Standalone" or "None") |
| **Enable Domain Name** | **ON** |
| **Server Address** | The address from Step 2 |
| **Server Port** | The port from Step 2 (`443`) |
| **HTTPS** | **ON** if the machine has this option |
| **Enable Proxy Server** | **OFF** |

Save. The machine may restart.

### 4c. Check the machine's date and time

Menu → System → Date/Time. It must show the **correct local time**. A wrong clock gives wrong punch times.

### If the machine cannot use HTTPS

Older machines cannot speak modern secure connections. Try turning HTTPS **OFF** and port **80**. Be aware that internet hosting often redirects plain HTTP to HTTPS, and many machines cannot follow that redirect. If the machine will still not connect, do not fight it. Use Step 8B (file import), or ask the machine's supplier for a firmware update that supports HTTPS.

---

## Step 5: Check that it connected

1. Wait 1 to 2 minutes. Refresh **Biometric Devices**.
2. The card should show **Online** (or a recent "Last seen"), and the **Serial Number** should now be filled in.

If the serial number is still blank, the machine has not reached GymBodyFlow. See "When something goes wrong" at the end.

---

## Step 6: Give every person a number on the machine

On the machine: **Menu → User Management → New User** (or Add User). For each person:

| Machine field | What to enter |
|---|---|
| **User ID** | A number you choose, for example `101`. **Write it down.** |
| **Name** | The person's name (optional, helps you find them later) |
| **Fingerprint / Face / Card / Password** | Enrol the person's finger, face or card |
| **Privilege** | `Normal User`. Do not give normal people Admin rights |

Rules for User IDs:

- Every person has **their own number**. Never share a number between two people.
- **Easiest for members:** use the member's **S.No** (the serial number in the Members table) as the machine User ID. GymBodyFlow matches these punches automatically, so Step 7 is not needed for them.
- **A trainer's number must not be used by any member** (neither a linked ID nor a member's S.No). GymBodyFlow rejects it if it is. So give trainers and staff numbers above your largest member S.No, for example `9001`, `9002`.
- Do not mix `42` and `042`. Use plain numbers without leading zeros.
- Existing members with no S.No: on the **Setup Guide** tab click **Assign S.No to all members** (safe to repeat).

---

## Step 7: Link each person in GymBodyFlow

### For members

Skip this if you used the member's S.No as their machine User ID in Step 6. Otherwise:

1. Open **Members**. Find the member. Turn on the small switch next to the name.
2. The popup "Enroll [Name]" asks:

| Field | Required | What to enter |
|---|---|---|
| **Biometric User ID** | Yes | The exact User ID from Step 6, for example `101` |
| **RFID Card ID** | No | Only if the member also uses a card |

3. Click **Save & Activate**.

Another way: open the member's profile → **Biometric** tab → type the **Device User ID**.

### For trainers and staff

1. Sidebar → **Trainer Management**.
2. On the trainer's row, click the **fingerprint** button.
3. Fill in:

| Field | Required | What to enter |
|---|---|---|
| **Device User ID** | Yes | The exact User ID from Step 6, for example `901` |
| **Shift timing** | Recommended | The trainer's shift, for example `06:00` to `14:00`. Leave empty to use the gym-wide shift from **Staff → Deduction Settings**. A shift must end on the same day |

4. Save. Any punches the trainer made before this step are picked up automatically.

---

## Step 8: Machines that are not eSSL / ZKTeco

Do Step 3 (add the device, Brand = your brand or `GENERIC`) first. Then, on the device card, click **Connect / Import**.

### 8A. The machine can send punches to a link (HTTP push / event / webhook)

1. In **Connect / Import**, copy the **Push URL**. It looks like `https://<your-site>/ingest/<long-secret>`.
2. In the machine, or in its vendor software, find the setting for pushing events to a server. Names differ: *HTTP Listening*, *Event Push*, *Webhook*, *Data Push*, *Real-time Upload*. Enter:

| Setting | Value |
|---|---|
| **URL / Server** | The Push URL you copied |
| **Method** | `POST` |
| **Format** | JSON (XML, CSV and tab text also work) |
| **Port** | `443` for `https://`, `80` for `http://` |
| **What to send** | Attendance / access events. Each one needs the person's **user ID** and the **date and time** |

3. Punch once to test.

If the machine can only open a web link and cannot send a body, add the data to the end of the link:

```
<Push URL>?id=<user id>&time=<YYYY-MM-DD HH:MM:SS>&status=0
```

`status=0` is In and `status=1` is Out. You can leave `status` out.

Keep the Push URL private, as anyone with it can add punches. If it leaks, click the refresh button next to it. A new link is made and the old one stops working at once. Then paste the new one into the machine.

### 8B. The machine can only export a file (USB, vendor PC software, Excel)

1. Export the attendance log from the machine or its software as `.csv`, `.txt`, `.dat` or `.json`. Excel files: save as CSV first.
2. In **Connect / Import**, click the file box and choose the file, or paste the rows into the text box.
3. Click **Import punches**.

Each row needs a **user ID** and a **date and time**, for example:

```
901,2026-10-05 09:02:11
901,2026-10-05 18:07:40
101,2026-10-05 07:15:02
```

The result tells you how many punches were added and how many were skipped and why. You can import the same file twice without harm, because repeats are ignored. Do this daily, or as often as you want attendance updated.

Times with no timezone are read in the **Device Timezone** from Step 3. Dates like `05/10/2026` are read day first.

---

## Step 9: Test it

1. Ask one enrolled **member** to punch on the machine. Within a few seconds, open **Attendance**. A new check-in appears with a **biometric** badge.
2. Ask one **trainer** to punch. Open **Staff → Attendance**. "Today's Team" shows the trainer as **In since hh:mm**.
3. Later, the trainer punches again. The record now shows a check-out and the worked hours.

Done. Every future punch works the same way with no action from you.

---

## What the trainer's punches do

| Situation | What GymBodyFlow does |
|---|---|
| First punch of the day | Check-in |
| Last punch of the day | Check-out. Punches in between do no harm |
| Two punches within 5 minutes | The second is ignored (accidental double punch) |
| Check-in after shift start plus grace (10 minutes) | Marked **Late**. A fixed late fee applies (default Rs 50) |
| Check-out before shift end | Marked **Early departure** |
| Worked fewer hours than the shift | The missing time is **deducted from salary** at the hourly rate. Being short by no more than the grace period is forgiven |
| Worked more than the shift | Paid as overtime (default 1.5 times) |
| Check-in but no check-out | Shown as "no check-out yet" and **not paid** until you fix it |

You can see and fix all of this on **Staff → Attendance** (use **Add / fix day** or the pencil on a record, or mark a day Paid leave or Absent). Salary is on **Staff → Payroll**. **Run Payroll** saves the month's payslips, and **Mark as paid** locks a payslip.

Trainers see their own attendance and pay earned so far on their dashboard under **My Attendance & Pay**.

---

## When something goes wrong

| Problem | What to check |
|---|---|
| Machine stays **Offline**, serial number blank | 1. Server Address has no typo and no `https://`. 2. Port is `443` with HTTPS ON. 3. DNS on the machine is `8.8.8.8`. 4. Server Mode is `ADMS`. 5. Enable Proxy is OFF. 6. Your router is not blocking outbound traffic. 7. Try HTTPS OFF with port `80`. 8. Still nothing: use Step 8B |
| Punch does not become attendance | Open **Biometric Devices → Unmatched Logs**. If the punch is there, the User ID is not linked yet or has a typo. Fix it in Step 7 and save. Old punches for that ID are applied automatically |
| Punch is not in Unmatched Logs either | The machine is not reaching the server. See the first row |
| Punch times are off by hours | The machine's clock or **Device Timezone** is wrong (Step 3 and 4c) |
| "User ID already used" when linking a trainer | A member already has that number. Pick a different number for the trainer, enrol it again on the machine, and use the new number |
| Trainer's salary looks too low | Open **Staff → Attendance** for the month. Look for days with no check-out or with a shortfall, and fix them |
| Device card says "Manual (Paused)" | Edit the device and set **Sync Mode** to **Automatic (ADMS Push)** |
| Push URL leaked | Click the refresh button beside it in **Connect / Import**, then update the machine |

---

## Quick card to fill and keep

| | |
|---|---|
| Machine name / location | ____________________ |
| Brand and model | ____________________ |
| Machine IP | ____________________ |
| Server Address | ____________________ |
| Server Port | ______  HTTPS: ON / OFF |
| Server Mode | ADMS |
| Machine clock set to | ____________________ |
| Member IDs | from ____ to ____ |
| Trainer / staff IDs | from ____ to ____ |

| Trainer | Machine User ID | Shift |
|---|---|---|
| | | |
| | | |
| | | |
