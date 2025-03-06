import { Component, Input, OnInit } from '@angular/core';
import { Dua } from '../../services/dua.service';
import { OpenAIService, AIResponse } from '../../services/openai.service';

@Component({
  selector: 'app-dua-insights',
  templateUrl: './dua-insights.component.html',
  styleUrls: ['./dua-insights.component.css']
})
export class DuaInsightsComponent implements OnInit {
  @Input() dua!: Dua;
  
  insights: AIResponse | null = null;
  reflections: AIResponse | null = null;
  isLoading: boolean = false;
  error: string = '';
  activeTab: 'insights' | 'reflections' | 'context' = 'insights';

  constructor(private openAIService: OpenAIService) {}

  ngOnInit() {
    this.loadInsights();
  }

  loadInsights() {
    this.isLoading = true;
    this.error = '';

    this.openAIService.generateDuaInsights(this.dua)
      .subscribe({
        next: (response) => {
          this.insights = response;
          this.isLoading = false;
        },
        error: (error) => {
          this.error = 'Failed to load insights. Please try again.';
          this.isLoading = false;
          console.error('Error loading insights:', error);
        }
      });

    this.openAIService.generateReflectionPrompts(this.dua)
      .subscribe({
        next: (response) => {
          this.reflections = response;
        },
        error: (error) => {
          console.error('Error loading reflections:', error);
        }
      });
  }

  setActiveTab(tab: 'insights' | 'reflections' | 'context') {
    this.activeTab = tab;
  }
} 