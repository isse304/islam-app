import { Component, Inject, ViewChild, ElementRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

export interface ShareCardData {
  surah: number;
  verse: number;
  surahName: string;
  arabicText: string;
  translation: string;
  tafsirExcerpt: string;
  editionName: string;
}

interface CardStyle {
  id: string;
  name: string;
  gradient: string;
  preview: string;
  colors: [string, string];
}

@Component({
  selector: 'app-tafsir-share-card',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatSnackBarModule
  ],
  templateUrl: './tafsir-share-card.component.html',
  styleUrls: ['./tafsir-share-card.component.scss']
})
export class TafsirShareCardComponent implements OnInit {
  @ViewChild('shareCard', { static: true }) shareCardEl!: ElementRef<HTMLDivElement>;

  canShare = false;
  selectedStyle = 'midnight';
  isGenerating = false;
  readonly siteUrl = 'nura-ai.app';

  cardStyles: CardStyle[] = [
    {
      id: 'midnight',
      name: 'Midnight',
      gradient: 'linear-gradient(145deg, #1A365D 0%, #0F172A 100%)',
      preview: 'linear-gradient(145deg, #1A365D 0%, #0F172A 100%)',
      colors: ['#1A365D', '#0F172A']
    },
    {
      id: 'desert',
      name: 'Desert',
      gradient: 'linear-gradient(145deg, #B7A57A 0%, #8B6914 100%)',
      preview: 'linear-gradient(145deg, #B7A57A 0%, #8B6914 100%)',
      colors: ['#B7A57A', '#8B6914']
    },
    {
      id: 'forest',
      name: 'Forest',
      gradient: 'linear-gradient(145deg, #064E3B 0%, #1A365D 100%)',
      preview: 'linear-gradient(145deg, #064E3B 0%, #1A365D 100%)',
      colors: ['#064E3B', '#1A365D']
    },
    {
      id: 'dawn',
      name: 'Dawn',
      gradient: 'linear-gradient(145deg, #7C3AED 0%, #1A365D 100%)',
      preview: 'linear-gradient(145deg, #7C3AED 0%, #1A365D 100%)',
      colors: ['#7C3AED', '#1A365D']
    }
  ];

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ShareCardData,
    private dialogRef: MatDialogRef<TafsirShareCardComponent>,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.canShare = !!navigator.share;
  }

  get currentStyle(): CardStyle {
    return this.cardStyles.find(s => s.id === this.selectedStyle) || this.cardStyles[0];
  }

  selectStyle(id: string): void {
    this.selectedStyle = id;
  }

  getTafsirExcerpt(): string {
    if (!this.data.tafsirExcerpt) return '';
    const cleaned = this.data.tafsirExcerpt
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned.length <= 150) return cleaned;
    const truncated = cleaned.substring(0, 150);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > 100 ? truncated.substring(0, lastSpace) : truncated) + '...';
  }

  close(): void {
    this.dialogRef.close();
  }

  async downloadCard(): Promise<void> {
    this.isGenerating = true;
    try {
      const canvas = await this.renderCanvas();
      const blob = await this.canvasToBlob(canvas);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `nura-ai-${this.data.surahName}-verse-${this.data.verse}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      this.snackBar.open('Image downloaded!', 'OK', { duration: 2500 });
    } catch (err) {
      console.error('Download failed:', err);
      this.fallbackCopyText();
    } finally {
      this.isGenerating = false;
    }
  }

  async copyToClipboard(): Promise<void> {
    this.isGenerating = true;
    try {
      const canvas = await this.renderCanvas();
      const blob = await this.canvasToBlob(canvas);
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      this.snackBar.open('Image copied to clipboard!', 'OK', { duration: 2500 });
    } catch (err) {
      console.error('Copy failed:', err);
      this.fallbackCopyText();
    } finally {
      this.isGenerating = false;
    }
  }

  async shareNative(): Promise<void> {
    this.isGenerating = true;
    try {
      const canvas = await this.renderCanvas();
      const blob = await this.canvasToBlob(canvas);
      const file = new File([blob], `nura-ai-${this.data.surahName}-verse-${this.data.verse}.png`, { type: 'image/png' });

      await navigator.share({
        title: `${this.data.surahName} · Verse ${this.data.verse}`,
        text: `"${this.data.translation}" — ${this.data.surahName}:${this.data.verse}`,
        files: [file]
      });
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Share failed:', err);
        this.fallbackCopyText();
      }
    } finally {
      this.isGenerating = false;
    }
  }

  // ───────────── Canvas Rendering ─────────────

  private async renderCanvas(): Promise<HTMLCanvasElement> {
    const SIZE = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d')!;

    const style = this.currentStyle;

    // 1. Background gradient
    const grad = ctx.createLinearGradient(0, 0, SIZE * 0.5, SIZE);
    grad.addColorStop(0, style.colors[0]);
    grad.addColorStop(1, style.colors[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // 2. Subtle geometric overlay pattern
    this.drawOverlayPattern(ctx, SIZE);

    // 3. Top branding
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '600 28px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Nura AI', SIZE / 2, 40);

    // 4. Arabic text (RTL)
    const arabicY = this.drawArabicText(ctx, SIZE);

    // 5. Decorative divider
    const dividerY = arabicY + 30;
    this.drawDivider(ctx, SIZE, dividerY);

    // 6. Translation text
    const translationY = dividerY + 50;
    const afterTranslationY = this.drawTranslation(ctx, SIZE, translationY);

    // 7. Tafsir excerpt
    let afterTafsirY = afterTranslationY;
    if (this.data.tafsirExcerpt) {
      afterTafsirY = this.drawTafsirExcerpt(ctx, SIZE, afterTranslationY + 20);
    }

    // 8. Footer
    this.drawFooter(ctx, SIZE);

    return canvas;
  }

  private drawOverlayPattern(ctx: CanvasRenderingContext2D, size: number): void {
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    const step = 60;
    for (let i = -size; i < size * 2; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + size, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + size, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawArabicText(ctx: CanvasRenderingContext2D, size: number): number {
    const padding = 80;
    const maxWidth = size - padding * 2;
    const arabicFonts = '"Traditional Arabic", "Arabic Typesetting", "Amiri", "Noto Naskh Arabic", serif';

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.direction = 'rtl';

    let fontSize = 52;
    ctx.font = `${fontSize}px ${arabicFonts}`;

    const lines = this.wrapText(ctx, this.data.arabicText, maxWidth);

    if (lines.length > 5) {
      fontSize = 40;
      ctx.font = `${fontSize}px ${arabicFonts}`;
    } else if (lines.length > 3) {
      fontSize = 46;
      ctx.font = `${fontSize}px ${arabicFonts}`;
    }

    const wrappedLines = this.wrapText(ctx, this.data.arabicText, maxWidth);
    const lineHeight = fontSize * 1.8;
    let startY = 110;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;

    for (const line of wrappedLines) {
      ctx.fillText(line, size / 2, startY);
      startY += lineHeight;
    }

    ctx.restore();
    return startY;
  }

  private drawDivider(ctx: CanvasRenderingContext2D, size: number, y: number): void {
    const cx = size / 2;
    const lineLen = 160;

    ctx.strokeStyle = 'rgba(183, 165, 122, 0.7)';
    ctx.lineWidth = 1.5;

    // Left line
    ctx.beginPath();
    ctx.moveTo(cx - lineLen - 20, y);
    ctx.lineTo(cx - 20, y);
    ctx.stroke();

    // Right line
    ctx.beginPath();
    ctx.moveTo(cx + 20, y);
    ctx.lineTo(cx + lineLen + 20, y);
    ctx.stroke();

    // Diamond
    ctx.save();
    ctx.fillStyle = 'rgba(183, 165, 122, 0.8)';
    ctx.translate(cx, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
  }

  private drawTranslation(ctx: CanvasRenderingContext2D, size: number, startY: number): number {
    const padding = 100;
    const maxWidth = size - padding * 2;
    const englishFonts = 'italic 30px Georgia, "Times New Roman", serif';

    ctx.fillStyle = 'rgba(235, 220, 185, 0.95)';
    ctx.font = englishFonts;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.direction = 'ltr';

    const text = `"${this.data.translation}"`;
    let lines = this.wrapText(ctx, text, maxWidth);

    if (lines.length > 6) {
      ctx.font = 'italic 24px Georgia, "Times New Roman", serif';
      lines = this.wrapText(ctx, text, maxWidth);
    }

    const lineHeight = 42;
    let y = startY;
    for (const line of lines) {
      ctx.fillText(line, size / 2, y);
      y += lineHeight;
    }
    return y;
  }

  private drawTafsirExcerpt(ctx: CanvasRenderingContext2D, size: number, startY: number): number {
    const padding = 120;
    const maxWidth = size - padding * 2;
    const excerpt = this.getTafsirExcerpt();
    if (!excerpt) return startY;

    // Label
    ctx.fillStyle = 'rgba(183, 165, 122, 0.85)';
    ctx.font = '600 20px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.direction = 'ltr';
    ctx.fillText('— Tafsir Insight —', size / 2, startY);

    // Text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '22px Georgia, "Times New Roman", serif';
    let lines = this.wrapText(ctx, excerpt, maxWidth);
    if (lines.length > 3) {
      lines = lines.slice(0, 3);
      const last = lines[2];
      lines[2] = last.substring(0, last.length - 3) + '...';
    }

    const lineHeight = 34;
    let y = startY + 36;
    for (const line of lines) {
      ctx.fillText(line, size / 2, y);
      y += lineHeight;
    }
    return y;
  }

  private drawFooter(ctx: CanvasRenderingContext2D, size: number): void {
    ctx.direction = 'ltr';
    ctx.textBaseline = 'bottom';

    // Verse reference (center)
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '600 26px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.data.surahName} · Verse ${this.data.verse}`, size / 2, size - 80);

    // Edition name
    ctx.fillStyle = 'rgba(183, 165, 122, 0.7)';
    ctx.font = '20px "Segoe UI", Roboto, sans-serif';
    ctx.fillText(this.data.editionName, size / 2, size - 52);

    // App URL bottom-right
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '18px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(this.siteUrl, size - 40, size - 24);
  }

  // ───────────── Helpers ─────────────

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  }

  private canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob returned null'));
        },
        'image/png',
        1.0
      );
    });
  }

  private fallbackCopyText(): void {
    const text = [
      this.data.arabicText,
      '',
      `"${this.data.translation}"`,
      '',
      `— ${this.data.surahName} · Verse ${this.data.verse}`,
      `(${this.data.editionName})`,
      '',
      this.siteUrl
    ].join('\n');

    navigator.clipboard.writeText(text).then(
      () => this.snackBar.open('Text copied to clipboard (image generation not supported in this browser)', 'OK', { duration: 4000 }),
      () => this.snackBar.open('Unable to copy. Please try again.', 'OK', { duration: 3000 })
    );
  }
}
