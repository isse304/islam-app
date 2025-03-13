import { Component } from '@angular/core';

@Component({
  selector: 'app-home',
  template: `
    <div class="min-h-screen bg-[#FAF3E0] dark:bg-gray-900 relative">
      <!-- Background Pattern -->
      <div class="absolute inset-0 opacity-10">
        <img src="/islamic-pattern-1.png" alt="" class="w-full h-full object-cover">
      </div>

      <!-- Content -->
      <div class="relative">
        <!-- Hero Section -->
        <div class="container mx-auto px-4 py-16">
          <div class="text-center mb-16">
            <h1 class="text-5xl font-bold text-gray-800 dark:text-white mb-6">
              Welcome to Nura
            </h1>
            <p class="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Your spiritual companion for Quran, Duas, and Islamic learning. Begin your journey of faith and knowledge.
            </p>
          </div>

          <!-- Feature Cards -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            <div class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg p-8 transform hover:scale-105 transition-transform duration-300">
              <div class="text-[#B7A57A] dark:text-[#9b8a65] mb-4">
                <i class="fas fa-book-open text-4xl"></i>
              </div>
              <h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-4">
                Quran Reader
              </h2>
              <p class="text-gray-600 dark:text-gray-300 mb-6">
                Read and listen to the Holy Quran with translations and tafsir. Track your progress and bookmark your favorite verses.
              </p>
              <a routerLink="/quran" 
                 class="inline-block px-6 py-3 bg-[#B7A57A] text-white rounded-lg hover:bg-[#9b8a65] transition-colors duration-300">
                Start Reading
              </a>
            </div>

            <div class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg p-8 transform hover:scale-105 transition-transform duration-300">
              <div class="text-[#B7A57A] dark:text-[#9b8a65] mb-4">
                <i class="fas fa-graduation-cap text-4xl"></i>
              </div>
              <h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-4">
                Learn Quran
              </h2>
              <p class="text-gray-600 dark:text-gray-300 mb-6">
                Interactive lessons to help you learn and understand the Quran. Track your progress and earn achievements.
              </p>
              <a routerLink="/learn" 
                 class="inline-block px-6 py-3 bg-[#B7A57A] text-white rounded-lg hover:bg-[#9b8a65] transition-colors duration-300">
                Start Learning
              </a>
            </div>

            <div class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg p-8 transform hover:scale-105 transition-transform duration-300">
              <div class="text-[#B7A57A] dark:text-[#9b8a65] mb-4">
                <i class="fas fa-hands-praying text-4xl"></i>
              </div>
              <h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-4">
                Daily Duas
              </h2>
              <p class="text-gray-600 dark:text-gray-300 mb-6">
                Collection of authentic duas for various occasions. Save your favorites and set reminders.
              </p>
              <a routerLink="/dua" 
                 class="inline-block px-6 py-3 bg-[#B7A57A] text-white rounded-lg hover:bg-[#9b8a65] transition-colors duration-300">
                View Duas
              </a>
            </div>
          </div>

          <!-- AI Features Section -->
          <div class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg p-8 mb-16">
            <h2 class="text-3xl font-bold text-gray-800 dark:text-white mb-8 text-center">
              Powered by AI
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div class="text-center">
                <i class="fas fa-robot text-3xl text-[#B7A57A] dark:text-[#9b8a65] mb-3"></i>
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Smart Tafsir</h3>
                <p class="text-gray-600 dark:text-gray-300">AI-powered explanations of Quranic verses</p>
              </div>
              <div class="text-center">
                <i class="fas fa-brain text-3xl text-[#B7A57A] dark:text-[#9b8a65] mb-3"></i>
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Personalized Learning</h3>
                <p class="text-gray-600 dark:text-gray-300">Adaptive learning paths based on your progress</p>
              </div>
              <div class="text-center">
                <i class="fas fa-comments text-3xl text-[#B7A57A] dark:text-[#9b8a65] mb-3"></i>
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Smart Dua Suggestions</h3>
                <p class="text-gray-600 dark:text-gray-300">Context-aware dua recommendations</p>
              </div>
              <div class="text-center">
                <i class="fas fa-chart-line text-3xl text-[#B7A57A] dark:text-[#9b8a65] mb-3"></i>
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Progress Analytics</h3>
                <p class="text-gray-600 dark:text-gray-300">AI-driven insights into your learning journey</p>
              </div>
            </div>
          </div>

          <!-- Additional Features Section -->
          <div class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg p-8 mb-16">
            <h2 class="text-3xl font-bold text-gray-800 dark:text-white mb-8 text-center">
              Why Choose Nura?
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div class="text-center">
                <i class="fas fa-mobile-alt text-3xl text-[#B7A57A] dark:text-[#9b8a65] mb-3"></i>
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Mobile Friendly</h3>
                <p class="text-gray-600 dark:text-gray-300">Access anywhere, anytime</p>
              </div>
              <div class="text-center">
                <i class="fas fa-bookmark text-3xl text-[#B7A57A] dark:text-[#9b8a65] mb-3"></i>
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Save Progress</h3>
                <p class="text-gray-600 dark:text-gray-300">Track your learning journey</p>
              </div>
              <div class="text-center">
                <i class="fas fa-volume-up text-3xl text-[#B7A57A] dark:text-[#9b8a65] mb-3"></i>
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Audio Recitations</h3>
                <p class="text-gray-600 dark:text-gray-300">Listen to professional reciters</p>
              </div>
              <div class="text-center">
                <i class="fas fa-translate text-3xl text-[#B7A57A] dark:text-[#9b8a65] mb-3"></i>
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Multiple Translations</h3>
                <p class="text-gray-600 dark:text-gray-300">Understand in your language</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <footer class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700">
          <div class="container mx-auto px-4 py-8">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div>
                <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-4">Nura</h3>
                <p class="text-gray-600 dark:text-gray-300">
                  Your spiritual companion for Quran, Duas, and Islamic learning.
                </p>
              </div>
              <div>
                <h4 class="text-lg font-semibold text-gray-800 dark:text-white mb-4">Quick Links</h4>
                <ul class="space-y-2">
                  <li><a routerLink="/quran" class="text-gray-600 dark:text-gray-300 hover:text-[#B7A57A] dark:hover:text-[#9b8a65]">Quran Reader</a></li>
                  <li><a routerLink="/learn" class="text-gray-600 dark:text-gray-300 hover:text-[#B7A57A] dark:hover:text-[#9b8a65]">Learn Quran</a></li>
                  <li><a routerLink="/dua" class="text-gray-600 dark:text-gray-300 hover:text-[#B7A57A] dark:hover:text-[#9b8a65]">Daily Duas</a></li>
                  <li><a routerLink="/profile" class="text-gray-600 dark:text-gray-300 hover:text-[#B7A57A] dark:hover:text-[#9b8a65]">My Profile</a></li>
                </ul>
              </div>
              <div>
                <h4 class="text-lg font-semibold text-gray-800 dark:text-white mb-4">Support</h4>
                <ul class="space-y-2">
                  <li><a routerLink="/contact" class="text-gray-600 dark:text-gray-300 hover:text-[#B7A57A] dark:hover:text-[#9b8a65]">Contact Us</a></li>
                </ul>
              </div>
              <div>
                <!-- <h4 class="text-lg font-semibold text-gray-800 dark:text-white mb-4">Connect</h4>
                <div class="flex space-x-4">
                  <a href="#" class="text-gray-600 dark:text-gray-300 hover:text-[#B7A57A] dark:hover:text-[#9b8a65]">
                    <i class="fab fa-facebook text-2xl"></i>
                  </a>
                  <a href="#" class="text-gray-600 dark:text-gray-300 hover:text-[#B7A57A] dark:hover:text-[#9b8a65]">
                    <i class="fab fa-twitter text-2xl"></i>
                  </a>
                  <a href="#" class="text-gray-600 dark:text-gray-300 hover:text-[#B7A57A] dark:hover:text-[#9b8a65]">
                    <i class="fab fa-instagram text-2xl"></i>
                  </a> -->
                <!-- </div> -->
              </div>
            </div>
            <div class="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700 text-center text-gray-600 dark:text-gray-300">
              <p>&copy; {{ currentYear }} Nura. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  `
})
export class HomeComponent {
  currentYear = new Date().getFullYear();
} 