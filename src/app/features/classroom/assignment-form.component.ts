import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SURAHS, SurahInfo } from 'src/app/data/surahs';

@Component({
  selector: 'app-assignment-form',
  templateUrl: './assignment-form.component.html',
  styleUrls: ['./assignment-form.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
})
export class AssignmentFormComponent implements OnInit {
  @Input() targetName: string = ''; // Class or student name
  @Input() editData: any = null; // For editing existing assignments
  @Output() submitForm = new EventEmitter<any>();
  @Output() cancel = new EventEmitter<void>();

  private fb = inject(FormBuilder);

  assignmentForm!: FormGroup;
  surahs = SURAHS;
  filteredSurahs = SURAHS;
  selectedSurah: SurahInfo | null = null;
  showSurahDropdown = false;
  surahSearchTerm = '';

  ngOnInit(): void {
    this.assignmentForm = this.fb.group({
      title: ['', Validators.required],
      surahSearch: [''],
      surah: [null, [Validators.required, Validators.min(1), Validators.max(114)]],
      startAyah: [null, [Validators.required, Validators.min(1)]],
      endAyah: [null, [Validators.required, Validators.min(1)]],
      dueAt: ['', Validators.required],
      notes: [''],
    });

    // If editing, pre-fill the form
    if (this.editData) {
      const dueAtString = this.editData.dueAt 
        ? new Date(this.editData.dueAt.toDate()).toISOString().slice(0, 16)
        : '';
      
      // Set selected surah first
      this.selectedSurah = this.surahs.find(s => s.number === this.editData.surah) || null;
      
      this.assignmentForm.patchValue({
        title: this.editData.title,
        surah: this.editData.surah,
        surahSearch: this.selectedSurah ? `${this.selectedSurah.number}. ${this.selectedSurah.transliteration}` : '',
        startAyah: this.editData.startAyah,
        endAyah: this.editData.endAyah,
        dueAt: dueAtString,
        notes: this.editData.notes || '',
      });
    }

    // Auto-update title when surah is selected
    this.assignmentForm.get('surah')?.valueChanges.subscribe((surahNum) => {
      if (surahNum && !this.editData) {
        const surah = this.surahs.find(s => s.number === surahNum);
        if (surah) {
          this.assignmentForm.patchValue({
            title: `${surah.transliteration} Practice`
          }, { emitEvent: false }); // Prevent infinite loop
        }
      }
    });
  }

  onSurahSearchChange(event: any) {
    const term = event.target.value.toLowerCase();
    this.surahSearchTerm = term;
    
    if (!term) {
      this.filteredSurahs = this.surahs;
    } else {
      this.filteredSurahs = this.surahs.filter(s =>
        s.transliteration.toLowerCase().includes(term) ||
        s.translation.toLowerCase().includes(term) ||
        s.name.includes(term) ||
        s.number.toString().includes(term)
      );
    }
  }

  selectSurah(surah: SurahInfo) {
    this.selectedSurah = surah;
    this.assignmentForm.patchValue({
      surah: surah.number,
      surahSearch: `${surah.number}. ${surah.transliteration}`,
      title: `${surah.transliteration} Practice`, // Auto-populate title
      startAyah: 1,
      endAyah: surah.verses
    });
    this.showSurahDropdown = false;
  }

  toggleSurahDropdown() {
    this.showSurahDropdown = !this.showSurahDropdown;
  }

  onSubmit() {
    if (this.assignmentForm.invalid) return;

    const formValue = this.assignmentForm.value;
    this.submitForm.emit({
      title: formValue.title,
      surah: formValue.surah,
      startAyah: formValue.startAyah,
      endAyah: formValue.endAyah,
      dueAt: formValue.dueAt,
      notes: formValue.notes,
    });

    this.assignmentForm.reset();
    this.selectedSurah = null;
  }

  onCancel() {
    this.cancel.emit();
  }

  get maxAyah(): number {
    return this.selectedSurah?.verses || 286;
  }
}


