/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0f766e',
          50: '#effcf9',
          100: '#d8f5ef',
          200: '#b5e9df',
          300: '#82d5c7',
          400: '#4bb8a9',
          500: '#0f766e',
          600: '#0d6962',
          700: '#0f5753',
          800: '#104744',
          900: '#103b39',
        },
      },
    },
  },
  plugins: [],
}
