# Iftin Resellers Delivery - Android App Setup Guide

## 📱 What This App Does

This Android app runs 24/7 on your Samsung Galaxy M31 and automatically:
- Polls the Iftin Resellers server every 5 seconds for new package orders
- Dials USSD codes using the correct SIM (Hormuud Slot 1, Somnet Slot 2)
- Activates data packages automatically without any manual work
- Reports success/failure back to the server
- Works even while you sleep! 😴

---

## 🔧 Requirements

- ✅ Samsung Galaxy M31 (or any Android 6.0+ phone)
- ✅ Hormuud SIM card (for Slot 1)
- ✅ Somnet SIM card (for Slot 2)
- ✅ WiFi connection
- ✅ Charger (keep phone plugged in 24/7)
- ✅ Computer with Android Studio (for initial setup)

---

## 📦 Installation Steps

### Step 1: Install Android Studio (One-Time Only)

1. Download Android Studio from: https://developer.android.com/studio
2. Install it on your computer
3. Open Android Studio and complete the setup wizard
4. Install Android SDK (API 34)

### Step 2: Build the APK

1. Open Android Studio
2. Click **File → Open** and select the `android-app` folder
3. Wait for Gradle sync to complete (5-10 minutes first time)
4. Connect your Samsung M31 to computer via USB
5. Enable **Developer Options** on phone:
   - Go to **Settings → About Phone**
   - Tap **Build Number** 7 times
   - Go back to **Settings → Developer Options**
   - Enable **USB Debugging**
6. In Android Studio, click **Run** button (green play icon)
7. Select your Samsung M31 from the device list
8. App will install and launch automatically

### Step 3: Phone Setup

#### A. Insert SIM Cards
- **Slot 1**: Insert Hormuud SIM
- **Slot 2**: Insert Somnet SIM
- Make sure both SIMs have credit for testing

#### B. Disable Battery Optimization
1. Open the Iftin Resellers app
2. Tap **"DISABLE BATTERY OPTIMIZATION"** button
3. Select "Allow" when prompted
4. **CRITICAL**: This prevents Android from killing the app!

#### C. Enable Stay Awake (Developer Settings)
1. Go to **Settings → Developer Options**
2. Enable **"Stay awake"** (keeps screen on while charging)
3. This ensures the service never stops

#### D. Disable Sleep Mode
1. Go to **Settings → Display**
2. Set **Screen timeout** to "Never" or maximum (30 minutes)

#### E. Allow Background Data
1. Go to **Settings → Apps → Iftin Resellers**
2. Tap **Mobile data**
3. Enable **"Background data"** and **"Unrestricted data usage"**

#### F. Enable Autostart
1. Go to **Settings → Apps → Iftin Resellers**
2. Look for **"Autostart"** or **"Battery"**
3. Enable **"Allow autostart"**

### Step 4: Start the Service

1. Open the Iftin Resellers app
2. Tap the **"START SERVICE"** button (green)
3. You'll see a persistent notification: **"Iftin Resellers Active"**
4. The app is now running in the background! 🎉

### Step 5: Keep Phone Charging

1. Plug phone into charger
2. Keep it charging 24/7
3. Place phone in a well-ventilated area (avoid overheating)

---

## 🧪 Testing

### Test 1: Check if Service is Running
1. Open the app
2. Look for **green dot** next to "ACTIVE"
3. Stats should show **"Total: 0, Success: 0"**

### Test 2: Create a Test Order (From Website)
1. Go to your Iftin Resellers website
2. Make a test purchase (use test payment)
3. Within 5-10 seconds, phone should automatically:
   - Dial the USSD code
   - Navigate through menus
   - Activate the package
4. Check app dashboard - **Success** count should increase!

### Test 3: Check Logs (In Supabase)
1. Go to Supabase dashboard → Edge Function logs
2. You'll see API calls from your phone:
   - `GET /pending` - Phone checking for orders
   - `POST /status` - Phone reporting completion

---

## 🔍 Troubleshooting

### Problem: Service Keeps Stopping
**Solution**:
1. Disable battery optimization (Step 3B)
2. Enable "Stay awake" in Developer Options
3. Check if phone has aggressive battery saver mode

### Problem: USSD Not Dialing
**Solution**:
1. Check if SIMs are in correct slots:
   - Slot 1 = Hormuud
   - Slot 2 = Somnet
2. Grant **CALL_PHONE** permission
3. Test manually: Dial `*545*1#` to verify SIM works

### Problem: No Orders Showing Up
**Solution**:
1. Check WiFi connection
2. Look at Supabase logs - are API calls happening?
3. Check if there are pending orders in database

---

## ✅ Checklist (Before Going Live)

- [ ] Both SIMs inserted and working
- [ ] Battery optimization disabled
- [ ] Stay awake enabled
- [ ] Autostart enabled
- [ ] Service started (green dot showing)
- [ ] Phone charging 24/7
- [ ] Test order completed successfully
- [ ] Supabase logs showing activity

---

**Congratulations! Your automated delivery system is now running! 🎉**