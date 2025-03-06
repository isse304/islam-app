import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { QuranReaderPreferences, Reciter } from '../interfaces/quran.interface';

@Injectable({
  providedIn: 'root'
})
export class PreferencesService {
  private readonly PREFERENCES_KEY = 'quran_reader_preferences';
  private defaultPreferences: QuranReaderPreferences = {
    selectedReciter: {
      id: 1,
      name: 'Mishary Rashid Alafasy',
      identifier: 'ar.alafasy',
      surahIdentifier: 'ar.alafasy/{surah}',
      style: 'Murattal'
    },
    selectedTranslation: 'en.sahih',
    selectedTafsir: 'en.tafsir-ibn-kathir',
    isDarkMode: false,
    arabicFont: 'uthmani',
    fontSize: 24,
    showWordByWord: false,
    isMushafView: false,
    isDoublePageView: false
  };

  private preferences = new BehaviorSubject<QuranReaderPreferences>(this.loadPreferences());

  constructor() {}

  private loadPreferences(): QuranReaderPreferences {
    try {
      const savedPreferences = localStorage.getItem(this.PREFERENCES_KEY);
      return savedPreferences ? JSON.parse(savedPreferences) : this.defaultPreferences;
    } catch (error) {
      console.error('Error loading preferences:', error);
      return this.defaultPreferences;
    }
  }

  private savePreferences(preferences: QuranReaderPreferences): void {
    try {
      localStorage.setItem(this.PREFERENCES_KEY, JSON.stringify(preferences));
      this.preferences.next(preferences);
    } catch (error) {
      console.error('Error saving preferences:', error);
    }
  }

  getPreferences(): Observable<QuranReaderPreferences> {
    return this.preferences.asObservable();
  }

  updatePreferences(updates: Partial<QuranReaderPreferences>): void {
    const currentPreferences = this.preferences.value;
    const updatedPreferences = { ...currentPreferences, ...updates };
    this.savePreferences(updatedPreferences);
  }

  setReciter(reciter: Reciter): void {
    this.updatePreferences({ selectedReciter: reciter });
  }

  setTranslation(translationId: string): void {
    this.updatePreferences({ selectedTranslation: translationId });
  }

  setTafsir(tafsirId: string): void {
    this.updatePreferences({ selectedTafsir: tafsirId });
  }

  toggleDarkMode(): void {
    const currentPreferences = this.preferences.value;
    this.updatePreferences({ isDarkMode: !currentPreferences.isDarkMode });
  }

  setArabicFont(font: 'uthmani' | 'naskh'): void {
    this.updatePreferences({ arabicFont: font });
  }

  setFontSize(size: number): void {
    this.updatePreferences({ fontSize: size });
  }

  toggleWordByWord(): void {
    const currentPreferences = this.preferences.value;
    this.updatePreferences({ showWordByWord: !currentPreferences.showWordByWord });
  }

  toggleMushafView(): void {
    const currentPreferences = this.preferences.value;
    this.updatePreferences({ isMushafView: !currentPreferences.isMushafView });
  }

  toggleDoublePageView(): void {
    const currentPreferences = this.preferences.value;
    this.updatePreferences({ isDoublePageView: !currentPreferences.isDoublePageView });
  }

  resetPreferences(): void {
    this.savePreferences(this.defaultPreferences);
  }
} 