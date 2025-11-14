import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  QuerySnapshot,
  QueryDocumentSnapshot,
} from '@angular/fire/firestore';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { Report } from '../models/classroom.models';
import { genericConverter } from '../models/firestore-converters';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Injectable({
  providedIn: 'root',
})
export class ReportService {
  private firestore = inject(Firestore);

  private reportsCollection = collection(
    this.firestore,
    'reports'
  ).withConverter(genericConverter<Report>());

  getReports(
    classId: string,
    fromDate: Date,
    to: Date
  ): Observable<Report[]> {
    const q = query(
      this.reportsCollection,
      where('classId', '==', classId),
      where('generatedAt', '>=', Timestamp.fromDate(fromDate)),
      where('generatedAt', '<=', Timestamp.fromDate(to))
    );
    return from(getDocs(q)).pipe(
      map((snapshot: QuerySnapshot<Report>) =>
        snapshot.docs.map((doc: QueryDocumentSnapshot<Report>) => doc.data())
      )
    );
  }

  exportCsv(rows: any[]): void {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const escape = (s: any) => `"${String(s).replace(/"/g, '""')}"`;
    const csvContent = [
      headers.join(','),
      ...rows.map(r => headers.map(h => escape(r[h] ?? '')).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'report.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  exportPdf(title: string, head: string[], body: any[][]): void {
    const doc = new jsPDF();
    doc.text(title, 14, 16);
    autoTable(doc, { head: [head], body });
    doc.save(title.replace(/\s+/g, '_') + '.pdf');
  }
}
