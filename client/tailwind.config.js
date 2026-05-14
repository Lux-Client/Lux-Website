/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#e27602',
        'primary-dark': '#b05900',
        surface: '#121212',
        background: '#080808',
        'accent-dark': '#0d0d0d',
      },
      fontFamily: {
        sans: ['Outfit', 'Poppins', 'sans-serif'],
      },
      boxShadow: {
        'primary-glow': '0 0 30px rgba(226, 118, 2, 0.3)',
        'primary-glow-lg': '0 0 60px rgba(226, 118, 2, 0.2)',
      },
      animation: {
        'spin-slow': 'spin 8s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        }
      }
    },
  },
  plugins: [],
}
