import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

interface StoredConversation {
  editionId: string;
  surah: number;
  lastVerse: number;
  messages: {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    type?: string;
    context?: { surah?: number; verse?: number };
  }[];
  updatedAt: string;
  surahName?: string;
}

interface ConversationDisplay extends StoredConversation {
  storageKey: string;
  messageCount: number;
  userMessageCount: number;
  lastUserMessage: string;
  lastAssistantMessage: string;
}

@Component({
  selector: 'app-tafsir-conversations',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    MatButtonToggleModule
  ],
  templateUrl: './tafsir-conversations.component.html',
  styleUrls: ['./tafsir-conversations.component.scss']
})
export class TafsirConversationsComponent implements OnInit {
  conversations: ConversationDisplay[] = [];
  filteredConversations: ConversationDisplay[] = [];
  searchQuery = '';
  viewMode: 'grid' | 'list' = 'grid';
  isDarkMode = false;

  constructor(public router: Router) {}

  ngOnInit(): void {
    this.isDarkMode = document.body.classList.contains('dark') ||
                      document.body.classList.contains('theme-dark');
    this.loadConversations();
  }

  loadConversations(): void {
    const convos: ConversationDisplay[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('tafsir_chat_')) {
        try {
          const data: StoredConversation = JSON.parse(localStorage.getItem(key) || '');
          if (data?.messages?.length > 0) {
            const userMessages = data.messages.filter(m => m.role === 'user');
            const assistantMessages = data.messages.filter(m => m.role === 'assistant' && m.type !== 'greeting');
            convos.push({
              ...data,
              storageKey: key,
              messageCount: data.messages.length,
              userMessageCount: userMessages.length,
              lastUserMessage: userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '',
              lastAssistantMessage: assistantMessages.length > 0 
                ? this.truncate(assistantMessages[assistantMessages.length - 1].content, 120)
                : ''
            });
          }
        } catch { /* skip invalid */ }
      }
    }
    this.conversations = convos.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    this.applyFilter();
  }

  applyFilter(): void {
    if (!this.searchQuery.trim()) {
      this.filteredConversations = [...this.conversations];
      return;
    }
    const q = this.searchQuery.toLowerCase();
    this.filteredConversations = this.conversations.filter(c =>
      (c.surahName || '').toLowerCase().includes(q) ||
      c.lastUserMessage.toLowerCase().includes(q) ||
      c.lastAssistantMessage.toLowerCase().includes(q) ||
      String(c.surah).includes(q)
    );
  }

  openConversation(convo: ConversationDisplay): void {
    this.router.navigate(
      ['/tafsir/read', convo.editionId, convo.surah, convo.lastVerse],
      { queryParams: { openChat: true } }
    );
  }

  deleteConversation(convo: ConversationDisplay, event: Event): void {
    event.stopPropagation();
    localStorage.removeItem(convo.storageKey);
    this.loadConversations();
  }

  clearAllConversations(): void {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('tafsir_chat_')) {
        keys.push(key);
      }
    }
    keys.forEach(k => localStorage.removeItem(k));
    this.loadConversations();
  }

  getTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  private truncate(text: string, max: number): string {
    const stripped = text.replace(/[#*_`>]/g, '').replace(/\n/g, ' ').trim();
    return stripped.length > max ? stripped.substring(0, max) + '...' : stripped;
  }
}
