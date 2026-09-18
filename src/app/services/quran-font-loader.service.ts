import { Injectable } from '@angular/core';

/**
 * Service to manage loading and caching of QCF (Quran Character Font) page-based fonts
 * QCF fonts are special fonts where each Mushaf page (1-604) has its own font file
 * V4 fonts include Tajweed color rules built into the font glyphs
 */
@Injectable({
  providedIn: 'root'
})
export class QuranFontLoaderService {
  private readonly CDN_BASE = 'https://verses.quran.foundation/fonts/quran/hafs';
  private loadedFonts = new Set<string>();
  private loadingPromises = new Map<string, Promise<string>>();

  constructor() {
    this.preloadUnicodeFallbackFont();
    this.injectDarkPalettes();
  }

  /**
   * Preload the Unicode fallback font (QPC Hafs) for immediate display
   */
  private preloadUnicodeFallbackFont(): void {
    const fontFace = new FontFace(
      'UthmanicHafs',
      `url('${this.CDN_BASE}/uthmanic_hafs/UthmanicHafs1Ver18.woff2')`
    );
    fontFace.display = 'swap';
    
    fontFace.load()
      .then(loaded => {
        (document.fonts as any).add(loaded);
      })
      .catch(err => console.error('Failed to load Unicode fallback font:', err));
  }

  /**
   * Load QCF V4 Tajweed font for a specific Mushaf page
   * Supports both COLRv1 (Chrome/Safari/Edge) and OT-SVG (Firefox) formats
   * 
   * @param pageNumber - Mushaf page number (1-604)
   * @param _theme - Kept for callers; COLRv1 is used for every theme
   * @returns Promise resolving to the font family name
   */
  async loadTajweedFont(pageNumber: number, _theme: 'light' | 'dark' | 'sepia' = 'light'): Promise<string> {
    const fontName = `p${pageNumber}-v4`;
    
    // Return if already loaded
    if (this.loadedFonts.has(fontName)) {
      console.log(`Font ${fontName} already loaded`);
      return fontName;
    }

    // Return existing loading promise if in progress
    if (this.loadingPromises.has(fontName)) {
      return this.loadingPromises.get(fontName)!;
    }
    
    // Create new loading promise
    const loadingPromise = this.loadFontWithFallback(pageNumber, fontName);
    this.loadingPromises.set(fontName, loadingPromise);

    try {
      await loadingPromise;
      this.loadedFonts.add(fontName);
      this.loadingPromises.delete(fontName);
      return fontName;
    } catch (error) {
      console.error(`✗ Failed to load font ${fontName}:`, error);
      this.loadingPromises.delete(fontName);
      throw error;
    }
  }

  /**
   * Always load COLRv1 first. CSS fill flattens OT-SVG color glyphs, but COLR
   * keeps tajweed layers. Dark mode uses --qcf-dark (light tajweed hues with
   * cream ink) so colors match light mode on dark cards.
   */
  private async loadFontWithFallback(
    pageNumber: number,
    fontName: string
  ): Promise<string> {
    const colrUrl = `${this.CDN_BASE}/v4/colrv1/woff2/p${pageNumber}.woff2`;
    const svgUrl = `${this.CDN_BASE}/v4/ot-svg/light/woff2/p${pageNumber}.woff2`;

    try {
      await this.loadSingleFont(fontName, colrUrl);
      return fontName;
    } catch {
      await this.loadSingleFont(fontName, svgUrl);
      return fontName;
    }
  }

  /**
   * Palette 0 is the light tajweed set (same reds/greens/blues as light mode).
   * Indices 0/13/14 are the black base ink — recolor those to cream so letters
   * read on dark cards without shifting tajweed hues (invert made red look pink).
   * Palette 4 is the non-tajweed dark set (white ink) for the off toggle.
   */
  private injectDarkPalettes(): void {
    if (typeof document === 'undefined' || document.getElementById('qcf-v4-dark-palette')) {
      return;
    }
    const families = Array.from({ length: 604 }, (_, i) => `p${i + 1}-v4`).join(', ');
    const style = document.createElement('style');
    style.id = 'qcf-v4-dark-palette';
    style.textContent = `
      @font-palette-values --qcf-dark {
        font-family: ${families};
        base-palette: 0;
        override-colors: 0 #F4EDE0, 13 #F4EDE0, 14 #F4EDE0;
      }
      @font-palette-values --qcf-mono {
        font-family: ${families};
        base-palette: 4;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Load a single font file and add it to the document
   */
  private async loadSingleFont(
    fontName: string,
    url: string
  ): Promise<void> {
    const fontFace = new FontFace(fontName, `url('${url}')`);
    fontFace.display = 'swap'; // Use fallback font then swap when ready (faster initial render)
    
    const loaded = await fontFace.load();
    (document.fonts as any).add(loaded);
  }

  /**
   * Preload fonts for multiple pages - LAZY loading to prevent blocking
   * Only loads first page immediately, rest in background
   * 
   * @param pageNumbers - Array of page numbers to preload
   * @param theme - Theme for OT-SVG fonts
   */
  async preloadPages(pageNumbers: number[], theme: 'light' | 'dark' | 'sepia' = 'light'): Promise<void> {
    const uniquePages = [...new Set(pageNumbers)];
    
    if (uniquePages.length === 0) return;
    
    // Load ONLY the first page immediately (visible content)
    if (uniquePages.length > 0) {
      await this.loadTajweedFont(uniquePages[0], theme).catch(() => {});
    }
    
    // Load remaining pages in background WITHOUT blocking UI
    if (uniquePages.length > 1) {
      this.loadRemainingPagesInBackground(uniquePages.slice(1), theme);
    }
  }
  
  /**
   * Load remaining pages in background using requestIdleCallback or setTimeout fallback
   */
  private loadRemainingPagesInBackground(pageNumbers: number[], theme: 'light' | 'dark' | 'sepia'): void {
    const loadNextBatch = (index: number) => {
      if (index >= pageNumbers.length) return;
      
      // Load one font at a time in idle time
      if ((window as any).requestIdleCallback) {
        // Use requestIdleCallback if available (modern browsers)
        (window as any).requestIdleCallback(() => {
          this.loadTajweedFont(pageNumbers[index], theme)
            .catch(() => {})
            .finally(() => loadNextBatch(index + 1));
        });
      } else {
        // Fallback to setTimeout
        setTimeout(() => {
          this.loadTajweedFont(pageNumbers[index], theme)
            .catch(() => {})
            .finally(() => loadNextBatch(index + 1));
        }, 100);
      }
    };
    
    loadNextBatch(0);
  }

  /**
   * Check if a font is already loaded
   */
  isFontLoaded(pageNumber: number): boolean {
    return this.loadedFonts.has(`p${pageNumber}-v4`);
  }

  /**
   * Get the font family name for a specific page
   */
  getFontFamily(pageNumber: number): string {
    return `p${pageNumber}-v4`;
  }

  /**
   * Get the fallback Unicode font family
   */
  getFallbackFont(): string {
    return 'UthmanicHafs, Traditional Arabic, serif';
  }

  /**
   * Clear all loaded fonts (useful for testing)
   */
  clearCache(): void {
    this.loadedFonts.clear();
    this.loadingPromises.clear();
  }
}
