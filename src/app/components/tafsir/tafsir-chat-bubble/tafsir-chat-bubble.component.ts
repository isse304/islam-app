import { Component, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatBadgeModule } from '@angular/material/badge';
import { firstValueFrom, catchError, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { MarkdownPipe } from '../../../pipes/markdown.pipe';
import { FirebaseAuthService } from '../../../services/firebase-auth.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type?: 'tafsir' | 'conversation' | 'greeting' | 'error' | 'warning' | 'paywall';
  context?: {
    surah?: number;
    verse?: number;
  };
}

interface ChatResponse {
  success: boolean;
  content?: string;
  error?: string;
  source?: string;
  sources?: any[];
  isPremium?: boolean;
  freeTierRemaining?: number;
  freeTierLimit?: number;
  freeTierExhausted?: boolean;
}

interface StoredConversation {
  editionId: string;
  surah: number;
  lastVerse: number;
  messages: ChatMessage[];
  updatedAt: string;
  surahName?: string;
}

@Component({
  selector: 'app-tafsir-chat-bubble',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatBadgeModule,
    MarkdownPipe
  ],
  templateUrl: './tafsir-chat-bubble.component.html',
  styleUrls: ['./tafsir-chat-bubble.component.scss']
})
export class TafsirChatBubbleComponent implements OnChanges, OnDestroy {
  @Input() surah: number = 1;
  @Input() verse: number = 1;
  @Input() editionId: string = 'en-ibn-kathir';
  @Input() surahName: string = '';
  @Input() autoOpen: boolean = false;

  @ViewChild('messageContainer') messageContainer!: ElementRef;
  @ViewChild('chatInput') chatInput!: ElementRef;

  isExpanded = false;
  isLoading = false;
  userQuestion = '';
  messages: ChatMessage[] = [];
  freeTierRemaining: number | null = null;
  freeTierLimit: number | null = null;
  isPremium: boolean | null = null;
  freeTierExhausted = false;

  private storageKeyPrefix = 'tafsir_chat_';
  private hasShownWelcome = false;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    public router: Router,
    private authService: FirebaseAuthService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['surah'] || changes['editionId']) {
      this.loadConversation();
    }
    if (changes['autoOpen'] && this.autoOpen && !this.isExpanded) {
      setTimeout(() => this.toggleChat(), 300);
    }
  }

  ngOnDestroy(): void {
    this.saveConversation();
  }

  get storageKey(): string {
    return `${this.storageKeyPrefix}${this.editionId}_${this.surah}`;
  }

  get selectedTafsir(): string {
    if (this.editionId.includes('ibn-kathir')) return 'ibn-kathir';
    if (this.editionId.includes('tabari')) return 'tabari';
    return 'ibn-kathir';
  }

  toggleChat(): void {
    this.isExpanded = !this.isExpanded;
    if (this.isExpanded) {
      this.loadConversation();
      this.refreshPremiumStatus();
      if (this.messages.length === 0 && !this.hasShownWelcome) {
        this.messages.push({
          role: 'assistant',
          content: `Assalamu Alaikum! I can help you understand the tafsir of any verse in this surah. You're currently reading **${this.surahName || 'Surah ' + this.surah}**, verse **${this.verse}**. Ask me anything about this verse or the surah's theme.`,
          timestamp: new Date(),
          type: 'greeting'
        });
        this.hasShownWelcome = true;
      }
      setTimeout(() => {
        this.scrollToBottom();
        this.focusInput();
      }, 200);
    }
  }

  private async refreshPremiumStatus(): Promise<void> {
    try {
      const premium = await this.authService.isPremiumUser();
      if (premium) {
        this.isPremium = true;
        this.freeTierExhausted = false;
        this.freeTierRemaining = null;

        // Remove paywall messages from the conversation
        const hadPaywall = this.messages.some(m => m.type === 'paywall');
        this.messages = this.messages.filter(m => m.type !== 'paywall');
        if (hadPaywall) {
          this.messages.push({
            role: 'assistant',
            content: 'Welcome back! Your **Nura Premium** subscription is active. You now have unlimited AI questions. Ask away!',
            timestamp: new Date(),
            type: 'greeting'
          });
          this.saveConversation();
        }
        this.cdr.detectChanges();
      }
    } catch {
      // Silently fail — premium status will be updated on next API response
    }
  }

  async sendQuestion(): Promise<void> {
    const question = this.userQuestion.trim();
    if (!question || this.isLoading || this.freeTierExhausted) return;

    this.isLoading = true;
    this.userQuestion = '';

    this.messages.push({
      role: 'user',
      content: question,
      timestamp: new Date(),
      type: 'conversation',
      context: { surah: this.surah, verse: this.verse }
    });
    this.scrollToBottom();
    this.cdr.detectChanges();

    try {
      const cleanedQuestion = question.toLowerCase().trim();
      const greetings = ['hi', 'hello', 'salam', 'assalamu alaikum', 'wa alaikum assalam', 'thank you', 'thanks', 'shukran'];
      const capabilityQueries = ['what can you do', 'how do you work', 'what are your functions', 'capabilities'];
      const isGeneralQuery = greetings.some(g => cleanedQuestion.startsWith(g)) ||
                             capabilityQueries.some(q => cleanedQuestion.includes(q)) ||
                             cleanedQuestion.length < 5;

      const payload: any = {
        question,
        selectedTafsir: this.selectedTafsir,
        ...(!isGeneralQuery && { surah: this.surah, verse: this.verse })
      };

      const response = await firstValueFrom(
        this.http.post<ChatResponse>(`${environment.apiUrl}/api/tafsir/chat`, payload).pipe(
          catchError((error: HttpErrorResponse) => {
            if (error.status === 403 && error.error?.freeTierExhausted) {
              return of({
                success: false,
                freeTierExhausted: true,
                error: error.error?.error || 'Free tier exhausted',
                freeTierRemaining: 0,
                freeTierLimit: error.error?.limit || 5
              } as ChatResponse);
            }
            if (error.status === 429) {
              return of({
                success: false,
                error: error.error?.error || 'Daily limit reached. Please try again tomorrow.'
              } as ChatResponse);
            }
            return of({
              success: false,
              error: 'Could not reach the AI service. Please try again.'
            } as ChatResponse);
          })
        )
      );

      if (response.freeTierRemaining !== undefined) {
        this.freeTierRemaining = response.freeTierRemaining;
        this.freeTierLimit = response.freeTierLimit ?? 5;
      }
      if (response.isPremium !== undefined) {
        this.isPremium = response.isPremium;
      }

      if (response.freeTierExhausted) {
        this.freeTierExhausted = true;
        this.freeTierRemaining = 0;
        this.messages.push({
          role: 'assistant',
          content: 'You\'ve used all 5 free AI questions for today. Upgrade to **Nura Premium** for unlimited daily access, or come back tomorrow for 5 more free questions.',
          timestamp: new Date(),
          type: 'paywall'
        });
      } else if (response.success && response.content) {
        this.messages.push({
          role: 'assistant',
          content: response.content,
          timestamp: new Date(),
          type: response.source === 'tafsir_sources' ? 'tafsir' : 'conversation'
        });
      } else {
        this.messages.push({
          role: 'assistant',
          content: response.error || 'Sorry, I received an unexpected response. Please try again.',
          timestamp: new Date(),
          type: 'error'
        });
      }

      this.saveConversation();
    } catch (error) {
      this.messages.push({
        role: 'assistant',
        content: 'An error occurred. Please try again later.',
        timestamp: new Date(),
        type: 'error'
      });
    } finally {
      this.isLoading = false;
      this.scrollToBottom();
      this.cdr.detectChanges();
    }
  }

  clearChat(): void {
    this.messages = [];
    this.hasShownWelcome = false;
    this.freeTierExhausted = false;
    localStorage.removeItem(this.storageKey);
  }

  handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendQuestion();
    }
  }

  goToSubscription(): void {
    this.router.navigate(['/subscription'], { queryParams: { feature: 'AI Tafsir Chat' } });
  }

  private loadConversation(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data: StoredConversation = JSON.parse(stored);
        this.messages = data.messages.map(m => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
        if (this.messages.length > 0) {
          this.hasShownWelcome = true;
        }
        // Don't restore freeTierExhausted from cache here —
        // refreshPremiumStatus() will handle this after checking actual status
      } else {
        this.messages = [];
        this.hasShownWelcome = false;
      }
    } catch {
      this.messages = [];
    }
  }

  private saveConversation(): void {
    if (this.messages.length === 0) return;
    try {
      const data: StoredConversation = {
        editionId: this.editionId,
        surah: this.surah,
        lastVerse: this.verse,
        messages: this.messages,
        updatedAt: new Date().toISOString(),
        surahName: this.surahName
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch {
      // localStorage full or unavailable
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messageContainer?.nativeElement) {
        const el = this.messageContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    }, 100);
  }

  private focusInput(): void {
    setTimeout(() => {
      if (this.chatInput?.nativeElement) {
        this.chatInput.nativeElement.focus();
      }
    }, 300);
  }

  static getAllConversations(): StoredConversation[] {
    const conversations: StoredConversation[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('tafsir_chat_')) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '');
          if (data?.messages?.length > 0) {
            conversations.push(data);
          }
        } catch { /* skip invalid entries */ }
      }
    }
    return conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
}
