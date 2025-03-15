/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts,scss,css}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  important: true,
  postcss: {
    plugins: {
      '@tailwindcss/postcss': {},
      'autoprefixer': {}
    }
  }
}; 