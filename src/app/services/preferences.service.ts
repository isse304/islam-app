import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { QuranReaderPreferences, Reciter } from '../interfaces/quran.interface';
import { FirebaseAuthService } from './firebase-auth.service';

@Injectable({
  providedIn: 'root'
})
export class PreferencesService {
  private readonly STORAGE_KEY = 'quran_reader_preferences';
  private preferencesSubject = new BehaviorSubject<any>(null);
  
  constructor(private authService: FirebaseAuthService) {
    this.initializePreferences();
  }
  
  private async initializePreferences() {
    // First load from localStorage
    const localPrefs = this.loadFromLocalStorage();
    if (localPrefs) {
      this.preferencesSubject.next(localPrefs);
    }
    
    // Then try to load from server
    try {
      const serverPrefs = await this.authService.getUserPreferences();
      if (serverPrefs && typeof serverPrefs === 'object') {
        const mergedPrefs = { ...localPrefs, ...(serverPrefs.preferences || {}) };
        this.saveToLocalStorage(mergedPrefs);
        this.preferencesSubject.next(mergedPrefs);
      }
    } catch (error) {
      console.warn('Could not load preferences from server:', error);
    }
  }
  
  private loadFromLocalStorage(): any {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn('Error loading preferences from localStorage:', error);
      return null;
    }
  }
  
  private saveToLocalStorage(preferences: any): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.warn('Error saving preferences to localStorage:', error);
    }
  }
  
  getPreferences(): Observable<any> {
    return this.preferencesSubject.asObservable();
  }
  
  getCurrentPreferences(): any {
    return this.preferencesSubject.value;
  }
  
  async updatePreferences(updates: any): Promise<void> {
    // Get current preferences
    const current = this.getCurrentPreferences() || {};
    
    // Merge updates with current preferences
    const updated = { ...current, ...updates };
    
    // Save to localStorage immediately
    this.saveToLocalStorage(updated);
    
    // Update subject
    this.preferencesSubject.next(updated);
    
    // Save to server in background
    try {
      await this.authService.saveUserPreferences(updated);
    } catch (error) {
      console.warn('Could not save preferences to server:', error);
    }
  }
  
  async updateLastState(surah: number, verse: number, isMushafView: boolean): Promise<void> {
    const lastState = {
      lastSurah: surah,
      lastVerse: verse,
      isMushafView: isMushafView,
      timestamp: new Date().toISOString()
    };
    
    await this.updatePreferences({ lastState });
  }
  
  async updateReadingHistory(entry: any): Promise<void> {
    const current = this.getCurrentPreferences() || {};
    const history = Array.isArray(current.readingHistory) ? current.readingHistory : [];
    
    // Add new entry to the beginning
    history.unshift(entry);
    
    // Keep only last 100 entries
    const updatedHistory = history.slice(0, 100);
    
    await this.updatePreferences({ readingHistory: updatedHistory });
  }
  
  async updateSettings(settings: any): Promise<void> {
    await this.updatePreferences(settings);
  }
  
  clearPreferences(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    this.preferencesSubject.next(null);
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
    const currentPreferences = this.getCurrentPreferences();
    this.updatePreferences({ isDarkMode: !currentPreferences.isDarkMode });
  }

  setArabicFont(font: 'uthmani' | 'naskh'): void {
    this.updatePreferences({ arabicFont: font });
  }

  setFontSize(size: number): void {
    this.updatePreferences({ fontSize: size });
  }

  toggleWordByWord(): void {
    const currentPreferences = this.getCurrentPreferences();
    this.updatePreferences({ showWordByWord: !currentPreferences.showWordByWord });
  }

  toggleMushafView(): void {
    const currentPreferences = this.getCurrentPreferences();
    this.updatePreferences({ isMushafView: !currentPreferences.isMushafView });
  }

  toggleDoublePageView(): void {
    const currentPreferences = this.getCurrentPreferences();
    this.updatePreferences({ isDoublePageView: !currentPreferences.isDoublePageView });
  }

  resetPreferences(): void {
    this.clearPreferences();
  }
} 