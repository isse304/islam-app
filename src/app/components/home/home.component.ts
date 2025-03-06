import { Component } from '@angular/core';

@Component({
  selector: 'app-home',
  template: `
    <div class="min-h-screen bg-[#FAF3E0] dark:bg-gray-900 py-8">
      <div class="container mx-auto px-4">
        <div class="text-center mb-12">
          <h1 class="text-4xl font-bold text-gray-800 dark:text-white mb-4">
            Welcome to IslamApp
          </h1>
          <p class="text-lg text-gray-600 dark:text-gray-300">
            Your companion for Quran, Duas, and Islamic learning
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-4">
              Quran Reader
            </h2>
            <p class="text-gray-600 dark:text-gray-300 mb-4">
              Read and listen to the Holy Quran with translations and tafsir
            </p>
            <a routerLink="/quran" class="inline-block px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700">
              Start Reading
            </a>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-4">
              Learn Quran
            </h2>
            <p class="text-gray-600 dark:text-gray-300 mb-4">
              Interactive lessons to help you learn and understand the Quran
            </p>
            <a routerLink="/learn" class="inline-block px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700">
              Start Learning
            </a>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-4">
              Daily Duas
            </h2>
            <p class="text-gray-600 dark:text-gray-300 mb-4">
              Collection of authentic duas for various occasions
            </p>
            <a routerLink="/dua" class="inline-block px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700">
              View Duas
            </a>
          </div>
        </div>
      </div>
    </div>
  `
})
export class HomeComponent {} 