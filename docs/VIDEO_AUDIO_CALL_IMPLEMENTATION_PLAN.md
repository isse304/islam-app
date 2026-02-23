# Video/Audio Call Feature Implementation Plan

**Version:** 1.0  
**Date:** February 11, 2026  
**Feature:** Real-Time Audio/Video Communication Between Teachers and Students

---

## Table of Contents

1. [Overview](#overview)
2. [API Options Research](#api-options-research)
3. [Recommended Solution](#recommended-solution)
4. [Implementation Plan](#implementation-plan)
5. [Technical Architecture](#technical-architecture)
6. [Feature Specifications](#feature-specifications)
7. [Security & Privacy](#security--privacy)
8. [Cost Analysis](#cost-analysis)
9. [Timeline & Milestones](#timeline--milestones)

---

## Overview

### Feature Goals

Enable real-time video and audio communication between teachers and students for:
- **One-on-One Tutoring:** Private teaching sessions
- **Office Hours:** Teacher availability windows
- **Assignment Help:** Quick check-ins and clarifications
- **Virtual Study Sessions:** Group learning opportunities
- **Parent-Teacher Meetings:** Communication with parents

### Key Requirements

- ✅ **Low Latency:** < 300ms for real-time interaction
- ✅ **High Quality:** HD video (720p minimum), clear audio
- ✅ **Scalability:** Support 1-on-1 and group calls (up to 10 participants)
- ✅ **Browser-Based:** No downloads required
- ✅ **Mobile Support:** iOS and Android compatibility
- ✅ **Recording:** Optional session recording for review
- ✅ **Screen Sharing:** Share documents and presentations
- ✅ **Chat:** Text messaging during calls
- ✅ **Islamic Features:** Prayer time awareness, appropriate content filtering

---

## API Options Research

### 1. **Agora.io** ⭐ RECOMMENDED

**Overview:** Enterprise-grade real-time engagement platform

**Pros:**
- ✅ Excellent documentation and Angular SDK
- ✅ 10,000 free minutes/month
- ✅ Ultra-low latency (< 400ms globally)
- ✅ Built-in recording and storage
- ✅ Screen sharing, chat, whiteboard
- ✅ Advanced features: AI noise cancellation, background blur
- ✅ Strong presence in education sector
- ✅ GDPR and HIPAA compliant

**Cons:**
- ❌ Pricing can scale up quickly
- ❌ Learning curve for advanced features

**Pricing:**
- Free: 10,000 minutes/month
- Pay-as-you-go: $0.99 per 1,000 minutes (HD)
- Enterprise: Custom pricing

**Best For:** Production-ready applications needing reliability and scalability

**Website:** https://www.agora.io/

---

### 2. **Daily.co**

**Overview:** Modern video API built for developers

**Pros:**
- ✅ Clean, simple API
- ✅ 10,000 free minutes/month
- ✅ Excellent React/Angular integration
- ✅ Built-in UI components
- ✅ Recording and live streaming
- ✅ Great developer experience
- ✅ Transparent pricing

**Cons:**
- ❌ Fewer advanced features than Agora
- ❌ Smaller ecosystem

**Pricing:**
- Free: 10,000 minutes/month, max 10 rooms
- Starter: $99/month - 100,000 minutes
- Scale: $299/month - 500,000 minutes

**Best For:** Startups wanting quick implementation

**Website:** https://www.daily.co/

---

### 3. **Twilio Video**

**Overview:** Comprehensive communication platform

**Pros:**
- ✅ Part of larger Twilio ecosystem
- ✅ Programmable video rooms
- ✅ Good documentation
- ✅ Network quality API for monitoring
- ✅ Recording and composition
- ✅ Global infrastructure

**Cons:**
- ❌ More expensive than competitors
- ❌ Complex pricing structure
- ❌ No free tier (only trial credits)

**Pricing:**
- Trial: $15 in credits
- Group Rooms: $0.004/participant-minute
- Peer-to-peer: $0.0015/participant-minute
- Recording: $0.004/minute

**Best For:** Projects already using Twilio services

**Website:** https://www.twilio.com/video

---

### 4. **WebRTC (Native Implementation)**

**Overview:** Open-source browser API for P2P communication

**Pros:**
- ✅ Completely free
- ✅ No third-party dependencies
- ✅ Built into all modern browsers
- ✅ Maximum control and customization
- ✅ No API rate limits

**Cons:**
- ❌ Complex to implement correctly
- ❌ Requires signaling server (Socket.io/WebSocket)
- ❌ Need to handle STUN/TURN servers
- ❌ No built-in recording or advanced features
- ❌ More maintenance required

**Cost:**
- Free (only server hosting costs)
- TURN server: ~$20-50/month

**Best For:** Projects with WebRTC expertise and dev resources

**Implementation:** Custom using Socket.io + Firebase

---

### 5. **Jitsi Meet**

**Overview:** Open-source video conferencing platform

**Pros:**
- ✅ Completely free and open-source
- ✅ Self-hostable
- ✅ Can use free Jitsi servers
- ✅ Good quality
- ✅ No account required for users

**Cons:**
- ❌ Free servers can be unreliable
- ❌ Limited customization on free tier
- ❌ Self-hosting requires DevOps expertise
- ❌ Basic UI

**Pricing:**
- Free: Public Jitsi servers (meet.jit.si)
- JaaS (Jitsi as a Service): $0.009/participant-minute
- Self-hosted: Infrastructure costs only

**Best For:** Budget-conscious projects or self-hosting

**Website:** https://jitsi.org/

---

### 6. **Whereby**

**Overview:** Simple embedded video meeting rooms

**Pros:**
- ✅ Extremely easy to embed
- ✅ No downloads needed
- ✅ Beautiful UI
- ✅ Free tier available
- ✅ Recording included

**Cons:**
- ❌ Less flexible than other APIs
- ❌ Limited to room-based model
- ❌ Can't customize UI heavily

**Pricing:**
- Free: 1 room, unlimited participants
- Pro: $6.99/room/month
- Business: $9.99/room/month

**Best For:** Quick MVP implementations

**Website:** https://whereby.com/

---

### 7. **Zoom SDK**

**Overview:** Integrate Zoom into your app

**Pros:**
- ✅ Familiar interface for users
- ✅ Excellent quality and reliability
- ✅ Advanced features (breakout rooms, polls)
- ✅ Strong brand recognition

**Cons:**
- ❌ Expensive for development
- ❌ Less customizable
- ❌ Requires Zoom branding
- ❌ Complex licensing

**Pricing:**
- Meeting SDK: $1,800/year per app
- Video SDK: Custom pricing

**Best For:** Enterprise deployments

**Website:** https://marketplace.zoom.us/

---

## Recommended Solution

### **Primary: Agora.io** 🏆

**Rationale:**
1. **Free Tier:** 10,000 minutes covers ~167 hours of 1-on-1 calls
2. **Education Focus:** Used by major EdTech companies
3. **Angular Support:** Official Angular SDK and samples
4. **Feature Rich:** Everything needed for educational use
5. **Scalability:** Can grow from MVP to enterprise
6. **Reliability:** 99.99% SLA
7. **Islamic Friendly:** Can integrate custom moderation

**Estimated Costs (Monthly):**
- **Month 1-3 (Beta):** $0 (within free tier)
- **100 students, 2hrs/student/month:** 200 hours = 12,000 min = ~$12
- **500 students, 2hrs/student/month:** 1,000 hours = 60,000 min = ~$59
- **1,000 students, 2hrs/student/month:** 2,000 hours = 120,000 min = ~$119

### **Backup: Daily.co**

Use if Agora proves too complex or expensive.

---

## Implementation Plan

### Phase 1: Foundation (Week 1-2)

**Goals:** Set up basic infrastructure

**Tasks:**
1. Create Agora.io account and get credentials
2. Install Agora Angular SDK: `npm install agora-rtc-sdk-ng`
3. Create `VideoCallService` in Angular
4. Set up Firebase function for token generation
5. Create basic call UI component
6. Test 1-on-1 connection

**Deliverables:**
- Working video/audio connection between two users
- Basic UI with camera/mic controls

---

### Phase 2: Core Features (Week 3-4)

**Goals:** Build essential calling features

**Tasks:**
1. Implement call invitation system
2. Add user presence detection (online/offline)
3. Create call notification system
4. Build waiting room UI
5. Add call controls (mute, camera toggle, hang up)
6. Implement call duration tracking
7. Add network quality indicator

**Deliverables:**
- Teacher can initiate call to student
- Student receives notification and can accept/reject
- Full call control interface

---

### Phase 3: Advanced Features (Week 5-6)

**Goals:** Enhance user experience

**Tasks:**
1. Implement screen sharing
2. Add in-call text chat
3. Create virtual background/blur
4. Add recording functionality
5. Implement call history log
6. Create scheduling system
7. Add call analytics dashboard

**Deliverables:**
- Screen sharing for teaching
- Recording for review
- Scheduled call system

---

### Phase 4: Islamic Features (Week 7)

**Goals:** Add Islamic-appropriate features

**Tasks:**
1. Prayer time integration
   - Auto-pause during prayer times
   - Prayer time reminders
2. Gender-appropriate defaults
   - Camera off by default option
   - Privacy settings
3. Content moderation
   - AI-powered inappropriate content detection
4. Islamic UI elements
   - Crescent moon indicators
   - Bismillah before calls
   - Duaa after calls

**Deliverables:**
- Prayer-aware calling system
- Privacy-first defaults
- Islamic aesthetic integration

---

### Phase 5: Testing & Polish (Week 8)

**Goals:** Ensure production readiness

**Tasks:**
1. Cross-browser testing (Chrome, Safari, Firefox, Edge)
2. Mobile device testing (iOS, Android)
3. Load testing (concurrent calls)
4. Network resilience testing (poor connections)
5. Security audit
6. Performance optimization
7. Documentation

**Deliverables:**
- Fully tested, production-ready system
- Documentation and training materials

---

## Technical Architecture

### Component Structure

```
app/
├── features/
│   └── video-call/
│       ├── video-call.component
│       ├── call-controls.component
│       ├── participant-list.component
│       ├── chat-panel.component
│       ├── waiting-room.component
│       └── call-history.component
├── services/
│   ├── video-call.service.ts
│   ├── call-notification.service.ts
│   ├── call-recording.service.ts
│   └── prayer-awareness.service.ts
└── models/
    ├── call.model.ts
    ├── participant.model.ts
    └── call-event.model.ts
```

### Service: VideoCallService

```typescript
import AgoraRTC, { 
  IAgoraRTCClient, 
  ICameraVideoTrack, 
  IMicrophoneAudioTrack 
} from 'agora-rtc-sdk-ng';

export class VideoCallService {
  private client: IAgoraRTCClient;
  private localVideoTrack?: ICameraVideoTrack;
  private localAudioTrack?: IMicrophoneAudioTrack;
  
  async initializeCall(channelName: string, token: string) {
    // Initialize Agora client
    this.client = AgoraRTC.createClient({ 
      mode: 'rtc', 
      codec: 'vp8' 
    });
    
    // Create local tracks
    [this.localAudioTrack, this.localVideoTrack] = 
      await AgoraRTC.createMicrophoneAndCameraTracks();
    
    // Join channel
    await this.client.join(
      environment.agora.appId, 
      channelName, 
      token
    );
    
    // Publish tracks
    await this.client.publish([
      this.localAudioTrack, 
      this.localVideoTrack
    ]);
  }
  
  async endCall() {
    this.localAudioTrack?.close();
    this.localVideoTrack?.close();
    await this.client.leave();
  }
  
  toggleMute() {
    this.localAudioTrack?.setEnabled(
      !this.localAudioTrack.enabled
    );
  }
  
  toggleCamera() {
    this.localVideoTrack?.setEnabled(
      !this.localVideoTrack.enabled
    );
  }
}
```

### Firebase Cloud Function: Token Generation

```typescript
import * as functions from 'firebase-functions';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';

export const generateAgoraToken = functions.https.onCall(
  async (data, context) => {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }
    
    const { channelName, role, uid } = data;
    const appId = functions.config().agora.app_id;
    const appCertificate = functions.config().agora.certificate;
    
    // Token expires in 1 hour
    const expirationTime = Math.floor(Date.now() / 1000) + 3600;
    
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER,
      expirationTime
    );
    
    return { token, uid, channelName };
  }
);
```

### Firestore Data Model

```typescript
// Call Session
interface CallSession {
  id: string;
  channelName: string;
  teacherId: string;
  studentId: string;
  status: 'scheduled' | 'waiting' | 'active' | 'ended' | 'missed';
  scheduledAt?: Timestamp;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
  duration?: number; // seconds
  recordingUrl?: string;
  participants: {
    userId: string;
    joinedAt: Timestamp;
    leftAt?: Timestamp;
    role: 'host' | 'participant';
  }[];
  metadata: {
    subject?: string;
    notes?: string;
    rating?: number;
    feedback?: string;
  };
}

// Call Invitation
interface CallInvitation {
  id: string;
  fromUserId: string;
  toUserId: string;
  callSessionId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  createdAt: Timestamp;
  expiresAt: Timestamp;
  message?: string;
}
```

---

## Feature Specifications

### 1. Call Initiation Flow

**Teacher Perspective:**
1. Navigate to student profile or class roster
2. Click "Start Video Call" button
3. System checks student online status
4. If online: Send instant invitation
5. If offline: Option to schedule call
6. Wait in "calling" state (max 60 seconds)
7. If accepted: Join call
8. If no response: Show "unavailable" message

**Student Perspective:**
1. Receive notification (browser + in-app)
2. See caller info (teacher name, photo, subject)
3. Options: Accept, Decline, or Reschedule
4. If Accept: Join call immediately
5. If Decline: Send optional message
6. Notification expires after 60 seconds

### 2. In-Call UI Components

**Main Video Panel:**
- Large video for remote participant
- Small PIP (picture-in-picture) for self
- Swap button to switch views

**Control Bar (Bottom):**
- 🎤 Microphone toggle (red when muted)
- 📹 Camera toggle (red when off)
- 🖥️ Screen share button
- 💬 Chat toggle
- ⚙️ Settings
- 🔴 Record button (teacher only)
- 📵 End call (red button)

**Side Panel (Optional):**
- Participant list
- Chat messages
- Shared files
- Call notes

**Top Bar:**
- Call duration counter
- Connection quality indicator
- Participant count
- Record indicator (if active)

### 3. Screen Sharing

**Features:**
- Share entire screen or specific window
- Share with audio option
- Remote control (with permission)
- Annotation tools
- Screenshot capture

**Use Cases:**
- Teacher shares lesson materials
- Student shares homework for review
- Collaborative document editing
- Troubleshooting technical issues

### 4. Recording System

**Specifications:**
- Cloud recording via Agora
- Automatic storage in Firebase Storage
- Recording starts when host clicks record
- All participants notified when recording
- Max recording length: 2 hours
- Automatic transcription (optional)
- Downloadable MP4 format

**Storage:**
```
recordings/
  {callSessionId}/
    video.mp4
    audio.mp3 (audio-only option)
    transcript.txt
    metadata.json
```

### 5. Call Scheduling

**Features:**
- Calendar integration
- Recurring sessions (weekly lessons)
- Email/SMS reminders
- Time zone awareness
- Waiting room before scheduled time
- Auto-start at scheduled time

**UI:**
- Date/time picker
- Duration selector (15, 30, 45, 60 min)
- Add to calendar button
- Reminder preferences

### 6. Prayer Time Integration

**Behavior:**
```typescript
interface PrayerAwareCall {
  // Auto-pause call 5 minutes before prayer
  beforePrayerWarning: boolean;
  
  // Suggest rescheduling if call during prayer
  preventPrayerTimeScheduling: boolean;
  
  // Option to mute notifications during prayer
  muteNotificationsDuringPrayer: boolean;
  
  // Display prayer time countdown in call
  showPrayerTimeIndicator: boolean;
}
```

**User Settings:**
- Enable/disable prayer awareness
- Set location for accurate times
- Choose madhab for calculation

---

## Security & Privacy

### Access Control

```typescript
// Firestore Security Rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /callSessions/{sessionId} {
      allow read: if request.auth != null && (
        request.auth.uid == resource.data.teacherId ||
        request.auth.uid == resource.data.studentId
      );
      
      allow create: if request.auth != null;
      
      allow update: if request.auth != null && (
        request.auth.uid == resource.data.teacherId ||
        request.auth.uid == resource.data.studentId
      );
    }
  }
}
```

### Privacy Features

**Default Settings:**
- Camera off by default (user choice)
- Audio only option
- Virtual background/blur enabled
- Recording requires consent from all participants
- Automatic deletion of recordings after 30 days

**Student Protection:**
- Parent/guardian consent for minors
- Teacher-student calls logged and auditable
- No direct student-to-student calls (unless approved)
- Emergency "report" button in call
- Call monitoring option for parents

### Encryption

- End-to-end encryption for signaling
- TLS 1.3 for all connections
- Encrypted storage for recordings
- Token-based authentication
- Regular security audits

---

## Cost Analysis

### Monthly Cost Projections

**Scenario 1: Small School (100 students)**
- Average usage: 2 hours/student/month
- Total minutes: 12,000
- Cost: **$11.88/month**

**Scenario 2: Medium School (500 students)**
- Average usage: 2 hours/student/month
- Total minutes: 60,000
- Cost: **$59.40/month**

**Scenario 3: Large School (1,000 students)**
- Average usage: 2 hours/student/month
- Total minutes: 120,000
- Cost: **$118.80/month**

**Additional Costs:**
- Recording storage: ~$0.023/GB/month (Firebase)
- Cloud functions: ~$0.40/million invocations
- Bandwidth: Included in Agora pricing

### Cost Optimization Strategies

1. **Audio-Only Mode:** Use for non-visual lessons (50% cost reduction)
2. **Time Limits:** Cap call duration to prevent abuse
3. **Scheduling:** Encourage scheduled vs. ad-hoc calls
4. **Recording Settings:** Optional recording (saves storage)
5. **Quality Settings:** Adaptive bitrate based on connection

---

## Timeline & Milestones

### 8-Week Implementation

**Week 1-2: Foundation**
- ✅ Agora setup and basic connection
- ✅ Token generation system
- ✅ Simple 1-on-1 call

**Week 3-4: Core Features**
- ✅ Call invitations
- ✅ UI controls
- ✅ Notifications
- ✅ Call history

**Week 5-6: Advanced**
- ✅ Screen sharing
- ✅ Chat
- ✅ Recording
- ✅ Scheduling

**Week 7: Islamic Features**
- ✅ Prayer integration
- ✅ Privacy defaults
- ✅ Content moderation

**Week 8: Testing & Launch**
- ✅ QA and bug fixes
- ✅ Documentation
- ✅ Beta launch

### Success Metrics

**Technical:**
- Call connection success rate: > 95%
- Average latency: < 300ms
- Video quality: 720p stable
- Audio quality: > 90 opinion score

**User Experience:**
- Time to join call: < 30 seconds
- User satisfaction: > 4.5/5 stars
- Teacher adoption: > 70% within 3 months
- Student engagement: > 50% weekly usage

---

## Next Steps

### Immediate Actions

1. **Decision:** Approve Agora.io as primary vendor
2. **Account Setup:** Create Agora developer account
3. **Budget Approval:** Allocate $500 for initial 3 months
4. **Team Assignment:** Assign 1-2 developers
5. **Timeline Confirmation:** Confirm 8-week schedule

### Phase 1 Kick-off

1. Install dependencies: `npm install agora-rtc-sdk-ng`
2. Create feature branch: `feature/video-audio-calls`
3. Set up development environment
4. Create basic proof-of-concept
5. Weekly check-ins and demos

---

## Resources & Documentation

**Agora Documentation:**
- Getting Started: https://docs.agora.io/en/video-calling/get-started/get-started-sdk
- Angular Guide: https://docs.agora.io/en/video-calling/develop/integrate-sdk
- API Reference: https://api-ref.agora.io/en/video-sdk/web/4.x/

**Sample Projects:**
- Agora Angular Demo: https://github.com/AgoraIO-Community/Angular-SDK
- Agora Education: https://github.com/AgoraIO-Usecase/eEducation

**Tutorials:**
- Build Video Chat in Angular: https://www.agora.io/en/blog/build-video-chat-angular/
- WebRTC Basics: https://webrtc.org/getting-started/overview

**Best Practices:**
- EdTech Video Best Practices: https://www.agora.io/en/solutions/education/
- Scaling Video Applications: https://docs.agora.io/en/video-calling/overview/best-practices

---

**End of Implementation Plan**

*Ready to transform Nura Academy into a comprehensive virtual learning platform!* 🎥✨

---

## Quick Start Commands

```bash
# Install Agora SDK
npm install agora-rtc-sdk-ng

# Install Firebase Functions dependencies
cd functions
npm install agora-access-token

# Environment variables (.env)
AGORA_APP_ID=your_app_id_here
AGORA_APP_CERTIFICATE=your_certificate_here

# Start development
ng serve
```
