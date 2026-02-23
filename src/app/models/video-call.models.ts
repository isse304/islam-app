import { Timestamp } from '@angular/fire/firestore';

/**
 * Call Session Status Types
 */
export type CallStatus = 'scheduled' | 'waiting' | 'active' | 'ended' | 'missed' | 'cancelled';

/**
 * Call Participant Role Types
 */
export type ParticipantRole = 'host' | 'participant';

/**
 * Call Invitation Status Types
 */
export type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled';

/**
 * Call Type
 */
export type CallType = 'one-on-one' | 'group';

/**
 * Represents a video/audio call session
 */
export interface CallSession {
  id: string;
  channelName: string;
  callType: CallType;
  
  // Participants
  hostId: string; // Usually the teacher
  participantIds: string[]; // Students or other participants
  
  // Status and timestamps
  status: CallStatus;
  scheduledAt?: Timestamp;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
  duration?: number; // in seconds
  
  // Call settings
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isRecording: boolean;
  isScreenSharing: boolean;
  
  // Recording
  recordingUrl?: string;
  recordingStartedAt?: Timestamp;
  recordingDuration?: number;
  
  // Metadata
  subject?: string;
  purpose?: string;
  notes?: string;
  classId?: string;
  assignmentId?: string;
  
  // Quality and analytics
  networkQuality?: NetworkQuality;
  
  // Post-call
  rating?: number; // 1-5 stars
  feedback?: string;
  
  // Prayer awareness
  scheduledDuringPrayer?: boolean;
  pausedForPrayer?: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Represents a participant in a call
 */
export interface CallParticipant {
  userId: string;
  callSessionId: string;
  role: ParticipantRole;
  
  // Join/leave tracking
  joinedAt: Timestamp;
  leftAt?: Timestamp;
  
  // Media state
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isScreenSharing: boolean;
  
  // User info (denormalized for quick access)
  displayName: string;
  photoURL?: string;
  userRole: 'teacher' | 'student';
  
  // Connection quality
  networkQuality?: number; // 0-6 scale (Agora standard)
  
  // Stats
  totalSpeakingTime?: number; // seconds
  connectionIssues?: number;
}

/**
 * Represents a call invitation
 */
export interface CallInvitation {
  id: string;
  
  // Parties
  fromUserId: string;
  fromUserName: string;
  fromUserPhoto?: string;
  fromUserRole: 'teacher' | 'student';
  
  toUserId: string;
  toUserName: string;
  toUserPhoto?: string;
  
  // Call details
  callSessionId: string;
  channelName: string;
  callType: CallType;
  
  // Status
  status: InvitationStatus;
  
  // Timing
  createdAt: Timestamp;
  respondedAt?: Timestamp;
  expiresAt: Timestamp;
  scheduledFor?: Timestamp; // For scheduled calls
  
  // Optional message
  message?: string;
  subject?: string;
  estimatedDuration?: number; // minutes
  
  // Response
  rejectionReason?: string;
  rescheduledTo?: Timestamp;
}

/**
 * Network quality metrics
 */
export interface NetworkQuality {
  uplinkNetworkQuality: number; // 0-6
  downlinkNetworkQuality: number; // 0-6
  uplinkBitrate?: number; // kbps
  downlinkBitrate?: number; // kbps
  rtt?: number; // Round trip time in ms
  packetLossRate?: number; // percentage
  lastUpdated: Timestamp;
}

/**
 * Call statistics and analytics
 */
export interface CallAnalytics {
  callSessionId: string;
  
  // Duration metrics
  totalDuration: number; // seconds
  activeTalkTime: number; // seconds with audio
  videoOnTime: number; // seconds with video
  screenShareTime: number; // seconds of screen sharing
  
  // Quality metrics
  averageNetworkQuality: number;
  connectionIssuesCount: number;
  audioDropouts: number;
  videoFreezes: number;
  
  // Participant metrics
  participantCount: number;
  participantEngagement: {
    [userId: string]: {
      speakingTime: number;
      attentionScore: number; // 0-100
      participationRate: number; // 0-100
    };
  };
  
  // Technical details
  resolution: string; // e.g., "1280x720"
  frameRate: number; // fps
  audioBitrate: number; // kbps
  videoBitrate: number; // kbps
  
  createdAt: Timestamp;
}

/**
 * User presence for call availability
 */
export interface UserPresence {
  userId: string;
  status: 'online' | 'offline' | 'busy' | 'in-call' | 'away';
  lastSeen: Timestamp;
  currentCallSessionId?: string;
  availableForCalls: boolean;
  customStatus?: string;
}

/**
 * Call settings and preferences
 */
export interface CallSettings {
  userId: string;
  
  // Default media settings
  defaultVideoEnabled: boolean;
  defaultAudioEnabled: boolean;
  preferredCamera?: string;
  preferredMicrophone?: string;
  preferredSpeaker?: string;
  
  // Video settings
  videoResolution: '360p' | '480p' | '720p' | '1080p';
  enableVirtualBackground: boolean;
  virtualBackgroundType: 'blur' | 'image' | 'none';
  virtualBackgroundImageUrl?: string;
  
  // Audio settings
  enableNoiseCancellation: boolean;
  enableEchoCancellation: boolean;
  microphoneVolume: number; // 0-100
  speakerVolume: number; // 0-100
  
  // Privacy settings
  requireCameraPermission: boolean;
  showVideoByDefault: boolean;
  allowRecording: boolean;
  notifyWhenRecording: boolean;
  
  // Prayer time settings
  enablePrayerTimeWarnings: boolean;
  autoPauseDuringPrayer: boolean;
  preventSchedulingDuringPrayer: boolean;
  location?: {
    latitude: number;
    longitude: number;
    timezone: string;
  };
  
  // Notification preferences
  enableCallNotifications: boolean;
  enableReminderNotifications: boolean;
  reminderMinutesBefore: number; // e.g., 5, 10, 15
  
  // Network settings
  adaptiveQuality: boolean;
  maxVideoBitrate?: number; // kbps
  preferAudioOnlyOnPoorConnection: boolean;
  
  updatedAt: Timestamp;
}

/**
 * Chat message during call
 */
export interface CallChatMessage {
  id: string;
  callSessionId: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  message: string;
  timestamp: Timestamp;
  isSystemMessage: boolean;
  attachments?: {
    type: 'file' | 'image' | 'link';
    url: string;
    name: string;
    size?: number;
  }[];
}

/**
 * Screen sharing session details
 */
export interface ScreenShareSession {
  callSessionId: string;
  userId: string;
  userName: string;
  startedAt: Timestamp;
  endedAt?: Timestamp;
  duration?: number;
  withAudio: boolean;
  allowRemoteControl: boolean;
  annotations?: ScreenAnnotation[];
}

/**
 * Screen annotation for collaborative features
 */
export interface ScreenAnnotation {
  id: string;
  userId: string;
  type: 'pen' | 'highlighter' | 'text' | 'shape';
  color: string;
  coordinates: { x: number; y: number }[];
  text?: string;
  timestamp: Timestamp;
}

/**
 * Call event for logging and debugging
 */
export interface CallEvent {
  id: string;
  callSessionId: string;
  type: 'join' | 'leave' | 'mute' | 'unmute' | 'camera-on' | 'camera-off' | 'screen-share-start' | 'screen-share-stop' | 'recording-start' | 'recording-stop' | 'quality-change' | 'error';
  userId?: string;
  data?: any;
  timestamp: Timestamp;
  severity?: 'info' | 'warning' | 'error';
}

/**
 * DTO for creating a new call
 */
export interface CreateCallRequest {
  participantIds: string[];
  callType: CallType;
  subject?: string;
  purpose?: string;
  scheduledAt?: Date;
  estimatedDuration?: number;
  message?: string;
  classId?: string;
  assignmentId?: string;
}

/**
 * DTO for Agora token request
 */
export interface AgoraTokenRequest {
  channelName: string;
  uid: number;
  role: 'publisher' | 'subscriber';
  expirationTime?: number; // in seconds, default 3600
}

/**
 * DTO for Agora token response
 */
export interface AgoraTokenResponse {
  token: string;
  channelName: string;
  uid: number;
  expirationTime: number;
}

/**
 * Call History Entry
 * Stored when a call ends for historical tracking
 */
export interface CallHistoryEntry {
  id: string;
  callSessionId: string;
  channelName: string;
  callType: CallType;
  
  // Participants
  hostId: string;
  hostName: string;
  hostPhoto?: string;
  participantIds: string[];
  participantNames: string[];
  
  // Timing
  startedAt: Timestamp;
  endedAt: Timestamp;
  duration: number; // in seconds
  
  // Call details
  wasVideoEnabled: boolean;
  wasAudioEnabled: boolean;
  wasRecorded: boolean;
  wasScreenShared: boolean;
  recordingUrl?: string;
  
  // Status
  callStatus: CallStatus; // ended, missed, cancelled
  
  // Metadata
  subject?: string;
  notes?: string;
  createdAt: Timestamp;
}
