import { Component, Input, Output, EventEmitter, inject, OnChanges, SimpleChanges, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Submission } from 'src/app/models/classroom.models';
import { GradingService } from 'src/app/services/grading.service';
import { ToastService } from 'src/app/services/toast.service';
import { AudioUploadService } from 'src/app/services/audio-upload.service';

@Component({
  selector: 'app-grade-panel',
  templateUrl: './grade-panel.component.html',
  styleUrls: ['./grade-panel.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
})
export class GradePanelComponent implements OnChanges, AfterViewInit {
  @Input() submission!: Submission;
  @Output() graded = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
  @ViewChild('audioPlayer') audioPlayer?: ElementRef<HTMLAudioElement>;

  private fb = inject(FormBuilder);
  private gradingService = inject(GradingService);
  private toastService = inject(ToastService);
  private audioUploadService = inject(AudioUploadService);
  private cdr = inject(ChangeDetectorRef);

  gradeForm: FormGroup;
  audioDownloadUrl: string | null = null;
  isLoadingAudio = false;

  constructor() {
    this.gradeForm = this.fb.group({
      score: [null, [Validators.min(0), Validators.max(100)]],
      fluency: [null, [Validators.min(0), Validators.max(5)]],
      tajweed: [null, [Validators.min(0), Validators.max(5)]],
      accuracy: [null, [Validators.min(0), Validators.max(5)]],
      rubricNotes: [''],
      comment: [''],
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['submission'] && this.submission) {
      // Reset audio URL immediately to show loading state
      this.audioDownloadUrl = null;
      this.isLoadingAudio = false;
      
      this.gradeForm.patchValue({
        score: this.submission.score,
        fluency: this.submission.rubric?.fluency,
        tajweed: this.submission.rubric?.tajweed,
        accuracy: this.submission.rubric?.accuracy,
        rubricNotes: this.submission.rubric?.notes,
      });
      
      // Load audio if available
      if (this.submission.audioBlobPath) {
        this.loadAudioUrl(this.submission.audioBlobPath);
      }
    }
  }
  
  ngAfterViewInit() {
    // Load audio after view is initialized if we have a path
    if (this.submission?.audioBlobPath && !this.audioDownloadUrl) {
      this.loadAudioUrl(this.submission.audioBlobPath);
    }
  }
  
  private async loadAudioUrl(path: string): Promise<void> {
    if (this.isLoadingAudio) {
      console.log('Already loading audio, skipping...');
      return;
    }
    
    this.isLoadingAudio = true;
    console.log('Loading audio from path:', path);
    
    try {
      this.audioDownloadUrl = await this.audioUploadService.getDownloadUrl(path);
      console.log('Audio URL loaded:', this.audioDownloadUrl);
      
      // Trigger change detection
      this.cdr.detectChanges();
      
      // Force audio element to reload after URL is set and DOM is updated
      setTimeout(() => {
        if (this.audioPlayer?.nativeElement) {
          console.log('Forcing audio element to load');
          this.audioPlayer.nativeElement.load();
        } else {
          console.warn('Audio player element not found');
        }
        this.isLoadingAudio = false;
      }, 200);
    } catch (error) {
      console.error('Error loading audio:', error);
      this.toastService.showError('Failed to load audio recording');
      this.isLoadingAudio = false;
      this.audioDownloadUrl = null;
    }
  }
  
  closePanel() {
    this.closed.emit();
  }

  async submitGrade() {
    if (this.gradeForm.invalid) {
      this.toastService.showError('Please check your input values');
      return;
    }

    try {
      const formValue = this.gradeForm.value;
      await this.gradingService.gradeSubmission(this.submission.id, {
        score: formValue.score,
        rubric: {
          fluency: formValue.fluency,
          tajweed: formValue.tajweed,
          accuracy: formValue.accuracy,
          notes: formValue.rubricNotes,
        },
      });

      if (formValue.comment) {
        await this.gradingService.addTeacherComment(
          this.submission.id,
          formValue.comment
        );
      }

      this.toastService.success('✓ Grade submitted successfully!');
      this.graded.emit();
    } catch (error) {
      console.error('Error submitting grade:', error);
      this.toastService.showError('Failed to submit grade. Please try again.');
    }
  }
}
