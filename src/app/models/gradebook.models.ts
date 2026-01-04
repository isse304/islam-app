import { Timestamp } from '@angular/fire/firestore';

/**
 * Main grade book entry for a student
 */
export interface GradeBookEntry {
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentPhotoURL?: string;
  
  // Assignment scores mapped by assignment ID
  assignments: {
    [assignmentId: string]: {
      score: number | null;
      status: 'not_started' | 'in_progress' | 'submitted' | 'graded';
      submittedAt: Timestamp | null;
      gradedAt: Timestamp | null;
      rubric?: {
        tajweed: number;
        fluency: number;
        accuracy: number;
      };
    };
  };
  
  // Calculated metrics
  average: number;
  averageTajweed: number;
  averageFluency: number;
  averageAccuracy: number;
  totalAssignments: number;
  completedAssignments: number;
  completionRate: number;
  trend: 'improving' | 'declining' | 'stable';
  needsAttention: boolean;
  performanceBadges: PerformanceBadge[];
}

/**
 * Overall grade book statistics
 */
export interface GradeBookStats {
  totalStudents: number;
  needsAttention: number;
  topPerformers: number;
  pendingGrading: number;
  averageClassScore: number;
}

/**
 * Filter options for grade book
 */
export interface GradeBookFilters {
  performanceLevel: 'all' | 'needs_attention' | 'top_performers';
  sortBy: 'name_asc' | 'name_desc' | 'average_asc' | 'average_desc' | 'completion_asc' | 'completion_desc';
}

/**
 * Performance badge for visual indicators
 */
export interface PerformanceBadge {
  icon: string;
  label: string;
  color: string;
  description: string;
}

/**
 * Detailed student performance data
 */
export interface StudentPerformance {
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentPhotoURL?: string;
  
  // Performance metrics
  overallAverage: number;
  currentAverage: number; // Last 5 assignments
  bestScore: number;
  worstScore: number;
  recentScores: number[];
  
  // Rubric breakdown
  rubricAverages: {
    tajweed: number;
    fluency: number;
    accuracy: number;
  };
  
  // Trend analysis
  trend: TrendData;
  
  // Completion stats
  totalAssignments: number;
  completedAssignments: number;
  onTimeSubmissions: number;
  lateSubmissions: number;
  missedAssignments: number;
  completionRate: number;
  
  // Consistency
  scoreStandardDeviation: number;
  consistencyRating: 'high' | 'medium' | 'low';
  
  // Insights
  strengths: string[];
  weaknesses: string[];
  performanceBadges: PerformanceBadge[];
}

/**
 * Trend analysis data
 */
export interface TrendData {
  direction: 'improving' | 'stable' | 'declining';
  confidence: 'high' | 'medium' | 'low';
  slope: number;
  rSquared?: number;
  percentageChange: number;
}

/**
 * Grade with metadata
 */
export interface Grade {
  score: number;
  submittedAt: Timestamp;
  gradedAt?: Timestamp;
  rubric?: {
    tajweed: number;
    fluency: number;
    accuracy: number;
  };
}

/**
 * Student summary for lists
 */
export interface StudentSummary {
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentPhotoURL?: string;
  average: number;
  trend: 'improving' | 'declining' | 'stable';
  needsAttention: boolean;
}
