/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        pally: ['Pally', 'sans-serif'],
      },
      backgroundColor: {
        'cream': '#FAF6E7',
      },
      colors: {
        'call-bg': '#FAF6E7',
        'call-control': '#FFFFFF',
        'call-accent': '#002e2c',
        'teal-dark': '#002e2c',
      },
      animation: {
        'fadeIn': 'fadeIn 0.5s ease-in-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      transitionDelay: {
        '200': '200ms',
        '300': '300ms',
        '400': '400ms',
        '600': '600ms',
        '700': '700ms',
        '800': '800ms',
        '900': '900ms',
      },
    },
  },
  plugins: [require('@tailwindcss/line-clamp')],
}
