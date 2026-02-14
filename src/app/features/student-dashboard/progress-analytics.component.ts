import { Component, OnInit, inject, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { StudentProgressService, StudentAnalytics } from '../../services/student-progress.service';

@Component({
  selector: 'app-progress-analytics',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './progress-analytics.component.html',
  styleUrls: ['./progress-analytics.component.scss']
})
export class ProgressAnalyticsComponent implements OnInit {
  private progressService = inject(StudentProgressService);
  private cdr = inject(ChangeDetectorRef);
  
  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;
  
  analytics: StudentAnalytics | null = null;
  loading = true;
  
  // Line Chart - Grade Trends
  lineChartData: ChartData<'line'> = {
    datasets: []
  };
  
  lineChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: {
          color: '#8B7355',
          font: { family: 'Inter, sans-serif', size: 12 }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(183, 165, 122, 0.9)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: '#B7A57A',
        borderWidth: 1
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          color: '#8B7355',
          callback: (value) => value + '%'
        },
        grid: {
          color: 'rgba(183, 165, 122, 0.1)'
        }
      },
      x: {
        ticks: {
          color: '#8B7355'
        },
        grid: {
          color: 'rgba(183, 165, 122, 0.1)'
        }
      }
    }
  };
  
  // Bar Chart - Subject Performance
  barChartData: ChartData<'bar'> = {
    labels: [],
    datasets: []
  };
  
  barChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(183, 165, 122, 0.9)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: '#B7A57A',
        borderWidth: 1,
        callbacks: {
          label: (context) => {
            return `Grade: ${context.parsed.y}%`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          color: '#8B7355',
          callback: (value) => value + '%'
        },
        grid: {
          color: 'rgba(183, 165, 122, 0.1)'
        }
      },
      x: {
        ticks: {
          color: '#8B7355'
        },
        grid: {
          color: 'rgba(183, 165, 122, 0.1)'
        }
      }
    }
  };
  
  // Donut Chart - Completion Rate
  doughnutChartData: ChartData<'doughnut'> = {
    labels: ['Completed', 'Pending'],
    datasets: []
  };
  
  doughnutChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#8B7355',
          font: { family: 'Inter, sans-serif', size: 12 }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(183, 165, 122, 0.9)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: '#B7A57A',
        borderWidth: 1,
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.parsed || 0;
            return `${label}: ${value}%`;
          }
        }
      }
    }
  };

  ngOnInit(): void {
    this.loadAnalytics();
  }

  private loadAnalytics(): void {
    this.loading = true;
    
    this.progressService.getStudentAnalytics().subscribe({
      next: (analytics) => {
        this.analytics = analytics;
        this.setupCharts();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private setupCharts(): void {
    if (!this.analytics) return;
    
    // Setup Line Chart (Grade Trends)
    this.setupLineChart();
    
    // Setup Bar Chart (Subject Performance)
    this.setupBarChart();
    
    // Setup Donut Chart (Completion Rate)
    this.setupDoughnutChart();
  }

  private setupLineChart(): void {
    if (!this.analytics || this.analytics.gradeTrends.length === 0) {
      this.lineChartData = {
        labels: ['No data'],
        datasets: [{
          data: [0],
          label: 'Grade Average',
          borderColor: '#B7A57A',
          backgroundColor: 'rgba(183, 165, 122, 0.1)',
          tension: 0.4,
          fill: true
        }]
      };
      return;
    }
    
    const labels = this.analytics.gradeTrends.map(trend => 
      trend.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    );
    
    const data = this.analytics.gradeTrends.map(trend => trend.grade);
    
    this.lineChartData = {
      labels,
      datasets: [{
        data,
        label: 'Grade Average',
        borderColor: '#B7A57A',
        backgroundColor: 'rgba(183, 165, 122, 0.1)',
        pointBackgroundColor: '#B7A57A',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#B7A57A',
        tension: 0.4,
        fill: true
      }]
    };
  }

  private setupBarChart(): void {
    if (!this.analytics || this.analytics.subjectPerformance.length === 0) {
      this.barChartData = {
        labels: ['No classes'],
        datasets: [{
          data: [0],
          backgroundColor: ['#E5E7EB']
        }]
      };
      return;
    }
    
    const labels = this.analytics.subjectPerformance.map(perf => perf.className);
    const data = this.analytics.subjectPerformance.map(perf => perf.averageGrade);
    
    // Color code bars based on performance
    const backgroundColors = data.map(grade => {
      if (grade >= 90) return '#10B981'; // Green (A)
      if (grade >= 80) return '#3B82F6'; // Blue (B)
      if (grade >= 70) return '#F59E0B'; // Amber (C)
      return '#EF4444'; // Red (D/F)
    });
    
    this.barChartData = {
      labels,
      datasets: [{
        data,
        backgroundColor: backgroundColors,
        borderColor: backgroundColors.map(color => color),
        borderWidth: 2,
        borderRadius: 8
      }]
    };
  }

  private setupDoughnutChart(): void {
    if (!this.analytics) {
      this.doughnutChartData = {
        labels: ['Completed', 'Pending'],
        datasets: [{
          data: [0, 100],
          backgroundColor: ['#10B981', '#E5E7EB'],
          borderColor: ['#fff', '#fff'],
          borderWidth: 2
        }]
      };
      return;
    }
    
    const completionRate = this.analytics.completionRate;
    const pendingRate = 100 - completionRate;
    
    this.doughnutChartData = {
      labels: ['Completed', 'Pending'],
      datasets: [{
        data: [completionRate, pendingRate],
        backgroundColor: [
          '#10B981', // Green for completed
          '#E5E7EB'  // Gray for pending
        ],
        borderColor: ['#fff', '#fff'],
        borderWidth: 3
      }]
    };
  }

  getPerformanceColor(grade: number): string {
    if (grade >= 90) return '#10B981';
    if (grade >= 80) return '#3B82F6';
    if (grade >= 70) return '#F59E0B';
    return '#EF4444';
  }

  getPerformanceLabel(grade: number): string {
    if (grade >= 90) return 'Excellent';
    if (grade >= 80) return 'Good';
    if (grade >= 70) return 'Average';
    return 'Needs Improvement';
  }
}
