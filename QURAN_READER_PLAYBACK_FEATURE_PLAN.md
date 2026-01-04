# Quran Reader: Ayah-by-Ayah Auto-Scrolling Playback Feature

## Overview
Implement a comprehensive playback feature in the Quran Reader that allows users to play verses with automatic scrolling, similar to the assignment view functionality. This will include a new floating play button with multiple playback options.

---

## Current State Analysis

### Existing Assignment View Features (To Replicate)
✅ **Already Implemented in Assignment Mode:**
- `playAllAssignmentAyahs()` - Initiates sequential playback
- `playVerseSequence(surah, verses[], index, autoScroll)` - Async method for sequential playback
- `scrollToVerse(verseNumber)` - Smart scrolling with offset calculation
- `highlightCurrentVerse(verseNumber)` - Visual feedback with pulsing blue highlight
- `stopAssignmentAudio()` - Proper cleanup on stop
- Homework bar that minimizes during playback showing current verse progress
- 300ms delay between verses for natural pacing

### Current Quran Reader Setup
📍 **UI Elements:**
- Floating gear icon button: `fixed top-28 right-4 z-20` (opens settings)
- Translation view and Mushaf view modes
- Settings panel with "Play Full Surah" button (lines 393-404 & 1044-1055 in HTML)

📍 **Existing Audio Methods:**
- `playFullSurah()` - Plays entire surah as single audio file (no verse-by-verse)
- `playCurrentSurah()` - Toggle play/pause for mushaf view
- `stopFullSurah()` - Stops full surah playback
- `playAudio(url, verseNumber)` - Core audio playback method
- `stopAndCloseAudioPlayer()` - Complete audio cleanup

---

## Feature Requirements

### 1. New Floating Play Button
**Location:** Below the gear icon button
- Position: `fixed top-40 right-4 z-20`
- Design: Similar style to gear button (golden/tan color `#B7A57A`)
- Icon: Play circle icon (`fas fa-play-circle`)
- Behavior: Opens playback options dialog/bottom sheet

### 2. Playback Options Dialog
When the play button is clicked, show a dialog/bottom sheet with:

#### Option 1: Play from Beginning
- Starts from verse 1 of current surah
- Auto-scroll enabled
- Shows progress: "Verse X of Y"

#### Option 2: Play from Current Verse
- Determine "current verse" by:
  - Last clicked verse (if any)
  - First visible verse in viewport (fallback)
  - Verse 1 (final fallback)
- Plays from selected verse to end of surah
- Auto-scroll enabled

#### Option 3: Custom Range
- Show two dropdowns:
  - "From Verse": 1 to total verses
  - "To Verse": selected from verse to total verses
- Validation: "To" must be >= "From"
- Play selected range with auto-scroll

#### Option 4: Play Full Surah (Background)
- Uses existing `playFullSurah()` method
- Single audio file for entire surah (no verse tracking)
- No auto-scrolling
- Shows surah name in audio player
- Labeled as "Background" to differentiate

### 3. Minimized Player Bar
During playback, show a compact player at the bottom similar to assignment mode:
- Fixed bottom bar with:
  - Animated play indicator (pulsing icon)
  - Current verse info: "Surah Name - Verse X of Y"
  - Controls: Pause/Resume, Stop, Expand (optional)
- Z-index: `z-[150]` (above regular content)
- Auto-minimizes when playback starts
- Expands when playback stops

### 4. Visual Feedback
- Blue pulsing highlight on currently playing verse (`.currently-playing-verse`)
- Smooth auto-scroll to keep current verse visible
- Scroll offset adjusts based on UI state (controls minimized or not)

---

## Technical Implementation

### Phase 1: Component State & Properties

#### New State Variables
```typescript
// Playback state
isPlayingReaderAudio: boolean = false;
readerAudioPlaylist: number[] = [];
currentReaderVerseIndex: number = 0;
showPlaybackOptions: boolean = false;

// Range selection
customRangeStart: number = 1;
customRangeEnd: number = 1;

// Current verse tracking
lastClickedVerse: number | null = null;
firstVisibleVerse: number | null = null;
```

#### Update Existing Properties
- Keep `isPlayingFullSurah` for background mode
- Keep `isPlayingAssignmentAudio` for assignment mode (don't mix with reader mode)

### Phase 2: New Methods

#### A. Playback Control Methods
```typescript
// Open playback options dialog
openPlaybackOptions(): void {
  this.showPlaybackOptions = true;
  // Determine current verse for "Play from Current" option
  this.detectCurrentVerse();
}

// Close dialog
closePlaybackOptions(): void {
  this.showPlaybackOptions = false;
}

// Detect current verse in viewport or last clicked
detectCurrentVerse(): void {
  // Priority 1: Last clicked verse
  if (this.lastClickedVerse) {
    this.currentVerse = this.lastClickedVerse;
    return;
  }
  
  // Priority 2: First visible verse in viewport
  const visibleVerse = this.findFirstVisibleVerse();
  if (visibleVerse) {
    this.currentVerse = visibleVerse;
    return;
  }
  
  // Priority 3: Default to verse 1
  this.currentVerse = 1;
}

// Find first visible verse in viewport
findFirstVisibleVerse(): number | null {
  const verses = document.querySelectorAll('[id^="verse-"]');
  for (const verseEl of verses) {
    const rect = verseEl.getBoundingClientRect();
    if (rect.top >= 0 && rect.top <= window.innerHeight / 2) {
      const verseId = verseEl.id.replace('verse-', '');
      return parseInt(verseId);
    }
  }
  return null;
}
```

#### B. Playback Execution Methods
```typescript
// Play from beginning
playFromBeginning(): void {
  this.closePlaybackOptions();
  this.playReaderVerseRange(1, this.verses.length);
}

// Play from current verse
playFromCurrent(): void {
  this.closePlaybackOptions();
  this.detectCurrentVerse();
  this.playReaderVerseRange(this.currentVerse, this.verses.length);
}

// Play custom range
playCustomRange(): void {
  // Validate range
  if (this.customRangeEnd < this.customRangeStart) {
    this.toastService.showError('End verse must be greater than or equal to start verse');
    return;
  }
  
  this.closePlaybackOptions();
  this.playReaderVerseRange(this.customRangeStart, this.customRangeEnd);
}

// Play full surah in background (no tracking)
playFullSurahBackground(): void {
  this.closePlaybackOptions();
  this.playFullSurah(); // Use existing method
}

// Main playback method (reuses assignment logic)
playReaderVerseRange(startVerse: number, endVerse: number): void {
  // Build playlist
  this.readerAudioPlaylist = [];
  for (let v = startVerse; v <= endVerse; v++) {
    this.readerAudioPlaylist.push(v);
  }
  
  if (this.readerAudioPlaylist.length === 0) {
    this.toastService.showError('No verses to play');
    return;
  }
  
  // Scroll to first verse
  setTimeout(() => {
    this.scrollToVerse(startVerse);
  }, 100);
  
  // Start playback
  this.isPlayingReaderAudio = true;
  this.changeDetector.markForCheck();
  
  // Reuse playVerseSequence method (same as assignments)
  this.playReaderVerseSequence(this.currentSurah, this.readerAudioPlaylist, 0, true);
}

// Sequential verse playback (similar to assignment mode)
private async playReaderVerseSequence(
  surah: number, 
  verses: number[], 
  currentIndex: number, 
  autoScroll: boolean = false
): Promise<void> {
  // Check if playback stopped or completed
  if (currentIndex >= verses.length || !this.isPlayingReaderAudio) {
    this.isPlayingReaderAudio = false;
    this.changeDetector.markForCheck();
    return;
  }

  const verseNumber = verses[currentIndex];
  const verse = this.verses.find(v => v.number === verseNumber);
  
  if (!verse) {
    await this.playReaderVerseSequence(surah, verses, currentIndex + 1, autoScroll);
    return;
  }

  // Scroll and highlight
  if (autoScroll) {
    this.scrollToVerse(verseNumber);
    this.highlightCurrentVerse(verseNumber);
  }

  // Get audio URL
  const verseKey = `${surah}:${verseNumber}`;
  const audioUrl = this.quranService.getVerseAudioUrl(this.selectedReciter.id, verseKey);
  
  if (!audioUrl) {
    console.error(`Could not get audio URL for ${verseKey}`);
    await this.playReaderVerseSequence(surah, verses, currentIndex + 1, autoScroll);
    return;
  }

  // Update display
  const surahDetails = this.surahs.find(s => s.number === surah);
  const surahName = surahDetails?.englishName || `Surah ${surah}`;
  const arabicName = surahDetails?.name || '';
  const surahDisplayName = arabicName ? `${surahName} (${arabicName})` : surahName;
  
  this.currentlyPlaying = `${surahDisplayName} - Verse ${verseNumber} of ${verses[verses.length - 1]}`;
  this.currentPlayingVerse = verseNumber;
  this.currentReaderVerseIndex = currentIndex;

  // Create new audio element
  const audio = new Audio(audioUrl);
  this.audioPlayer = audio;
  this.isPlaying = true;
  this.audioPaused = false;

  try {
    // Wait for audio to load
    await new Promise<void>((resolve, reject) => {
      audio.addEventListener('loadeddata', () => resolve(), { once: true });
      audio.addEventListener('error', reject, { once: true });
      audio.load();
    });

    // Set up ended event before playing
    audio.addEventListener('ended', async () => {
      if (!this.isPlayingReaderAudio) return;
      
      // Wait 300ms before next verse
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Play next verse
      await this.playReaderVerseSequence(surah, verses, currentIndex + 1, autoScroll);
    }, { once: true });

    // Play the audio
    await audio.play();
    this.changeDetector.markForCheck();

  } catch (error) {
    console.error(`Error playing verse ${verseKey}:`, error);
    await this.playReaderVerseSequence(surah, verses, currentIndex + 1, autoScroll);
  }
}

// Stop reader audio
stopReaderAudio(): void {
  this.isPlayingReaderAudio = false;
  
  if (this.audioPlayer) {
    this.audioPlayer.pause();
    this.audioPlayer.currentTime = 0;
  }
  
  this.isPlaying = false;
  this.audioPaused = true;
  this.currentPlayingVerse = null;
  
  // Remove highlight
  document.querySelectorAll('.currently-playing-verse').forEach(el => {
    el.classList.remove('currently-playing-verse');
  });
  
  this.changeDetector.markForCheck();
}

// Pause/Resume
pauseReaderAudio(): void {
  if (this.audioPlayer) {
    this.audioPlayer.pause();
    this.audioPaused = true;
    this.changeDetector.markForCheck();
  }
}

resumeReaderAudio(): void {
  if (this.audioPlayer) {
    this.audioPlayer.play();
    this.audioPaused = false;
    this.changeDetector.markForCheck();
  }
}
```

#### C. Verse Click Tracking
```typescript
// Track when user clicks a verse (add to existing verse click handler)
onVerseClick(verseNumber: number): void {
  this.lastClickedVerse = verseNumber;
  // ... existing verse click logic (tafsir, etc.)
}
```

### Phase 3: UI Components

#### A. Floating Play Button (HTML)
```html
<!-- NEW: Floating Play Button (below gear icon) -->
<button 
  *ngIf="!isMushafView && !isPopupOpen && (isMobile || (!isMobile && isMainControlsMinimized))"
  (click)="openPlaybackOptions()"
  class="play-control-bubble p-3 rounded-full bg-[#B7A57A] text-white fixed top-40 right-4 shadow-lg hover:bg-[#9b8a65] transition-colors z-20"
  matTooltip="Playback Options">
  <i class="fas fa-play-circle text-xl"></i>
</button>
```

#### B. Playback Options Dialog (HTML)
```html
<!-- Playback Options Dialog -->
<div *ngIf="showPlaybackOptions" 
     class="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center"
     (click)="closePlaybackOptions()">
  <div class="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" 
       (click)="$event.stopPropagation()">
    
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <h3 class="text-xl font-bold text-gray-800">
        <i class="fas fa-play-circle text-[#B7A57A] mr-2"></i>
        Playback Options
      </h3>
      <button (click)="closePlaybackOptions()" 
              class="text-gray-400 hover:text-gray-600">
        <i class="fas fa-times text-xl"></i>
      </button>
    </div>

    <!-- Current Surah Info -->
    <div class="mb-6 p-4 bg-gray-50 rounded-lg">
      <div class="text-sm text-gray-600 mb-1">Current Surah</div>
      <div class="text-lg font-semibold text-gray-800">
        {{ currentSurahDetails?.englishName }}
        <span class="text-[#B7A57A] mr-2">{{ currentSurahDetails?.name }}</span>
      </div>
      <div class="text-sm text-gray-500">{{ verses.length }} verses</div>
    </div>

    <!-- Playback Options -->
    <div class="space-y-3">
      
      <!-- Option 1: Play from Beginning -->
      <button 
        (click)="playFromBeginning()"
        class="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-[#B7A57A] hover:bg-amber-50 transition-all">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-[#B7A57A] text-white flex items-center justify-center">
            <i class="fas fa-step-backward"></i>
          </div>
          <div class="flex-1">
            <div class="font-semibold text-gray-800">Play from Beginning</div>
            <div class="text-sm text-gray-500">Start from verse 1 with auto-scroll</div>
          </div>
        </div>
      </button>

      <!-- Option 2: Play from Current Verse -->
      <button 
        (click)="playFromCurrent()"
        class="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-[#B7A57A] hover:bg-amber-50 transition-all">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-[#B7A57A] text-white flex items-center justify-center">
            <i class="fas fa-play"></i>
          </div>
          <div class="flex-1">
            <div class="font-semibold text-gray-800">Play from Current Verse</div>
            <div class="text-sm text-gray-500">
              <span *ngIf="lastClickedVerse">From verse {{ lastClickedVerse }}</span>
              <span *ngIf="!lastClickedVerse">From first visible verse</span>
            </div>
          </div>
        </div>
      </button>

      <!-- Option 3: Custom Range -->
      <div class="p-4 rounded-lg border-2 border-gray-200">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-full bg-[#B7A57A] text-white flex items-center justify-center">
            <i class="fas fa-sliders-h"></i>
          </div>
          <div class="flex-1">
            <div class="font-semibold text-gray-800">Custom Range</div>
            <div class="text-sm text-gray-500">Choose specific verses</div>
          </div>
        </div>
        
        <!-- Range Selectors -->
        <div class="flex items-center gap-3 mb-3">
          <div class="flex-1">
            <label class="text-xs text-gray-600 block mb-1">From Verse</label>
            <select 
              [(ngModel)]="customRangeStart" 
              name="customRangeStart"
              class="w-full rounded-md border-gray-300 text-sm">
              <option *ngFor="let v of verses" [value]="v.number">{{ v.number }}</option>
            </select>
          </div>
          <div class="text-gray-400 pt-5">→</div>
          <div class="flex-1">
            <label class="text-xs text-gray-600 block mb-1">To Verse</label>
            <select 
              [(ngModel)]="customRangeEnd" 
              name="customRangeEnd"
              class="w-full rounded-md border-gray-300 text-sm">
              <option *ngFor="let v of verses" [value]="v.number" [disabled]="v.number < customRangeStart">
                {{ v.number }}
              </option>
            </select>
          </div>
        </div>
        
        <button 
          (click)="playCustomRange()"
          class="w-full bg-[#B7A57A] text-white py-2 rounded-md hover:bg-[#9b8a65] transition-colors">
          <i class="fas fa-play mr-2"></i>
          Play Range
        </button>
      </div>

      <!-- Option 4: Play Full Surah (Background) -->
      <button 
        (click)="playFullSurahBackground()"
        class="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-[#B7A57A] hover:bg-amber-50 transition-all">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-amber-600 text-white flex items-center justify-center">
            <i class="fas fa-music"></i>
          </div>
          <div class="flex-1">
            <div class="font-semibold text-gray-800">Play Full Surah (Background)</div>
            <div class="text-sm text-gray-500">Continuous audio without verse tracking</div>
          </div>
        </div>
      </button>

    </div>

  </div>
</div>
```

#### C. Minimized Player Bar (HTML)
```html
<!-- Reader Playback - Minimized Player Bar -->
<div *ngIf="isPlayingReaderAudio && !isMushafView" 
     class="fixed inset-x-0 bottom-0 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-6 py-4 z-[150] transition-all duration-300 ease-in-out shadow-2xl border-t border-amber-600/30">
  <div class="container mx-auto max-w-7xl">
    <div class="flex items-center justify-between gap-6">
      
      <!-- LEFT: Animated Playing Indicator -->
      <div class="flex items-center gap-3 flex-1">
        <div class="relative">
          <!-- Pulsing outer ring -->
          <div class="absolute inset-0 w-12 h-12 rounded-full bg-amber-500/20 animate-ping"></div>
          <!-- Main icon with animated bars -->
          <div class="relative w-12 h-12 rounded-full bg-gradient-to-br from-slate-800 to-slate-700 flex items-center justify-center shadow-lg border-2 border-amber-500/50">
            <div class="flex items-center justify-center gap-0.5 h-6">
              <div class="w-1 bg-amber-400 rounded-full animate-pulse" style="height: 40%; animation-delay: 0s;"></div>
              <div class="w-1 bg-amber-400 rounded-full animate-pulse" style="height: 70%; animation-delay: 0.15s;"></div>
              <div class="w-1 bg-amber-400 rounded-full animate-pulse" style="height: 50%; animation-delay: 0.3s;"></div>
              <div class="w-1 bg-amber-400 rounded-full animate-pulse" style="height: 80%; animation-delay: 0.45s;"></div>
              <div class="w-1 bg-amber-400 rounded-full animate-pulse" style="height: 60%; animation-delay: 0.6s;"></div>
            </div>
          </div>
        </div>
        <div class="flex-1">
          <div class="text-sm font-bold text-white">{{ currentlyPlaying || 'Playing Recitation' }}</div>
          <div class="text-xs text-slate-400">
            Verse {{ currentReaderVerseIndex + 1 }} of {{ readerAudioPlaylist.length }}
          </div>
        </div>
      </div>

      <!-- CENTER: Playback Controls -->
      <div class="flex items-center gap-3">
        <!-- Pause/Resume -->
        <button
          *ngIf="!audioPaused"
          (click)="pauseReaderAudio()"
          class="p-3 rounded-full bg-slate-700 hover:bg-slate-600 transition-all duration-200 hover:scale-110"
          matTooltip="Pause">
          <i class="fas fa-pause text-white"></i>
        </button>
        <button
          *ngIf="audioPaused"
          (click)="resumeReaderAudio()"
          class="p-3 rounded-full bg-amber-600 hover:bg-amber-500 transition-all duration-200 hover:scale-110"
          matTooltip="Resume">
          <i class="fas fa-play text-white"></i>
        </button>

        <!-- Stop -->
        <button
          (click)="stopReaderAudio()"
          class="p-3 rounded-full bg-red-600 hover:bg-red-500 transition-all duration-200 hover:scale-110 shadow-lg"
          matTooltip="Stop Playback">
          <i class="fas fa-stop text-white"></i>
        </button>
      </div>

    </div>

    <!-- Decorative border -->
    <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-50"></div>
  </div>
</div>
```

### Phase 4: Remove Old "Play Full Surah" from Settings

#### Files to Modify:
1. `quran-reader.component.html` - Remove lines 390-404 (desktop settings)
2. `quran-reader.component.html` - Remove lines 1040-1055 (mobile popup settings)

**Note:** Keep the `playFullSurah()` and `stopFullSurah()` methods in the TypeScript file as they're used for the "Background" playback option.

---

## Implementation Phases

### Phase 1: UI Setup (Day 1)
- [ ] Add floating play button below gear icon
- [ ] Create playback options dialog component
- [ ] Style dialog to match app design
- [ ] Add minimized player bar for reader mode
- [ ] Remove "Play Full Surah" from settings panel (2 locations)

### Phase 2: State Management (Day 1)
- [ ] Add new state variables for reader playback
- [ ] Implement `detectCurrentVerse()` method
- [ ] Implement `findFirstVisibleVerse()` method
- [ ] Add verse click tracking

### Phase 3: Playback Logic (Day 2)
- [ ] Implement `playFromBeginning()`
- [ ] Implement `playFromCurrent()`
- [ ] Implement `playCustomRange()`
- [ ] Implement `playReaderVerseRange()`
- [ ] Implement `playReaderVerseSequence()` (async)
- [ ] Implement `stopReaderAudio()`
- [ ] Implement `pauseReaderAudio()` / `resumeReaderAudio()`

### Phase 4: Testing & Polish (Day 2-3)
- [ ] Test all 4 playback options
- [ ] Test auto-scroll behavior
- [ ] Test verse highlighting
- [ ] Test pause/resume functionality
- [ ] Test stop and cleanup
- [ ] Verify no conflicts with assignment mode playback
- [ ] Test on mobile and desktop
- [ ] Test in both translation and mushaf views

---

## Edge Cases & Considerations

### 1. Mode Conflicts
**Problem:** What if user is in assignment mode and tries to use reader playback?
**Solution:** 
- Hide the floating play button when `homeworkBar.visible === true`
- Assignment mode and reader mode use separate state flags

### 2. View Switching During Playback
**Problem:** User switches from translation to mushaf view while playing
**Solution:**
- Stop playback when switching views (`toggleView()` already calls `stopAndCloseAudioPlayer()`)
- This is existing behavior - maintain it

### 3. Full Surah vs. Verse-by-Verse Modes
**Problem:** User confusion between two playback modes
**Solution:**
- Clear labeling: "Play Full Surah (Background)" option
- Different visual indicators:
  - Verse-by-verse: Blue pulsing highlight on verse
  - Full surah: No verse highlighting
- Dialog explanation text helps clarify

### 4. Current Verse Detection Accuracy
**Problem:** "Play from current" might not detect correct verse
**Solution:**
- Priority order: clicked verse > visible verse > verse 1
- Show detected verse in dialog: "From verse X"
- User can use custom range if auto-detection is wrong

### 5. Custom Range Validation
**Problem:** User selects invalid range (end < start)
**Solution:**
- Disable "to" options that are less than "from" selection
- Show error toast if validation fails
- Prevent play button click until valid range selected

### 6. Audio Loading Errors
**Problem:** Network issues or missing audio files
**Solution:**
- Reuse existing error handling from `playVerseSequence()`
- Skip failed verse and continue to next
- Show error toast only for complete failures

### 7. Bottom Padding for Reader Player
**Problem:** Last verse might be covered by player bar
**Solution:**
- Add dynamic padding to verses container when `isPlayingReaderAudio === true`
- Similar to assignment mode: `pb-24` when minimized

### 8. Mobile Responsiveness
**Problem:** Dialog might be too large on small screens
**Solution:**
- Use `max-w-md` with `mx-4` margins
- Stack elements vertically
- Reduce padding on mobile

---

## Testing Checklist

### Functionality Tests
- [ ] Floating play button appears in translation view
- [ ] Floating play button hidden in assignment mode
- [ ] Floating play button hidden in mushaf view
- [ ] Dialog opens when play button clicked
- [ ] Dialog shows correct surah information
- [ ] "Play from Beginning" starts from verse 1
- [ ] "Play from Current" detects correct verse
- [ ] Custom range validation works
- [ ] Custom range dropdown disables invalid options
- [ ] "Background" mode uses single audio file
- [ ] Auto-scroll works during playback
- [ ] Verse highlighting appears and moves
- [ ] Minimized player shows correct progress
- [ ] Pause button works
- [ ] Resume button works
- [ ] Stop button works and cleans up state
- [ ] Playback completes and auto-stops at end
- [ ] Multiple consecutive plays work correctly

### Integration Tests
- [ ] No conflicts with assignment mode playback
- [ ] Audio player cleanup on view switch
- [ ] Settings gear button still works
- [ ] Page scrolling works during playback
- [ ] Tafsir panel still works
- [ ] Search still works
- [ ] Surah switching during playback stops audio

### Visual Tests
- [ ] Play button styled consistently
- [ ] Dialog design matches app theme
- [ ] Player bar looks good on mobile
- [ ] Player bar looks good on desktop
- [ ] Blue highlight visible and attractive
- [ ] Animated play indicator works
- [ ] Smooth transitions and animations

### Performance Tests
- [ ] No memory leaks from audio elements
- [ ] Smooth scrolling performance
- [ ] Dialog opens/closes quickly
- [ ] No lag during verse transitions
- [ ] Proper cleanup when stopping mid-playback

---

## Files to Modify

### TypeScript
- `src/app/components/quran/quran-reader/quran-reader.component.ts`
  - Add new state variables (20 lines)
  - Add playback control methods (150 lines)
  - Add verse detection methods (30 lines)
  - Add reader verse sequence playback (100 lines)

### HTML
- `src/app/components/quran/quran-reader/quran-reader.component.html`
  - Add floating play button (5 lines)
  - Add playback options dialog (150 lines)
  - Add minimized player bar (50 lines)
  - Remove old "Play Full Surah" button from settings (2 locations, ~15 lines each)

### CSS (Optional)
- `src/app/components/quran/quran-reader/quran-reader.component.scss`
  - May need minor adjustments if existing animations don't apply
  - `.currently-playing-verse` class already exists from assignment mode
  - Pulse animation already exists

---

## Success Metrics

### User Experience
- Users can easily access playback options
- Clear distinction between playback modes
- Smooth, uninterrupted verse-by-verse playback
- Intuitive controls (pause/resume/stop)
- Visual feedback matches audio playback

### Technical
- No memory leaks or performance degradation
- Clean separation between assignment and reader playback
- Reuse of existing `playVerseSequence` logic
- Proper state cleanup on stop/switch

### Adoption
- Feature discovery rate (% of users who click play button)
- Usage distribution across 4 options
- Completion rate (% who let playlist finish vs. stop early)

---

## Future Enhancements (Out of Scope)

1. **Playback Speed Control**: 0.5x, 0.75x, 1x, 1.25x, 1.5x
2. **Repeat Mode**: Loop entire surah or verse range
3. **Keyboard Shortcuts**: Space = play/pause, Esc = stop
4. **Progress Bar**: Visual indicator of playback progress
5. **Preloading**: Preload next verse while current one plays
6. **Favorites/Bookmarks**: Quick access to saved verse ranges
7. **Sleep Timer**: Auto-stop after X minutes
8. **Shuffle Mode**: Random verse order (for memorization)
9. **Verse Notes**: Add personal notes during playback
10. **Export Playlist**: Save verse ranges for later

---

## Dependencies

### Existing Services
✅ `QuranService.getVerseAudioUrl()` - Already implemented
✅ `QuranService.getSurahAudioUrl()` - Already implemented
✅ `ToastService` - Already implemented

### Existing Methods (Reuse)
✅ `scrollToVerse()` - Already implemented
✅ `highlightCurrentVerse()` - Already implemented
✅ `playFullSurah()` - Keep for background mode
✅ `stopFullSurah()` - Keep for background mode
✅ `stopAndCloseAudioPlayer()` - Already implemented

### Angular Material Components
✅ `MatDialog` or `MatBottomSheet` - Already imported
✅ `MatTooltip` - Already imported

---

## Risk Assessment

### Low Risk
✅ UI implementation (floating button, dialog)
✅ State management (new variables)
✅ Reusing existing playback logic

### Medium Risk
⚠️ Current verse detection accuracy
⚠️ Mobile responsiveness of dialog
⚠️ Bottom padding adjustment for player bar

**Mitigation:**
- Thorough testing on multiple screen sizes
- Fallback to verse 1 if detection fails
- User can always use custom range as backup

### High Risk
❌ None identified

---

## Open Questions

1. **Should the floating play button appear in Mushaf view?**
   - **Decision:** No, only in translation view (easier to implement verse-by-verse)
   - **Rationale:** Mushaf view already has play button in toolbar for full surah

2. **Should custom range be saved between sessions?**
   - **Decision:** No, reset to full range each time
   - **Rationale:** Keeps UI simple, users can quickly adjust

3. **Should playback continue when user scrolls manually?**
   - **Decision:** Yes, only auto-scroll, don't prevent manual scrolling
   - **Rationale:** User might want to read ahead or review

4. **What happens if user clicks tafsir during playback?**
   - **Decision:** Continue playing, don't stop
   - **Rationale:** User might want to read tafsir while listening

5. **Should there be a "Next Verse" / "Previous Verse" button?**
   - **Decision:** Not in Phase 1, add to future enhancements
   - **Rationale:** Keep initial implementation simple

---

## Estimated Effort

**Total Time:** 2-3 days (1 developer)

**Breakdown:**
- Day 1 Morning: UI implementation (floating button, dialog)
- Day 1 Afternoon: State management and verse detection
- Day 2 Morning: Core playback logic
- Day 2 Afternoon: Minimized player bar and polish
- Day 3: Testing, bug fixes, documentation

---

## Status
📋 **Ready for Implementation**

## Priority
⭐⭐⭐ **High** - Enhances core Quran reading experience

## Approval Needed
✅ Review by: User (qadar)
✅ Technical review: Self-review
✅ UI/UX review: Based on existing assignment mode design

---

**Last Updated:** January 4, 2026
**Author:** AI Assistant (Claude)
**Version:** 1.0

