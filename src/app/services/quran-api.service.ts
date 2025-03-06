import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class QuranAPIService {

    private apiUrl = 'https://api.alquran.cloud/v1/';

  constructor(private http: HttpClient) {}

  // Get all available translations
  getTranslations(): Observable<any> {
    return this.http.get(`${this.apiUrl}edition/type/translation/language/en`);
  }

  // Get verse with specific translation
  getVerse(surah: number, ayah: number, translation: string = 'en.asad'): Observable<any> {
    return this.http.get(`${this.apiUrl}ayah/${surah}:${ayah}/${translation}`);
  }

  // Get English tafsir
  getTafsir(surah: number, ayah: number, tafsirId: string = 'en.tafsir-ibn-kathir'): Observable<any> {
    return this.http.get(`${this.apiUrl}tafsir/${tafsirId}/${surah}:${ayah}`);
  }

  // Get audio for a range of verses
  getAudioByVerseRange(surah: number, startAyah: number, endAyah: number, reciter: string): Observable<any> {
    return this.http.get(`${this.apiUrl}surah/${surah}/verses/${startAyah}-${endAyah}/audio/${reciter}`);
  }
}
