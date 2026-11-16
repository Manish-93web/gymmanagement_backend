# Face Check-in for Trainers and Staff

Trainers and staff register their face once. After that, they check in and out on a phone kept at the gym: pick your name, tap Check in or Check out, look at the camera. The attendance shows on **Staff → Attendance**, **Attendance Calendar** and **Trainer Management**, and feeds salary the same way biometric punches do.

This works alongside your biometric machine. Nothing about the machine setup changes.

---

## One-time setup (the person who looks after the website)

The face engine and its models are served from your own site, not a third party. Install them once:

1. In the `gymmanagement_frontend` folder run: `npm run setup:face`
   It downloads the engine from npm, checks it against npm's published checksum, and puts it in `public/vendor/face-api`.
2. Commit `public/vendor/face-api` and deploy, so the live site has it.
3. The gym phone must open the site over **https** (your normal Vercel address). Phone cameras do not work on plain http.

Until this is done, the camera screens show "Face recognition files are not installed on this site yet", and nothing else is affected.

---

## Register each person's face

When you **onboard a trainer** (Onboard Trainer) or **add a staff member** such as reception, a manager or an accountant (Add Staff), the face registration opens as the next step. You can also do it later:

- **Trainer Management, Staff and Payroll pages:** click the face icon on the person's row. It turns green once registered.
- **On the gym phone:** a person with no face yet sees "Register my face" after picking their name.

The camera asks for four quick captures: look straight, turn a little right, turn a little left, look straight again. Good light, one person in view, glasses and masks off.

- The same face cannot be registered for two people. The second attempt is refused and says who already has it.
- To replace a face, or remove it, click the face icon again.

---

## Set up the gym phone

1. On the gym phone, open the address shown on **Staff → Attendance** ("Face check-in on the gym's phone"), or **Face Check-in** in the sidebar. It looks like `https://your-site/staff-kiosk`.
2. Sign in with the **owner's** email and password. If you were sent to the sign-in page first, you come straight back to the check-in screen afterwards.
3. Allow the camera when the browser asks.
4. Add the page to the phone's home screen so it opens in one tap, and keep the phone charging, with the screen set to stay on.

---

## How staff check in and out

1. Tap **your name**.
2. Tap **Check in** at the start of the shift, or **Check out** at the end.
3. Look straight at the camera and hold still. You are then asked to **turn your head slowly** to one side. This stops a photo being held up to the camera.
4. A green tick with the time means it worked. The screen returns to the list by itself.

What to know:

- The time is taken by the server, not the phone, so it cannot be set wrong.
- One record per day. Check-in then check-out. Late, early leaving, overtime and shortfall are worked out from the person's **shift**, the same as for the biometric machine. A shift that runs past midnight is supported.
- Check in twice, or check out before checking in, shows a clear message and changes nothing.
- A day marked leave or absent by the owner cannot be checked into.

---

## If something goes wrong

| Problem | What to do |
|---|---|
| "Face did not match" | Face the camera in good light, remove glasses or a mask, and try again. If it keeps failing, register the face again |
| "Face check-in is paused" | Five wrong tries in a row pause that person for 10 minutes. The owner can unlock sooner |
| "Face is not registered yet" | Register the face (see above) |
| Camera does not start | Allow the camera for the site in the browser settings, and use https |
| "Face recognition files are not installed" | Run the one-time setup above |
| Someone forgot to check out | Fix the day on **Staff → Attendance** with **Add / fix day** |

---

## Privacy and consent

- The photo is not uploaded or stored. The phone turns the image into 128 numbers and sends only those. They cannot be turned back into a picture.
- Get each person's **consent** before registering their face. Someone who does not agree can still be marked present by the biometric machine or by an owner correction.
- A face is deleted when you remove it or replace it, when you remove a trainer or staff member or make them inactive, and when the gym's account is closed.
- The Privacy Policy page describes this.

## Honest limits

- The head-turn check stops a held-up photo. A determined person with a video of a colleague's face could try to fool it. The biometric machine remains the strongest option, so keep one for gyms where this matters, and keep the phone where someone can see it.
- The gym phone stays signed in as the owner. Keep it at the front desk and do not share the password.
- Anyone can register their face on the phone while their name has none, so register faces yourself at onboarding, or watch the first time.
