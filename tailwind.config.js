/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // dataviz chrome roles (light / dark pairs used via dark: variants)
        page: { light: '#f9f9f7', dark: '#0d0d0d' },
        card: { light: '#fcfcfb', dark: '#1a1a19' },
      },
    },
  },
  plugins: [],
};
