import { Timestamp } from '@angular/fire/firestore';

export interface UserProfile {
  uid: string;
  role: 'teacher' | 'student' | 'parent';
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  linkedStudentIds?: string[];
}

export interface Class {
  id: string;
  name: string;
  ownerId: string; // teacher uid
  createdAt: Timestamp;
  memberIds: string[]; // student uids
  parentIds?: string[]; // parent uids
  code: string; // join code
}

export interface IndividualStudent {
  id: string; // Document ID (can be studentId or auto-generated)
  teacherId: string;
  studentId: string;
  studentEmail: string;
  studentName?: string;
  addedAt: Timestamp;
  notes?: string;
}

export interface Assignment {
  id: string;
  classId?: string; // Optional: for classroom mode
  studentId?: string; // Optional: for 1-on-1 mode
  teacherId: string;
  title: string;
  surah: number;
  startAyah: number;
  endAyah: number;
  tajweedFocus?: string[];
  notes?: string;
  dueAt?: Timestamp;
  deepLink: string; // precomputed
  createdAt: Timestamp;
  mode: 'classroom' | 'individual'; // Track which mode this assignment uses
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  submittedAt: Timestamp;
  status: 'not_started' | 'in_progress' | 'submitted' | 'graded';
  score?: number;
  wpm?: number;
  mistakes?: { ayah: number; tag: string; note?: string }[];
  audioBlobPath?: string;
  comments?: string;
  gradedAt?: Timestamp;
  gradedBy?: string; // teacher uid
  rubric?: {
    fluency?: number; // 0–5
    tajweed?: number; // 0–5
    accuracy?: number; // 0–5 or %
    notes?: string;
    tags?: string[]; // e.g. ["idgham", "ikhfa"]
  };
  practiceData?: {
    totalAttempts: number;
    versesCompleted: number;
    totalVerses: number;
    completionPercentage: number;
    perVerseAttempts: { [ayahKey: string]: number };
    lastPracticedAt?: Timestamp;
  };
  teacherComments?: { uid: string; text: string; at: Timestamp }[];
}

export interface Report {
  id: string;
  timeframe: { from: Timestamp; to: Timestamp };
  classId: string;
  studentId: string;
  metrics: {
    assignmentsAssigned: number;
    assignmentsCompleted: number;
    avgScore?: number;
    minutesPracticed?: number;
    attempts?: number;
    versesCovered?: number;
    tajweedTagCounts?: { [tag: string]: number };
  };
  generatedAt: Timestamp;
}

export interface Notification {
  id: string;
  toUid: string;
  type: 'assignment_posted' | 'due_soon' | 'graded' | 'comment' | 'submission_received';
  ref: { collection: string; id: string };
  title: string;
  body: string;
  read: boolean;
  createdAt: Timestamp;
  metadata?: {
    assignmentId?: string;
    studentId?: string;
    classId?: string;
    studentName?: string;
  };
}

export interface Progress {
  id: string;
  studentId: string;
  assignmentId: string;
  ayahKey: string; // e.g., "2:255"
  attempts: number;
  lastHeardAt: Timestamp;
  lastScore?: number;
  completion: number; // 0..100
}
