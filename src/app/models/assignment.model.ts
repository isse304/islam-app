export interface Assignment {
  id: string;
  title: string;
  description: string;
  instructions: string;
  
  // Class Information
  classId: string;
  className: string;
  classColor: string;
  teacherId: string;
  teacherName: string;
  
  // Dates
  assignedDate: Date;
  dueDate: Date;
  
  // Status & Progress
  status: 'not_started' | 'in_progress' | 'submitted' | 'graded' | 'overdue';
  progress?: number; // 0-100 for multi-part assignments
  
  // Points & Grading
  totalPoints: number;
  earnedPoints?: number;
  weight?: number; // Percentage of final grade
  grade?: string; // Letter grade if graded
  
  // Content
  type: 'quiz' | 'essay' | 'recording' | 'project' | 'worksheet' | 'reading' | 'other';
  estimatedTime?: number; // Minutes
  
  // Settings
  allowLateSubmission: boolean;
  allowResubmission: boolean;
  
  // Attachments & Resources
  attachments?: AttachmentFile[];
  resources?: Resource[];
  
  // Submission
  submissionId?: string;
  submittedDate?: Date;
  
  // Feedback
  teacherFeedback?: string;
  gradedDate?: Date;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface AttachmentFile {
  id: string;
  name: string;
  url: string;
  type: string; // 'pdf', 'doc', 'image', 'video', etc.
  size?: number; // bytes
}

export interface Resource {
  id: string;
  title: string;
  type: 'link' | 'file' | 'video' | 'quran_reference' | 'hadith_reference';
  url?: string;
  description?: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  
  // Content
  content?: string; // Text content for essays, etc.
  attachments?: AttachmentFile[];
  recordingUrl?: string; // For Quran recitations
  
  // Status
  status: 'draft' | 'submitted' | 'pending_review' | 'graded';
  
  // Dates
  submittedAt?: Date;
  lastModifiedAt: Date;
  
  // Grading
  earnedPoints?: number;
  grade?: string;
  feedback?: string;
  gradedAt?: Date;
  gradedBy?: string;
  
  // Progress (for multi-part assignments)
  progress?: number; // 0-100
  completedParts?: string[];
}

export type AssignmentCategory = 
  | 'due_today' 
  | 'upcoming' 
  | 'due_later' 
  | 'completed' 
  | 'overdue' 
  | 'draft';

export interface AssignmentFilters {
  category?: AssignmentCategory;
  classId?: string;
  type?: Assignment['type'];
  searchTerm?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface AssignmentStats {
  total: number;
  dueToday: number;
  upcoming: number;
  overdue: number;
  completed: number;
  draft: number;
  completionRate: number;
  onTimeRate: number;
  averageGrade: number;
}





