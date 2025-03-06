import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OpenAI } from 'openai';
import { environment } from '../environments/environment';

import { AppComponent } from './app.component';
import { HeaderComponent } from './components/header/header.component';
import { HomeComponent } from './components/home/home.component';
import { QuranReaderComponent } from './components/quran/quran-reader/quran-reader.component';
import { DuaComponent } from './components/dua/dua.component';
import { LoginComponent } from './components/auth/login/login.component';
import { LearnComponent } from './components/learn/learn.component';
import { AuthButtonsComponent } from './auth-buttons/auth-buttons.component';
import { DuaTafsirComponent } from './components/dua/dua-tafsir.component';
import { DuaInsightsComponent } from './components/dua-insights/dua-insights.component';
import { routes } from './app.routes';

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    HomeComponent,
    DuaComponent,
    LoginComponent,
    AuthButtonsComponent,
    DuaTafsirComponent,
    QuranReaderComponent,
    LearnComponent,
    DuaInsightsComponent
  ],
  imports: [
    BrowserModule,
    RouterModule.forRoot(routes),
    FormsModule,
    HttpClientModule,
    CommonModule,
    BrowserAnimationsModule,
    MatTooltipModule
  ],
  providers: [
    {
      provide: OpenAI,
      useValue: new OpenAI({
        apiKey: environment.openaiApiKey,
        dangerouslyAllowBrowser: true
      })
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
