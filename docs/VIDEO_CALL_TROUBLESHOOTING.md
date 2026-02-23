# Video Call Troubleshooting Guide

## 🎥 Common Issues and Solutions

### **Issue 1: "DEVICE_NOT_FOUND" Error**

**Symptoms:**
```
AgoraRTCError DEVICE_NOT_FOUND: NotFoundError: Requested device not found
```

**Causes:**
1. ❌ No camera or microphone connected to device
2. ❌ Browser permissions not granted
3. ❌ Device already in use by another application

**Solutions:**

#### **Option A: Grant Browser Permissions**
1. Look for the camera/microphone icon in your browser's address bar
2. Click it and select "Allow"
3. Refresh the page and try again

**Chrome:**
- Click the 🔒 (lock icon) in address bar
- Change Camera and Microphone to "Allow"

**Firefox:**
- Click the 🔒 (lock icon) in address bar
- Click "More Information" → "Permissions" → Allow Camera and Microphone

**Edge:**
- Same as Chrome

#### **Option B: Check Device Connection**
1. Make sure your camera/microphone is properly connected
2. Test it in another app (Zoom, Teams, etc.)
3. On Windows: Check Device Manager
4. On Mac: Check System Preferences → Sound/Camera

#### **Option C: Close Other Apps**
1. Close apps that might be using your camera (Zoom, Teams, Skype)
2. Restart your browser
3. Try joining the call again

#### **Option D: Join Without Camera (Audio Only)**
✅ **Good News:** The app now supports joining without a camera!

If you don't have a camera, you can still:
- ✅ Join with microphone only (audio call)
- ✅ See and hear other participants
- ✅ Share your voice

#### **Option E: Join in View-Only Mode**
✅ **Good News:** You can join even without any devices!

If you have no camera or microphone:
- ✅ Join in "view-only" mode
- ✅ See other participants
- ✅ Hear the audio
- ❌ Can't share video or audio

---

### **Issue 2: Content Security Policy (CSP) Error**

**Symptoms:**
```
Violates the following Content Security Policy directive: "connect-src..."
```

**Solution:**
This has been fixed! The CSP now includes `https://*.cloudfunctions.net`.

If you still see this error:
1. **Hard refresh** the page: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
2. Clear browser cache
3. Close and reopen the browser

---

### **Issue 3: "Call Session Not Found"**

**Symptoms:**
```
Error: Call session not found
```

**Causes:**
1. The call link is invalid
2. The call has already ended
3. The invitation expired

**Solution:**
1. Ask the host to send a new invitation
2. Check if you're using the correct call link
3. Make sure the call hasn't been deleted

---

### **Issue 4: Can't Hear Other Participants**

**Solutions:**
1. Check your device volume (not muted)
2. Check browser tab isn't muted (right-click tab)
3. Test your speakers/headphones in another app
4. Ask other participants to unmute their microphones

---

### **Issue 5: Other Participants Can't Hear Me**

**Solutions:**
1. Check if your microphone is muted (red icon means muted)
2. Click the 🎤 button to unmute
3. Check browser permissions (see Issue 1)
4. Test microphone in system settings
5. Check if another app is using your microphone

---

### **Issue 6: Video is Black/Frozen**

**Solutions:**
1. Toggle video off and on (click 📹 button)
2. Check lighting (might be too dark)
3. Check if camera is covered
4. Restart your browser
5. Try a different browser

---

## 🔧 **How the Graceful Fallback Works**

Our video calling system now has **3-tier fallback**:

### **Tier 1: Full Video Call (Best)**
- ✅ Camera enabled
- ✅ Microphone enabled
- ✅ Can see and hear everyone

### **Tier 2: Audio-Only Call (Good)**
- ❌ No camera (disabled or not available)
- ✅ Microphone enabled
- ✅ Can hear everyone and speak

### **Tier 3: View-Only Mode (Acceptable)**
- ❌ No camera
- ❌ No microphone
- ✅ Can see and hear everyone
- ❌ Can't speak

The system automatically determines which tier you can use based on your available devices.

---

## 🎯 **Testing Device Availability**

### **Before Joining a Call:**

**Check Browser Console (F12):**
```
[VideoCallService] Available devices: { cameras: 1, microphones: 1 }
```

**What This Means:**
- `cameras: 1` = ✅ Camera detected
- `cameras: 0` = ❌ No camera
- `microphones: 1` = ✅ Microphone detected
- `microphones: 0` = ❌ No microphone

### **During Call Join:**

**Success Messages:**
```
[VideoCallService] ✅ Created audio and video tracks
[VideoCallService] Published 2 track(s)
```

**Fallback Messages:**
```
[VideoCallService] ⚠️ Failed to create video/audio tracks
[VideoCallService] ✅ Created audio track only (no camera)
[VideoCallService] Published 1 track(s)
```

**View-Only Mode:**
```
[VideoCallService] 👁️ Joining in view-only mode
[VideoCallService] Joined in view-only mode (no local tracks)
```

---

## 🌐 **Browser Compatibility**

### **Recommended Browsers:**
- ✅ **Chrome** (recommended)
- ✅ **Edge** (Chromium-based)
- ✅ **Firefox** (latest version)
- ✅ **Safari** (macOS/iOS, latest version)

### **Known Issues:**
- ⚠️ **Safari:** May require additional permissions
- ⚠️ **Firefox:** Video quality might be lower
- ❌ **IE11:** Not supported (use Chrome/Edge)

---

## 📱 **Mobile Device Issues**

### **iOS (iPhone/iPad):**
1. Go to Settings → Safari → Camera/Microphone
2. Allow for your website
3. Refresh the page

### **Android:**
1. Go to Chrome → Settings → Site Settings → Camera/Microphone
2. Allow for your website
3. Refresh the page

### **Mobile Browser Limitations:**
- Some features may not work in mobile browsers
- Consider using a desktop/laptop for best experience
- Screen sharing not available on mobile

---

## 🔐 **Privacy & Permissions**

### **What Permissions Are Needed:**
- 📷 **Camera** - To share your video
- 🎤 **Microphone** - To share your audio
- 🔊 **Speakers** - To hear others (usually automatic)

### **Can I Join Without Granting Permissions?**
✅ **YES!** You can join in view-only mode:
- No camera needed
- No microphone needed
- Can still see and hear the call

### **How to Revoke Permissions:**
**Chrome/Edge:**
1. Click 🔒 in address bar
2. Click "Site settings"
3. Change Camera/Microphone to "Block"

**Firefox:**
1. Click 🔒 in address bar
2. Click "More Information"
3. Click "Permissions" tab
4. Change Camera/Microphone permissions

---

## 🆘 **Still Having Issues?**

### **Step-by-Step Diagnostic:**

1. **Open Browser Console** (Press F12)
2. **Look for logs starting with** `[VideoCallService]`
3. **Check for error messages** in red
4. **Copy the error message**

### **Common Error Patterns:**

**"NotFoundError"**
→ No device found (see Issue 1)

**"NotAllowedError"**
→ Permissions denied (see Issue 1, Option A)

**"NotReadableError"**
→ Device in use by another app (see Issue 1, Option C)

**"AbortError"**
→ Hardware error, try restarting browser

---

## ✅ **Success Indicators**

**You've successfully joined when you see:**
1. ✅ Video call UI loads
2. ✅ Your local video appears (if camera enabled)
3. ✅ Network quality indicator shows
4. ✅ Control buttons are active (not grayed out)
5. ✅ Console shows: "Published X track(s)"

**Call is active when you see:**
1. ✅ Remote participant(s) video/audio
2. ✅ Call duration timer running
3. ✅ Network quality stable (green/yellow)

---

## 📊 **Network Quality Indicators**

| Icon | Quality | Meaning |
|------|---------|---------|
| 🟢 | Excellent | Perfect connection |
| 🟡 | Good | Slight delays possible |
| 🟠 | Fair | May experience lag |
| 🔴 | Poor | Video may freeze |
| ⚫ | Unknown | Checking... |

**If Network Quality is Poor:**
1. Move closer to WiFi router
2. Close other tabs/apps using internet
3. Disable video, use audio-only
4. Ask others to disable their video

---

## 🎓 **Best Practices**

### **Before Starting a Call:**
1. ✅ Test your camera/microphone in browser settings
2. ✅ Close unnecessary apps
3. ✅ Use wired internet if possible (faster than WiFi)
4. ✅ Use headphones to prevent echo
5. ✅ Find a quiet, well-lit location

### **During a Call:**
1. ✅ Mute when not speaking (reduces noise)
2. ✅ Disable video if network is slow
3. ✅ Use good lighting (face a window/lamp)
4. ✅ Keep browser tab active (don't minimize)

### **For Best Video Quality:**
1. ✅ Use Chrome (best Agora support)
2. ✅ Good lighting on your face
3. ✅ Stable internet connection
4. ✅ Close other video-heavy tabs

---

## 🔗 **Additional Resources**

- [Agora Web SDK Documentation](https://docs.agora.io/en/video-calling/overview/product-overview)
- [Browser Compatibility](https://docs.agora.io/en/help/other-issues/browser-support)
- [WebRTC Testing Tool](https://test.webrtc.org/)

---

**Need More Help?**

Check the browser console (F12) for detailed error messages and logs. All logs from the video call service start with `[VideoCallService]`.

---

*Last Updated: Phase 2 Implementation (February 2026)*
