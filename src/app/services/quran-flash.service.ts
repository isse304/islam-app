import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map } from 'rxjs';
import { environment } from '../../environments/environment';

interface MushafPage {
  page: number;
  imageUrl: string;
}

@Injectable({
  providedIn: 'root'
})
export class QuranFlashService {
  private readonly TOTAL_PAGES = 604;
  private readonly V1_BASE_PATH = '/assets/quran-images/v1';
  private readonly V2_BASE_PATH = '/assets/quran-images/v2';
  private bucketName = 'your-gcs-bucket-name';

  // Updated surah page mapping with correct starting pages
  readonly surahPageMap: { [key: number]: number } = {
    1: 10,    // Al-Fatiha
    2: 11,    // Al-Baqarah
    3: 59,    // Ali 'Imran
    4: 86,    // An-Nisa
    5: 115,   // Al-Ma'idah
    6: 137,   // Al-An'am
    7: 160,   // Al-A'raf
    8: 186,   // Al-Anfal
    9: 196,   // At-Tawbah
    10: 217,  // Yunus
    11: 230,  // Hud
    12: 244,  // Yusuf
    13: 258,  // Ar-Ra'd
    14: 264,  // Ibrahim
    15: 271,  // Al-Hijr
    16: 276,  // An-Nahl
    17: 291,  // Al-Isra
    18: 302,  // Al-Kahf
    19: 314,  // Maryam
    20: 321,  // Ta-Ha
    21: 331,  // Al-Anbiya
    22: 341,  // Al-Hajj
    23: 351,  // Al-Mu'minun
    24: 359,  // An-Nur
    25: 368,  // Al-Furqan
    26: 376,  // Ash-Shu'ara
    27: 386,  // An-Naml
    28: 394,  // Al-Qasas
    29: 405,  // Al-'Ankabut
    30: 413,  // Ar-Rum
    31: 420,  // Luqman
    32: 424,  // As-Sajdah
    33: 427,  // Al-Ahzab
    34: 437,  // Saba
    35: 443,  // Fatir
    36: 449,  // Ya-Sin
    37: 455,  // As-Saffat
    38: 462,  // Sad
    39: 467,  // Az-Zumar
    40: 476,  // Ghafir
    41: 486,  // Fussilat
    42: 492,  // Ash-Shura
    43: 498,  // Az-Zukhruf
    44: 505,  // Ad-Dukhan
    45: 508,  // Al-Jathiyah
    46: 511,  // Al-Ahqaf
    47: 516,  // Muhammad
    48: 520,  // Al-Fath
    49: 524,  // Al-Hujurat
    50: 527,  // Qaf
    51: 529,  // Adh-Dhariyat
    52: 532,  // At-Tur
    53: 535,  // An-Najm
    54: 537,  // Al-Qamar
    55: 540,  // Ar-Rahman
    56: 543,  // Al-Waqi'ah
    57: 546,  // Al-Hadid
    58: 551,  // Al-Mujadilah
    59: 554,  // Al-Hashr
    60: 558,  // Al-Mumtahanah
    61: 560,  // As-Saff
    62: 562,  // Al-Jumu'ah
    63: 563,  // Al-Munafiqun
    64: 565,  // At-Taghabun
    65: 567,  // At-Talaq
    66: 569,  // At-Tahrim
    67: 571,  // Al-Mulk
    68: 573,  // Al-Qalam
    69: 575,  // Al-Haqqah
    70: 577,  // Al-Ma'arij
    71: 579,  // Nuh
    72: 581,  // Al-Jinn
    73: 583,  // Al-Muzzammil
    74: 584,  // Al-Muddaththir
    75: 586,  // Al-Qiyamah
    76: 587,  // Al-Insan
    77: 589,  // Al-Mursalat
    78: 591,  // An-Naba
    79: 592,  // An-Nazi'at
    80: 594,  // 'Abasa
    81: 595,  // At-Takwir
    82: 596,  // Al-Infitar
    83: 597,  // Al-Mutaffifin
    84: 598,  // Al-Inshiqaq
    85: 599,  // Al-Buruj
    86: 600,  // At-Tariq
    87: 600,  // Al-A'la
    88: 601,  // Al-Ghashiyah
    89: 602,  // Al-Fajr
    90: 603,  // Al-Balad
    91: 604,  // Ash-Shams
    92: 604,  // Al-Layl
    93: 605,  // Ad-Duha
    94: 606,  // Ash-Sharh
    95: 606,  // At-Tin
    96: 607,  // Al-'Alaq
    97: 607,  // Al-Qadr
    98: 607,  // Al-Bayyinah
    99: 608,  // Az-Zalzalah
    100: 608, // Al-'Adiyat
    101: 609, // Al-Qari'ah
    102: 609, // At-Takathur
    103: 610, // Al-'Asr
    104: 610, // Al-Humazah
    105: 610, // Al-Fil
    106: 611, // Quraysh
    107: 611, // Al-Ma'un
    108: 611, // Al-Kawthar
    109: 612, // Al-Kafirun
    110: 612, // An-Nasr
    111: 612, // Al-Masad
    112: 613, // Al-Ikhlas
    113: 613, // Al-Falaq
    114: 613  // An-Nas
  };

  constructor(private http: HttpClient) {}

  private formatPageNumber(page: number): string {
    return page.toString().padStart(3, '0');
  }

  // Convert display page number (1-604) to actual file number (10-627)
  displayToActualPage(displayPage: number): number {
    return displayPage + 9;
  }

  // Convert actual file number (10-627) to display page number (1-604)
  actualToDisplayPage(actualPage: number): number {
    return actualPage - 9;
  }

  getMushafPage(page: number): Observable<MushafPage> {
    // page is already the actual file number (10-627), no need to convert
    const imageUrl = this.getPageImageUrl(page);
    // // console.log('Loading image:', imageUrl);
    return of({ page, imageUrl });
  }

  getPageBySurah(surahNumber: number): Observable<number> {
    const filePage = this.surahPageMap[surahNumber];
    // // console.log(`Getting page for surah ${surahNumber}:`, filePage);
    if (!filePage) {
      // // console.error(`❌ Invalid surah number: ${surahNumber}`);
      return of(10); // Default to page 10 (Al-Fatiha)
    }
    return of(filePage); // Return the actual file page number
  }

  getPageImageUrl(page: number): string {
    const formattedPage = this.formatPageNumber(page);
    const url = `${environment.mushafImageBaseUrl}quran_Page_${formattedPage}.png`;
    // // console.log('Generated Cloud URL:', url);
    return url;
  }

  getTotalPages(): number {
    return this.TOTAL_PAGES;
  }

  getPageData(page: number): any {
    return {
      page,
      imageUrl: this.getPageImageUrl(page)
    };
  }

  private getPageForSurah(surahNumber: number): string {
    const filePage = this.surahPageMap[surahNumber];
    if (!filePage) throw new Error(`No page data for surah ${surahNumber}`);
    // // console.log(`Getting page for surah ${surahNumber}:`, filePage);
    return filePage.toString().padStart(3, '0');
  }

  private getImageUrlForPage(pageNumber: string): string {
    // Construct URL using the environment variable
    const url = `${environment.mushafImageBaseUrl}quran_Page_${pageNumber}.png`;
    // // console.log('Generated URL:', url);
    return url;
  }

  getCloudPageImageUrl(pageNumber: number): string {
    const formattedPage = pageNumber.toString().padStart(3, '0');
    const url = `https://storage.googleapis.com/${this.bucketName}/${formattedPage}.png`;
    // // console.log('Generated Cloud URL:', url);
    return url;
  }

  getCloudPageImageUrlMin(pageNumber: number): string {
    const formattedPage = pageNumber.toString().padStart(3, '0');
    // Assuming 'min' folder exists in the bucket
    const url = `https://storage.googleapis.com/${this.bucketName}/min/${formattedPage}.png`; 
    // // console.log('Generated URL:', url);
    return url;
  }
}
