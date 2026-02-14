import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Observable } from 'rxjs';
import { Report } from 'src/app/models/classroom.models';
import { ReportService } from 'src/app/services/report.service';
import { ClassService } from 'src/app/services/class.service';
import { Class } from 'src/app/models/classroom.models';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartType } from 'chart.js';

@Component({
  selector: 'app-teacher-reports-home',
  templateUrl: './teacher-reports-home.component.html',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, BaseChartDirective],
})
export class TeacherReportsHomeComponent implements OnInit {
  private reportService = inject(ReportService);
  private classService = inject(ClassService);
  private fb = inject(FormBuilder);

  classes$!: Observable<Class[]>;
  reports$!: Observable<Report[]>;
  filterForm: FormGroup;

  // Chart properties with Islamic theme
  public lineChartData: ChartConfiguration['data'] = {
    datasets: [],
    labels: [],
  };
  public lineChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#8B7355',
          font: { family: 'Inter, sans-serif', size: 13 }
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
      x: {
        ticks: { color: '#8B7355' },
        grid: { color: 'rgba(183, 165, 122, 0.1)' }
      },
      y: {
        ticks: { color: '#8B7355' },
        grid: { color: 'rgba(183, 165, 122, 0.1)' }
      }
    }
  };
  public lineChartType: ChartType = 'line';

  constructor() {
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setMonth(today.getMonth() - 1);

    this.filterForm = this.fb.group({
      classId: [''],
      dateRange: this.fb.group({
        from: [lastMonth.toISOString().split('T')[0]],
        to: [today.toISOString().split('T')[0]],
      }),
    });
  }

  ngOnInit(): void {
    this.classes$ = this.classService.listMyClasses();
  }

  generateReport() {
    if (this.filterForm.invalid) {
      return;
    }
    const { classId, dateRange } = this.filterForm.value;
    if (classId && dateRange.from && dateRange.to) {
      this.reports$ = this.reportService.getReports(
        classId,
        new Date(dateRange.from),
        new Date(dateRange.to)
      );
      this.reports$.subscribe(reports => {
        this.updateChart(reports);
      });
    }
  }

  updateChart(reports: Report[]) {
    // Basic aggregation for the chart with Islamic theme colors
    const labels = reports.map(r => new Date(r.generatedAt.toDate()).toLocaleDateString());
    const data = reports.map(r => r.metrics.assignmentsCompleted);

    this.lineChartData = {
      labels: labels,
      datasets: [
        {
          data: data,
          label: 'Assignments Completed',
          fill: 'origin',
          borderColor: '#B7A57A',
          backgroundColor: 'rgba(183, 165, 122, 0.1)',
          pointBackgroundColor: '#B7A57A',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: '#B7A57A',
          tension: 0.4,
        },
      ],
    };
  }
  
  exportAsCsv(reports: Report[]) {
    const data = reports.map(r => ({
      student: r.studentId,
      assignmentsAssigned: r.metrics.assignmentsAssigned,
      assignmentsCompleted: r.metrics.assignmentsCompleted,
      avgScore: r.metrics.avgScore,
    }));
    this.reportService.exportCsv(data);
  }

  exportAsPdf(reports: Report[]) {
    const head = ['Student', 'Assignments Completed', 'Avg. Score'];
    const body = reports.map(r => [
      r.studentId,
      `${r.metrics.assignmentsCompleted} / ${r.metrics.assignmentsAssigned}`,
      `${r.metrics.avgScore?.toFixed(2)}%`
    ]);
    this.reportService.exportPdf('Class Report', head, body);
  }

  getScoreClass(score: number): string {
    if (score >= 90) return 'score-a';
    if (score >= 80) return 'score-b';
    if (score >= 70) return 'score-c';
    return 'score-d';
  }

  getAvgCompletion(reports: Report[]): number {
    if (reports.length === 0) return 0;
    const completed = reports.reduce((sum, r) => sum + r.metrics.assignmentsCompleted, 0);
    const assigned = reports.reduce((sum, r) => sum + r.metrics.assignmentsAssigned, 0);
    return assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
  }

  getAvgScore(reports: Report[]): string {
    if (reports.length === 0) return '0.0';
    const total = reports.reduce((sum, r) => sum + (r.metrics.avgScore || 0), 0);
    return (total / reports.length).toFixed(1);
  }

  getTotalAssignments(reports: Report[]): number {
    return reports.reduce((sum, r) => sum + r.metrics.assignmentsAssigned, 0);
  }
}
