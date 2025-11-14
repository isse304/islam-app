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

  // Chart properties
  public lineChartData: ChartConfiguration['data'] = {
    datasets: [],
    labels: [],
  };
  public lineChartOptions: ChartConfiguration['options'] = {
    responsive: true,
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
    // Basic aggregation for the chart
    const labels = reports.map(r => new Date(r.generatedAt.toDate()).toLocaleDateString());
    const data = reports.map(r => r.metrics.assignmentsCompleted);

    this.lineChartData = {
      labels: labels,
      datasets: [
        {
          data: data,
          label: 'Assignments Completed',
          fill: 'origin',
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
}
