/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#FDFCF8',
        foreground: '#2C2C24',
        primary: '#5D7052',
        'primary-foreground': '#F3F4F1',
        secondary: '#C18C5D',
        'secondary-foreground': '#FFFFFF',
        accent: '#E6DCCD',
        'accent-foreground': '#4A4A40',
        muted: '#F0EBE5',
        'muted-foreground': '#78786C',
        border: '#DED8CF',
        destructive: '#A85448',
        card: '#FEFEFA',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Nunito', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        organic: '0 12px 40px -8px rgba(93, 112, 82, 0.22), 0 4px 16px -4px rgba(193, 140, 93, 0.12)',
        'organic-sm': '0 6px 20px -6px rgba(93, 112, 82, 0.18)',
      },
    },
  },
  plugins: [],
};
