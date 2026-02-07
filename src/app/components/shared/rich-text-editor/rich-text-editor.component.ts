import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ViewChild, ElementRef, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';

/**
 * Simple rich text editor component
 * Uses contenteditable for basic formatting
 * Can be upgraded to Quill.js later for advanced features
 */
@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatDividerModule
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RichTextEditorComponent),
      multi: true
    }
  ],
  templateUrl: './rich-text-editor.component.html',
  styleUrls: ['./rich-text-editor.component.scss']
})
export class RichTextEditorComponent implements OnInit, OnDestroy, ControlValueAccessor {
  @ViewChild('editor', { static: false }) editorElement!: ElementRef<HTMLDivElement>;
  
  @Input() placeholder = 'Write your note here...';
  @Input() minHeight = '200px';
  @Output() contentChange = new EventEmitter<string>();
  @Output() blur = new EventEmitter<void>();

  private _value = '';
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  // Track current formatting state
  isBold = false;
  isItalic = false;
  isUnderline = false;
  isOrderedList = false;
  isUnorderedList = false;

  ngOnInit(): void {
    // Update formatting state on selection change
    document.addEventListener('selectionchange', this.updateFormattingState);
  }

  ngOnDestroy(): void {
    document.removeEventListener('selectionchange', this.updateFormattingState);
  }

  // ControlValueAccessor implementation
  writeValue(value: string): void {
    this._value = value || '';
    if (this.editorElement) {
      this.editorElement.nativeElement.innerHTML = this._value;
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  // Editor methods
  onInput(event: Event): void {
    const content = (event.target as HTMLDivElement).innerHTML;
    this._value = content;
    this.onChange(content);
    this.contentChange.emit(content);
  }

  onBlur(): void {
    this.onTouched();
    this.blur.emit();
  }

  onFocus(): void {
    // Ensure editor is focused
  }

  // Formatting commands
  execCommand(command: string, value: string | null = null): void {
    document.execCommand(command, false, value || undefined);
    this.editorElement.nativeElement.focus();
    this.updateFormattingState();
    
    // Emit updated content
    const content = this.editorElement.nativeElement.innerHTML;
    this._value = content;
    this.onChange(content);
    this.contentChange.emit(content);
  }

  bold(): void {
    this.execCommand('bold');
  }

  italic(): void {
    this.execCommand('italic');
  }

  underline(): void {
    this.execCommand('underline');
  }

  strikethrough(): void {
    this.execCommand('strikeThrough');
  }

  insertOrderedList(): void {
    this.execCommand('insertOrderedList');
  }

  insertUnorderedList(): void {
    this.execCommand('insertUnorderedList');
  }

  formatBlock(tag: string): void {
    this.execCommand('formatBlock', `<${tag}>`);
  }

  createLink(): void {
    const url = prompt('Enter URL:');
    if (url) {
      this.execCommand('createLink', url);
    }
  }

  insertHorizontalRule(): void {
    this.execCommand('insertHorizontalRule');
  }

  removeFormat(): void {
    this.execCommand('removeFormat');
  }

  undo(): void {
    this.execCommand('undo');
  }

  redo(): void {
    this.execCommand('redo');
  }

  // Get current formatting state
  private updateFormattingState = (): void => {
    try {
      this.isBold = document.queryCommandState('bold');
      this.isItalic = document.queryCommandState('italic');
      this.isUnderline = document.queryCommandState('underline');
      this.isOrderedList = document.queryCommandState('insertOrderedList');
      this.isUnorderedList = document.queryCommandState('insertUnorderedList');
    } catch (error) {
      // queryCommandState can throw errors in some browsers
    }
  };

  // Get content as plain text
  getPlainText(): string {
    if (!this.editorElement) return '';
    return this.editorElement.nativeElement.textContent || '';
  }

  // Get content as HTML
  getHTML(): string {
    return this._value;
  }

  // Set content
  setContent(html: string): void {
    this.writeValue(html);
    this.onChange(html);
  }

  // Clear content
  clear(): void {
    this.setContent('');
  }

  // Insert text at cursor
  insertText(text: string): void {
    this.execCommand('insertText', text);
  }

  // Get word count
  getWordCount(): number {
    const text = this.getPlainText();
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  // Get character count
  getCharCount(): number {
    return this.getPlainText().length;
  }
}
