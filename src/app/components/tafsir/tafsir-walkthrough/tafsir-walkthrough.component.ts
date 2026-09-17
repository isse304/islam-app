import {
  Component, Output, EventEmitter, ViewChild, ElementRef,
  AfterViewInit, OnDestroy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

interface Slide {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  features: { text: string; icon: string; premium: boolean }[];
}

@Component({
  selector: 'app-tafsir-walkthrough',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule],
  templateUrl: './tafsir-walkthrough.component.html',
  styleUrls: ['./tafsir-walkthrough.component.scss']
})
export class TafsirWalkthroughComponent implements AfterViewInit, OnDestroy {
  @Output() completed = new EventEmitter<void>();
  @ViewChild('slidesContainer') slidesContainer!: ElementRef<HTMLDivElement>;

  currentSlide = 0;
  private observer: IntersectionObserver | null = null;

  slides: Slide[] = [
    {
      id: 'welcome',
      title: 'Tafsir Explorer',
      subtitle: 'Your personal guide to understanding the Quran through the words of classical scholars.',
      icon: 'auto_stories',
      features: []
    },
    {
      id: 'read',
      title: 'Read & Study',
      subtitle: 'Dive deep into the Quran with verse-by-verse commentary from renowned scholars.',
      icon: 'menu_book',
      features: [
        { text: 'Tafsir Ibn Kathir — classical & comprehensive', icon: 'library_books', premium: false },
        { text: "Ma'arif al-Qur'an — Hanafi scholarship & fiqh", icon: 'library_books', premium: false },
        { text: 'Tazkirul Quran — modern & accessible', icon: 'library_books', premium: false },
        { text: 'Arabic text with verse-by-verse navigation', icon: 'translate', premium: false }
      ]
    },
    {
      id: 'ai',
      title: 'AI-Powered Insights',
      subtitle: 'Ask questions about any verse and get scholar-specific explanations instantly.',
      icon: 'smart_toy',
      features: [
        { text: 'Ask anything about any verse', icon: 'chat', premium: false },
        { text: 'Answers grounded in actual tafsir texts', icon: 'verified', premium: false },
        { text: '5 free questions every day', icon: 'redeem', premium: false },
        { text: 'Unlimited with Premium', icon: 'all_inclusive', premium: true }
      ]
    },
    {
      id: 'tools',
      title: 'Study Tools',
      subtitle: 'A complete toolkit for your Quranic studies.',
      icon: 'construction',
      features: [
        { text: 'Bookmark your favourite verses', icon: 'bookmark', premium: false },
        { text: 'Track reading progress across editions', icon: 'trending_up', premium: false },
        { text: 'Rich notes & annotations on every verse', icon: 'edit_note', premium: true },
        { text: 'Highlight text with multiple colours', icon: 'format_color_fill', premium: true },
        { text: 'Split View & Focus Mode', icon: 'vertical_split', premium: true }
      ]
    },
    {
      id: 'cta',
      title: 'Start Your Journey',
      subtitle: 'Over 6,236 verses across 114 surahs are waiting for you.',
      icon: 'explore',
      features: []
    }
  ];

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.setupIntersectionObserver();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  get isLastSlide(): boolean {
    return this.currentSlide === this.slides.length - 1;
  }

  next(): void {
    if (this.isLastSlide) {
      this.finish();
    } else {
      this.scrollToSlide(this.currentSlide + 1);
    }
  }

  goToSlide(index: number): void {
    this.scrollToSlide(index);
  }

  skip(): void {
    this.finish();
  }

  finish(): void {
    localStorage.setItem('tafsir_walkthrough_seen', 'true');
    this.completed.emit();
  }

  private scrollToSlide(index: number): void {
    const container = this.slidesContainer?.nativeElement;
    if (!container) return;
    const slideEl = container.children[index] as HTMLElement;
    if (slideEl) {
      slideEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    }
  }

  private setupIntersectionObserver(): void {
    const container = this.slidesContainer?.nativeElement;
    if (!container) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Array.from(container.children).indexOf(entry.target as HTMLElement);
            if (index >= 0 && index !== this.currentSlide) {
              this.currentSlide = index;
              this.cdr.detectChanges();
            }
          }
        }
      },
      { root: container, threshold: 0.55 }
    );

    Array.from(container.children).forEach(child => this.observer!.observe(child));
  }
}
