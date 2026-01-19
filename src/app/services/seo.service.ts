import { Injectable } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

export interface PageMeta {
  title: string;
  description: string;
  keywords: string;
  ogImage?: string;
  canonicalUrl?: string;
  structuredData?: any;
}

/**
 * SEO Service
 * 
 * Manages meta tags, titles, and structured data for SEO optimization.
 * Automatically updates meta tags based on route changes.
 */
@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private baseUrl = 'https://www.nura-ai.app';

  constructor(
    private titleService: Title,
    private metaService: Meta,
    private router: Router
  ) {
    this.initRouteListener();
  }

  /**
   * Listen to route changes and update meta tags automatically
   */
  private initRouteListener(): void {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.updateMetaForRoute(event.urlAfterRedirects);
    });
  }

  /**
   * Set page meta tags programmatically
   */
  setPageMeta(meta: PageMeta): void {
    // Update title
    this.titleService.setTitle(meta.title);

    // Update standard meta tags
    this.metaService.updateTag({ name: 'description', content: meta.description });
    this.metaService.updateTag({ name: 'keywords', content: meta.keywords });

    // Update Open Graph tags
    this.metaService.updateTag({ property: 'og:title', content: meta.title });
    this.metaService.updateTag({ property: 'og:description', content: meta.description });
    if (meta.ogImage) {
      this.metaService.updateTag({ property: 'og:image', content: meta.ogImage });
    }
    if (meta.canonicalUrl) {
      this.metaService.updateTag({ property: 'og:url', content: meta.canonicalUrl });
    }

    // Update Twitter Card tags
    this.metaService.updateTag({ name: 'twitter:title', content: meta.title });
    this.metaService.updateTag({ name: 'twitter:description', content: meta.description });
    if (meta.ogImage) {
      this.metaService.updateTag({ name: 'twitter:image', content: meta.ogImage });
    }

    // Update canonical URL
    if (meta.canonicalUrl) {
      this.updateCanonicalUrl(meta.canonicalUrl);
    }

    // Add structured data if provided
    if (meta.structuredData) {
      this.addStructuredData(meta.structuredData);
    }
  }

  /**
   * Update meta tags based on the current route
   */
  private updateMetaForRoute(url: string): void {
    const routeMeta = this.getMetaForRoute(url);
    if (routeMeta) {
      this.setPageMeta(routeMeta);
    }
  }

  /**
   * Get meta tags for a specific route
   */
  private getMetaForRoute(url: string): PageMeta | null {
    // Define meta for each public route
    const routes: { [key: string]: PageMeta } = {
      '/quran': {
        title: 'Read Quran Online - 114 Surahs with Translation & Audio | Nura AI',
        description: 'Read the complete Holy Quran online with multiple translations, verse-by-verse audio, Mushaf view, and reading progress tracking. Free and accessible to all.',
        keywords: 'quran online, quran reader, quran translation, quran audio, read quran, mushaf online, surah, ayah, verse',
        canonicalUrl: `${this.baseUrl}/quran`,
        ogImage: `${this.baseUrl}/assets/og-quran.jpg`
      },
      '/dua': {
        title: 'Daily Islamic Duas - Morning, Evening & Protection Duas | Nura AI',
        description: 'Comprehensive collection of authentic Islamic duas for all occasions. Morning duas, evening duas, protection duas, and more with Arabic text, translation, and virtues.',
        keywords: 'islamic duas, daily duas, morning dua, evening dua, protection dua, supplication, prayer, islam',
        canonicalUrl: `${this.baseUrl}/dua`,
        ogImage: `${this.baseUrl}/assets/og-dua.jpg`
      },
      '/about': {
        title: 'About Nura AI - Islamic Learning Platform',
        description: 'Learn about Nura AI, our mission to make Islamic knowledge accessible through technology, and our features including Quran reader, duas, and classroom tools.',
        keywords: 'about nura ai, islamic education, islamic learning platform, quran app',
        canonicalUrl: `${this.baseUrl}/about`
      },
      '/contact': {
        title: 'Contact Us - Nura AI Support',
        description: 'Get in touch with the Nura AI team. We\'re here to help with questions, feedback, and support.',
        keywords: 'contact nura ai, support, help, feedback',
        canonicalUrl: `${this.baseUrl}/contact`
      },
      '/': {
        title: 'Nura AI - Your Intelligent Islamic Learning Companion',
        description: 'Free Islamic learning platform with Quran reader, duas, AI-powered Tafsir, and classroom features for teachers. Start your spiritual journey today.',
        keywords: 'islamic app, quran, duas, islamic learning, nura ai, muslim app',
        canonicalUrl: this.baseUrl,
        ogImage: `${this.baseUrl}/assets/og-home.jpg`
      }
    };

    // Handle Surah-specific URLs
    const surahMatch = url.match(/\/quran\?surah=(\d+)/);
    if (surahMatch) {
      const surahNumber = parseInt(surahMatch[1]);
      return this.getSurahMeta(surahNumber);
    }

    return routes[url] || routes[url.split('?')[0]] || null;
  }

  /**
   * Get meta tags for a specific Surah
   */
  getSurahMeta(surahNumber: number): PageMeta {
    // Surah names mapping (add all 114 surahs in production)
    const surahNames: { [key: number]: { en: string; ar: string } } = {
      1: { en: 'Al-Fatihah', ar: 'الفاتحة' },
      2: { en: 'Al-Baqarah', ar: 'البقرة' },
      3: { en: 'Ali \'Imran', ar: 'آل عمران' },
      4: { en: 'An-Nisa', ar: 'النساء' },
      5: { en: 'Al-Ma\'idah', ar: 'المائدة' },
      // ... add all surahs
    };

    const surah = surahNames[surahNumber] || { en: `Surah ${surahNumber}`, ar: '' };

    return {
      title: `Surah ${surah.en} (${surah.ar}) - Read Online with Translation | Nura AI`,
      description: `Read Surah ${surah.en} online with English translation, verse-by-verse audio, and Mushaf view. Explore the meanings and listen to beautiful recitations.`,
      keywords: `surah ${surah.en.toLowerCase()}, ${surah.ar}, quran surah ${surahNumber}, read ${surah.en}`,
      canonicalUrl: `${this.baseUrl}/quran?surah=${surahNumber}`,
      ogImage: `${this.baseUrl}/assets/og-quran.jpg`,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'Article',
        'headline': `Surah ${surah.en}`,
        'description': `Read Surah ${surah.en} from the Holy Quran`,
        'author': {
          '@type': 'Organization',
          'name': 'Nura AI'
        },
        'publisher': {
          '@type': 'Organization',
          'name': 'Nura AI',
          'logo': {
            '@type': 'ImageObject',
            'url': `${this.baseUrl}/nura-logo.png`
          }
        }
      }
    };
  }

  /**
   * Update or create canonical URL link tag
   */
  private updateCanonicalUrl(url: string): void {
    let link: HTMLLinkElement | null = document.querySelector("link[rel='canonical']");
    
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    
    link.setAttribute('href', url);
  }

  /**
   * Add structured data (JSON-LD) to the page
   */
  addStructuredData(data: any): void {
    // Remove existing structured data scripts to prevent duplicates
    const existingScripts = document.querySelectorAll('script[type="application/ld+json"]');
    existingScripts.forEach(script => script.remove());

    // Add new structured data
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(data);
    document.head.appendChild(script);
  }

  /**
   * Remove structured data from the page
   */
  removeStructuredData(): void {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    scripts.forEach(script => script.remove());
  }
}
