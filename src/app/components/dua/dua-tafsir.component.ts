// import { Component, Input } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { TafsirService } from '../../services/tafsir.service';
// import { SubscriptionService } from '../../services/subscription.service';
// import { Router, RouterModule } from '@angular/router';
// import { MatButtonModule } from '@angular/material/button';
// import { MatIconModule } from '@angular/material/icon';
// import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

// @Component({
//   selector: 'app-dua-tafsir',
//   template: `
//     <div class="bg-white rounded-xl shadow-lg p-6 mt-4">
//       <div *ngIf="!tafsir && !loading" class="text-center">
//         <button 
//           (click)="generateTafsir()"
//           class="px-6 py-3 bg-[#B7A57A] text-white rounded-lg hover:bg-[#9b8a65] transition-colors flex items-center justify-center gap-2">
//           <i class="fas fa-lock"></i>
//           Generate AI Tafsir
//         </button>
//       </div>

//       <div *ngIf="loading" class="flex justify-center py-4">
//         <div class="animate-spin rounded-full h-8 w-8 border-4 border-[#B7A57A] border-t-transparent"></div>
//       </div>

//       <!-- Premium Required Message -->
//       <div *ngIf="error?.includes('premium')" class="text-center py-6">
//         <div class="bg-[#B7A57A]/10 rounded-lg p-6">
//           <i class="fas fa-crown text-[#B7A57A] text-3xl mb-4"></i>
//           <h3 class="text-lg font-semibold text-gray-800 mb-2">Unlock AI Tafsir</h3>
//           <p class="text-gray-600 mb-4">Get detailed explanations and insights with our AI-powered Tafsir analysis.</p>
//           <button 
//             (click)="router.navigate(['/premium'], { 
//               queryParams: { 
//                 feature: 'AI Tafsir',
//                 returnUrl: router.url
//               }
//             })" 
//             class="bg-[#B7A57A] text-white px-6 py-2 rounded-full hover:bg-[#A69469] transition-colors">
//             Upgrade to Premium
//           </button>
//         </div>
//       </div>

//       <div *ngIf="tafsir" class="space-y-8" premiumRequired>
//         <!-- Detailed Explanation -->
//         <div>
//           <h3 class="text-xl font-semibold text-[#B7A57A] mb-3">Detailed Explanation</h3>
//           <p class="text-gray-700 leading-relaxed">{{tafsir.explanation}}</p>
//         </div>
        
//         <!-- Historical Context -->
//         <div>
//           <h3 class="text-xl font-semibold text-[#B7A57A] mb-3">Historical Context</h3>
//           <p class="text-gray-700 leading-relaxed">{{tafsir.context}}</p>
//         </div>

//         <!-- Modern Applications -->
//         <div>
//           <h3 class="text-xl font-semibold text-[#B7A57A] mb-3">Modern Applications</h3>
//           <ul class="list-disc list-inside text-gray-700 space-y-2">
//             <li *ngFor="let application of tafsir.modernApplications" 
//                 class="leading-relaxed pl-4">{{application}}</li>
//           </ul>
//         </div>

//         <!-- Related Hadith -->
//         <div *ngIf="tafsir.relatedHadith?.length">
//           <h3 class="text-xl font-semibold text-[#B7A57A] mb-3">Related Hadith</h3>
//           <div *ngFor="let hadith of tafsir.relatedHadith" 
//                class="mb-4 p-4 bg-gray-50 rounded-lg">
//             <p class="text-gray-700 italic mb-2">{{hadith.text}}</p>
//             <p class="text-sm text-gray-500">Source: {{hadith.source}}</p>
//           </div>
//         </div>

//         <!-- Special Notes -->
//         <div *ngIf="tafsir.specialNotes">
//           <h3 class="text-xl font-semibold text-[#B7A57A] mb-3">Special Notes</h3>
//           <p class="text-gray-700 leading-relaxed">{{tafsir.specialNotes}}</p>
//         </div>
//       </div>
//     </div>
//   `,
//   styles: [`
//     :host {
//       display: block;
//     }
//     .leading-relaxed {
//       line-height: 1.75;
//     }
//   `],
//   standalone: true,
//   imports: [
//     CommonModule,
//     RouterModule,
//     MatButtonModule,
//     MatIconModule,
//     MatProgressSpinnerModule
//   ]
// })
// export class DuaTafsirComponent {
//   @Input() arabic: string = '';
//   @Input() translation: string = '';
  
//   tafsir: any = null;
//   loading: boolean = false;
//   error: string = '';

//   constructor(
//     private tafsirService: TafsirService,
//     private subscriptionService: SubscriptionService,
//     public router: Router
//   ) {}

//   async generateTafsir() {
//     this.loading = true;
//     this.error = '';
    
//     try {
//       const response = await this.tafsirService.generateTafsir(this.arabic, this.translation).toPromise();
//       this.tafsir = response;
//     } catch (error) {
//       console.error('Error generating tafsir:', error);
//       this.error = 'Failed to generate tafsir. Please try again.';
//     } finally {
//       this.loading = false;
//     }
//   }
// } 