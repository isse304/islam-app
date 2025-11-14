# Assignment Submission Enhancement Prompts

## OPTION 2: Add Practice Progress to Submission (Quick Win - 10-15 minutes)

### Goal
Enhance the assignment submission to include practice progress data, showing the teacher how much effort the student put into practicing before submitting.

### Current State
- Submission only records: `assignmentId`, `studentId`, `submittedAt`, `status: 'submitted'`
- No indication of how much the student practiced
- Teacher has no visibility into student effort

### Desired State
When a student submits an assignment, include their practice progress:
- Total number of practice attempts across all verses
- Number of verses practiced at least once
- Per-verse practice counts
- Optional: Average scores if available from practice sessions

### Technical Requirements

#### 1. Update Submission Model
Extend the `Submission` interface in `src/app/models/classroom.models.ts` to include:
```typescript
practiceData?: {
  totalAttempts: number;           // Sum of all practice attempts
  versesCompleted: number;         // Count of verses practiced at least once
  totalVerses: number;             // Total verses in assignment
  completionPercentage: number;    // (versesCompleted / totalVerses) * 100
  perVerseAttempts: {              // Detailed breakdown
    [ayahKey: string]: number;     // e.g., "44:9": 3, "44:10": 5
  };
  lastPracticedAt?: Timestamp;     // When they last practiced
};
```

#### 2. Modify `onSubmitAssignment()` in QuranReaderComponent
Before calling `submissionService.submitAssignment()`:
- Query the `Progress` collection for all progress records matching this `assignmentId` and current `studentId`
- Aggregate the practice data:
  - Count total attempts across all verses
  - Count how many unique verses were practiced
  - Build the `perVerseAttempts` map
  - Find the most recent `lastHeardAt` timestamp
- Pass this aggregated data to the submission service

#### 3. Update `SubmissionService.submitAssignment()`
Modify the method signature to accept practice data:
```typescript
async submitAssignment(
  assignmentId: string, 
  practiceData?: Submission['practiceData']
): Promise<void>
```

When creating/updating the submission, include the `practiceData` field.

#### 4. Display in Teacher Dashboard (Optional Enhancement)
In the teacher's grading interface, show:
- "Student practiced X times across Y verses"
- Visual indicator (e.g., progress bar) showing completion percentage
- Per-verse practice counts in a table or chart

### Implementation Steps
1. Update `Submission` interface with `practiceData` field
2. Create helper method in `ProgressService` to aggregate practice data for an assignment:
   ```typescript
   async getAggregatedProgress(assignmentId: string, studentId: string): Promise<PracticeData>
   ```
3. Update `onSubmitAssignment()` to fetch and include practice data
4. Update `SubmissionService.submitAssignment()` to accept and store practice data
5. Test submission with practice data
6. (Optional) Update teacher grading UI to display practice data

### Acceptance Criteria
- ✅ When student submits, practice data is included in the submission document
- ✅ Practice data accurately reflects all practice sessions from the `Progress` collection
- ✅ Submission succeeds even if no practice data exists (graceful fallback)
- ✅ Teacher can view practice data in Firestore console
- ✅ No errors or performance issues

### Edge Cases to Handle
- Student submits without practicing any verses (practiceData should be null or show 0 attempts)
- Student practices some verses but not all (show partial completion)
- Multiple submissions (practice data should reflect cumulative practice up to submission time)

---

## OPTION 3: Add Audio Recording to Submission (Medium Complexity - 45-60 minutes)

### Goal
Enable students to record their recitation of the assignment verses and submit the audio along with the assignment. Teachers can then listen to the recording and grade accordingly.

### Current State
- No audio recording capability in assignment mode
- Submissions are text-only (just metadata)
- Teachers must grade based on in-person recitation or memory

### Desired State
- Students can record their recitation of all assignment verses (or individual verses)
- Audio is uploaded to Firebase Storage
- Submission includes reference to the audio file
- Teachers can play back the recording when grading
- Optional: Waveform visualization, playback controls, download option

### Technical Requirements

#### 1. Update Submission Model
The `Submission` interface already has:
```typescript
audioBlobPath?: string;  // Path to audio file in Firebase Storage
```

No model changes needed, but we'll use this field.

#### 2. Add Audio Recording UI to Homework Bar

**Full Mode Homework Bar:**
Add a recording section with:
- 🎤 **"Record Recitation"** button
- Recording indicator (red dot, timer)
- **"Stop Recording"** button
- **"Play Recording"** button (to review before submitting)
- **"Re-record"** button (to start over)
- Visual feedback: waveform or audio levels

**Compact Mode:**
- Show recording status if recording is in progress
- Pause recording when minimized (or keep recording in background)

#### 3. Implement Audio Recording Service

Create `src/app/services/audio-recording.service.ts`:

```typescript
@Injectable({ providedIn: 'root' })
export class AudioRecordingService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  // Request microphone permission and start recording
  async startRecording(): Promise<void>

  // Stop recording and return audio blob
  async stopRecording(): Promise<Blob>

  // Check if recording is in progress
  isRecording(): boolean

  // Get recording duration
  getRecordingDuration(): number

  // Cancel recording without saving
  cancelRecording(): void
}
```

#### 4. Implement Audio Upload Service

Create `src/app/services/audio-upload.service.ts` or extend existing service:

```typescript
@Injectable({ providedIn: 'root' })
export class AudioUploadService {
  private storage = inject(Storage); // Firebase Storage

  // Upload audio blob to Firebase Storage
  async uploadRecording(
    audioBlob: Blob,
    assignmentId: string,
    studentId: string
  ): Promise<string> {
    // Generate unique filename
    const filename = `assignments/${assignmentId}/submissions/${studentId}_${Date.now()}.webm`;
    
    // Upload to Firebase Storage
    const storageRef = ref(this.storage, filename);
    await uploadBytes(storageRef, audioBlob);
    
    // Return the storage path (not download URL for security)
    return filename;
  }

  // Get download URL for playback (with security rules)
  async getDownloadUrl(storagePath: string): Promise<string>

  // Delete audio file (for re-recording)
  async deleteRecording(storagePath: string): Promise<void>
}
```

#### 5. Update QuranReaderComponent

Add state for recording:
```typescript
public isRecording: boolean = false;
public recordingDuration: number = 0;
public recordedAudioBlob: Blob | null = null;
public recordedAudioUrl: string | null = null; // For playback preview
private recordingTimer: any = null;
```

Add methods:
```typescript
public async startRecording(): Promise<void>
public async stopRecording(): Promise<void>
public playRecordedAudio(): void
public async reRecord(): Promise<void>
```

#### 6. Update Homework Bar Template

Add recording controls to `quran-reader.component.html`:

**In Full Mode Homework Bar:**
```html
<!-- Recording Section -->
<div class="flex flex-col gap-2 border-t border-slate-600 pt-3 mt-3">
  <div class="text-xs text-slate-400 font-semibold">Audio Recording</div>
  
  <!-- Not Recording State -->
  <div *ngIf="!isRecording && !recordedAudioBlob" class="flex gap-2">
    <button (click)="startRecording()" 
            class="px-3 py-2 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-500 flex items-center gap-2">
      <svg><!-- Microphone icon --></svg>
      Record Recitation
    </button>
    <div class="text-xs text-slate-400 self-center">
      Record yourself reciting the verses
    </div>
  </div>

  <!-- Recording In Progress -->
  <div *ngIf="isRecording" class="flex items-center gap-3">
    <div class="flex items-center gap-2">
      <div class="w-3 h-3 rounded-full bg-red-600 animate-pulse"></div>
      <span class="text-sm font-mono">{{ recordingDuration | number:'2.0-0' }}s</span>
    </div>
    <button (click)="stopRecording()"
            class="px-3 py-2 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600">
      ⏹ Stop Recording
    </button>
  </div>

  <!-- Recording Complete -->
  <div *ngIf="recordedAudioBlob && !isRecording" class="flex gap-2">
    <button (click)="playRecordedAudio()"
            class="px-3 py-2 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-500 flex items-center gap-2">
      <svg><!-- Play icon --></svg>
      Play Recording
    </button>
    <button (click)="reRecord()"
            class="px-3 py-2 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600">
      🔄 Re-record
    </button>
    <div class="text-xs text-green-400 self-center">
      ✓ Recording ready to submit
    </div>
  </div>
</div>
```

#### 7. Update `onSubmitAssignment()`

Before submitting:
```typescript
public async onSubmitAssignment(): Promise<void> {
  if (!this.assignmentId) {
    this.toastService.showError('No assignment ID found.');
    return;
  }

  try {
    let audioBlobPath: string | undefined;

    // Upload audio recording if exists
    if (this.recordedAudioBlob) {
      this.toastService.showInfo('Uploading audio recording...');
      audioBlobPath = await this.audioUploadService.uploadRecording(
        this.recordedAudioBlob,
        this.assignmentId,
        this.authService.currentUser!.uid
      );
    }

    // Submit with audio path
    await this.submissionService.submitAssignment(
      this.assignmentId,
      undefined, // practiceData (from Option 2)
      audioBlobPath
    );
    
    this.toastService.success('✓ Assignment submitted successfully!');
    
    // Clean up
    this.recordedAudioBlob = null;
    this.recordedAudioUrl = null;
    this.homeworkBar.visible = false;
    this.changeDetector.markForCheck();
    
    setTimeout(() => {
      this.router.navigate(['/s/assignments']);
    }, 1500);
    
  } catch (error: any) {
    console.error('Error submitting assignment:', error);
    this.toastService.showError(error.message || 'Failed to submit assignment.');
  }
}
```

#### 8. Update `SubmissionService.submitAssignment()`

```typescript
async submitAssignment(
  assignmentId: string,
  practiceData?: Submission['practiceData'],
  audioBlobPath?: string
): Promise<void> {
  const user = this.auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const q = query(
    this.submissionsCollection,
    where('assignmentId', '==', assignmentId),
    where('studentId', '==', user.uid)
  );
  const existingSubmissions = await getDocs(q);

  const submissionData: any = {
    status: 'submitted',
    submittedAt: serverTimestamp() as Timestamp,
  };

  if (practiceData) {
    submissionData.practiceData = practiceData;
  }

  if (audioBlobPath) {
    submissionData.audioBlobPath = audioBlobPath;
  }

  if (!existingSubmissions.empty) {
    // Update existing
    const submissionRef = existingSubmissions.docs[0].ref;
    await updateDoc(submissionRef, submissionData);
  } else {
    // Create new
    const submissionId = doc(collection(this.firestore, '_')).id;
    const submissionRef = doc(this.submissionsCollection, submissionId);
    
    const newSubmission: Omit<Submission, 'id'> = {
      assignmentId,
      studentId: user.uid,
      ...submissionData,
    };

    await setDoc(submissionRef, newSubmission);
  }
}
```

#### 9. Firebase Storage Security Rules

Update `storage.rules`:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Assignment submission audio files
    match /assignments/{assignmentId}/submissions/{filename} {
      // Students can upload their own recordings
      allow write: if request.auth != null 
                   && filename.matches('.*_' + request.auth.uid + '_.*');
      
      // Teachers and the student who uploaded can read
      allow read: if request.auth != null 
                  && (request.auth.token.role == 'teacher' 
                      || filename.matches('.*_' + request.auth.uid + '_.*'));
    }
  }
}
```

#### 10. Teacher Grading Interface (Separate Task)

In the teacher's submission review component:
- Display audio player for recorded submissions
- Show waveform visualization
- Playback controls (play, pause, seek, speed)
- Download option
- Timestamp markers for each verse (advanced)

### Implementation Steps

1. **Create Audio Recording Service** (`audio-recording.service.ts`)
   - Implement MediaRecorder API wrapper
   - Handle browser permissions
   - Manage recording state

2. **Create Audio Upload Service** (`audio-upload.service.ts`)
   - Implement Firebase Storage upload
   - Generate unique filenames
   - Handle upload progress

3. **Update QuranReaderComponent**
   - Add recording state properties
   - Implement recording methods
   - Add audio preview playback

4. **Update Homework Bar Template**
   - Add recording UI controls
   - Show recording status
   - Add preview playback

5. **Update Submission Flow**
   - Upload audio before submitting
   - Pass audio path to submission service
   - Handle upload errors gracefully

6. **Update SubmissionService**
   - Accept audio path parameter
   - Store in submission document

7. **Update Firebase Storage Rules**
   - Secure audio file access
   - Allow student uploads
   - Allow teacher access

8. **Test Recording Flow**
   - Test microphone permissions
   - Test recording quality
   - Test upload to Firebase Storage
   - Test submission with audio
   - Test playback in teacher interface

### Acceptance Criteria

- ✅ Student can click "Record Recitation" and grant microphone permission
- ✅ Recording indicator shows (red dot, timer)
- ✅ Student can stop recording and preview the audio
- ✅ Student can re-record if not satisfied
- ✅ Audio uploads to Firebase Storage successfully
- ✅ Submission includes `audioBlobPath` reference
- ✅ Teacher can access and play the audio recording
- ✅ Audio quality is sufficient for grading (clear, no distortion)
- ✅ Works on desktop and mobile browsers
- ✅ Handles errors gracefully (permission denied, upload failure, etc.)

### Edge Cases to Handle

- **Microphone permission denied**: Show helpful error message with instructions
- **No microphone available**: Disable recording, allow submission without audio
- **Recording too long**: Set max duration (e.g., 10 minutes), auto-stop
- **Upload fails**: Retry mechanism, show error, allow re-upload
- **Student leaves page while recording**: Save draft or warn before leaving
- **Multiple recordings**: Delete old recording when re-recording
- **Browser compatibility**: Test on Chrome, Firefox, Safari, Edge
- **Mobile recording**: Test on iOS and Android devices

### Optional Enhancements

1. **Waveform Visualization**: Show audio waveform during recording/playback
2. **Verse Markers**: Allow student to mark where each verse starts in the recording
3. **Pause/Resume**: Allow pausing recording between verses
4. **Audio Quality Selection**: Let student choose quality (affects file size)
5. **Background Recording**: Continue recording when homework bar is minimized
6. **Auto-Submit**: Option to auto-submit after recording completes
7. **Recording Guidelines**: Show tips for good recording (quiet room, clear speech, etc.)

### Dependencies

- **Browser APIs**: MediaRecorder API, MediaStream API
- **Firebase**: Firebase Storage SDK
- **Audio Format**: WebM (widely supported), fallback to MP4/AAC
- **File Size**: Typical 5-10 minute recording = 5-15 MB (depends on quality)

### Performance Considerations

- **Upload Progress**: Show progress bar for large audio files
- **Compression**: Consider compressing audio before upload (optional)
- **Streaming Upload**: For very long recordings, consider streaming upload
- **Storage Costs**: Monitor Firebase Storage usage and costs

---

## COMBINED OPTION: Practice Progress + Audio Recording (Recommended - 60-75 minutes)

Implement both Option 2 and Option 3 together for the most comprehensive submission experience:

1. **Student practices** → Progress tracked in `Progress` collection
2. **Student records** → Audio captured and previewed
3. **Student submits** → Both practice data and audio uploaded
4. **Teacher grades** → Can see effort level AND hear the recitation

This provides the best of both worlds:
- **Quantitative data**: Practice counts, completion percentage
- **Qualitative data**: Actual audio recording for assessment

### Implementation Order
1. Implement Option 2 first (practice progress) - simpler, quick win
2. Test and verify practice data submission works
3. Implement Option 3 (audio recording) - more complex
4. Test and verify audio recording and upload works
5. Test combined submission with both practice data and audio
6. Update teacher grading interface to display both

---

## Testing Checklist

### Option 2: Practice Progress
- [ ] Practice some verses before submitting
- [ ] Verify practice data is aggregated correctly
- [ ] Submit assignment and check Firestore document
- [ ] Verify `practiceData` field contains correct counts
- [ ] Test submission without any practice (should handle gracefully)
- [ ] Test submission after practicing all verses
- [ ] Test submission after practicing only some verses

### Option 3: Audio Recording
- [ ] Click "Record Recitation" and grant microphone permission
- [ ] Verify recording indicator shows (red dot, timer)
- [ ] Record for 10-20 seconds and stop
- [ ] Play back the recording to verify quality
- [ ] Test re-record functionality
- [ ] Submit assignment with recording
- [ ] Verify audio uploads to Firebase Storage
- [ ] Verify `audioBlobPath` is in submission document
- [ ] Test teacher can access and play the audio
- [ ] Test on different browsers (Chrome, Firefox, Safari)
- [ ] Test on mobile devices (iOS, Android)
- [ ] Test error handling (permission denied, upload failure)

### Combined Testing
- [ ] Practice verses, then record, then submit
- [ ] Verify both practice data and audio path in submission
- [ ] Verify teacher can see practice stats and play audio
- [ ] Test full flow end-to-end multiple times
- [ ] Test with different assignment lengths (short vs long)
- [ ] Monitor Firebase Storage usage and costs

---

## Notes

- **Browser Compatibility**: MediaRecorder API is supported in all modern browsers (Chrome 47+, Firefox 25+, Safari 14+, Edge 79+)
- **Mobile Support**: Works on iOS 14.3+ and Android 5.0+
- **Audio Format**: WebM with Opus codec (widely supported), fallback to MP4/AAC for Safari
- **File Size**: Typical 1 minute recording = ~1 MB (depends on quality settings)
- **Firebase Storage**: Free tier includes 5 GB storage, 1 GB/day download
- **Security**: Storage rules ensure students can only access their own recordings, teachers can access all

---

## Priority Recommendation

**Start with Option 2 (Practice Progress)** - It's quick to implement, provides immediate value, and doesn't require any new UI or browser permissions. Once that's working, add Option 3 (Audio Recording) for the complete solution.

**Timeline:**
- Option 2 alone: 10-15 minutes
- Option 3 alone: 45-60 minutes  
- Both combined: 60-75 minutes total

Choose based on your immediate needs and available time!

