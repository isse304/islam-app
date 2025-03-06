import { Component, OnInit } from '@angular/core';
import { QuranService } from '../../services/quran.service';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface SurahData {
  numberOfAyahs: number;
}

@Component({
    selector: 'app-learn',
    templateUrl: './learn.component.html',
    styleUrls: ['./learn.component.scss']
})
export class LearnComponent implements OnInit {
  selectedSurah: number = 1;
  selectedVerse: number = 1;
  isLoading: boolean = false;
  currentVerse: string = '';
  translation: string = '';
  messages: Message[] = [];
  userQuestion: string = '';
  selectedTafsir: 'ibn-kathir' | 'tabari' | 'maududi' = 'ibn-kathir';
  surahs: any[] = [];
  verseCounts: number = 1;
  aiSummary: string = '';

  constructor(
    private quranService: QuranService
  ) {}

  ngOnInit() {
    this.loadSurahs();
  }

  async loadSurahs() {
    this.surahs = await firstValueFrom(this.quranService.getSurahs());
    this.updateVerseCount();
  }

  async updateVerseCount() {
    const surahData = await firstValueFrom(this.quranService.getVerseCount(this.selectedSurah)) as SurahData;
    this.verseCounts = surahData.numberOfAyahs;
    this.loadVerse();
  }

  async loadVerse() {
    this.isLoading = true;
    try {
      const verseData = await firstValueFrom(this.quranService.getVerse(this.selectedSurah, this.selectedVerse));
      this.currentVerse = verseData.text;
      this.translation = verseData.translation;
      await this.getAISummary();
    } catch (error) {
      console.error('Error loading verse:', error);
    }
    this.isLoading = false;
  }

  async getAISummary() {
    try {
      const summary = await firstValueFrom(this.quranService.getVerseSummary(
        this.selectedSurah,
        this.selectedVerse
      )) as string;
      this.aiSummary = summary;
    } catch (error) {
      console.error('Error getting AI summary:', error);
    }
  }

  async sendQuestion() {
    if (!this.userQuestion.trim()) return;

    // Add user message
    this.messages.push({
      role: 'user',
      content: this.userQuestion,
      timestamp: new Date()
    });

    const question = this.userQuestion;
    this.userQuestion = ''; // Clear input
    this.isLoading = true;

    try {
      // Get AI response based on selected Tafsir
      const response = await firstValueFrom(this.quranService.getTafsirExplanation(
        this.selectedSurah,
        this.selectedVerse,
        question,
        this.selectedTafsir
      ));

      this.messages.push({
        role: 'assistant',
        content: response,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error getting AI response:', error);
      this.messages.push({
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try asking your question again.',
        timestamp: new Date()
      });
    }
    this.isLoading = false;
  }

  onTafsirChange() {
    // Optionally refresh the explanation when Tafsir source changes
    this.loadVerse();
  }

  // toggleSheikhMode() {
  //   this.textToSpeech.toggleSheikhMode();
  // }
} 