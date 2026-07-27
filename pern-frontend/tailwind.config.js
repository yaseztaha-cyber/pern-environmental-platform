/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
        arabic: ['IBM Plex Sans Arabic', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        primary: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6',
        teal: '#14b8a6',
        purple: '#8b5cf6',
        cyan: '#06b6d4',
        surface: {
          DEFAULT: 'rgba(255, 255, 255, 0.03)',
          hover: 'rgba(255, 255, 255, 0.06)',
          active: 'rgba(255, 255, 255, 0.09)',
        },
      },
      borderRadius: {
        '4xl': '24px',
        '5xl': '32px',
      },
      boxShadow: {
        'glow-sm': '0 0 12px rgba(16, 185, 129, 0.12)',
        'glow-md': '0 0 24px rgba(16, 185, 129, 0.18)',
        'glow-lg': '0 4px 40px rgba(16, 185, 129, 0.2)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.3)',
        'glass-lg': '0 16px 48px rgba(0, 0, 0, 0.4)',
        'inner-glow': 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in-up': 'fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-left': 'slideInLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-right': 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'bounce-in': 'bounceIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'float': 'float 30s ease-in-out infinite',
        'float-gentle': 'floatGentle 5s ease-in-out infinite',
        'shimmer': 'shimmer 2s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2.5s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
        'gradient': 'gradientShift 6s ease infinite',
        'slide-in-bottom': 'slideInBottom 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'notif-slide': 'notifSlide 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'page-enter': 'pageEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          from: { opacity: '0', transform: 'translateX(-16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(20px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        slideInBottom: {
          from: { opacity: '0', transform: 'translateY(30px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        bounceIn: {
          '0%': { opacity: '0', transform: 'scale(0.3)' },
          '50%': { opacity: '1', transform: 'scale(1.08)' },
          '70%': { transform: 'scale(0.96)' },
          '100%': { transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '25%': { transform: 'translate(30px, -40px) scale(1.08)' },
          '50%': { transform: 'translate(-20px, 30px) scale(0.96)' },
          '75%': { transform: 'translate(40px, 20px) scale(1.04)' },
        },
        floatGentle: {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '33%': { transform: 'translateY(-8px) rotate(1deg)' },
          '66%': { transform: 'translateY(4px) rotate(-1deg)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 12px rgba(16, 185, 129, 0.12)' },
          '50%': { boxShadow: '0 0 24px rgba(16, 185, 129, 0.25)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(16,185,129,0.2), 0 0 12px rgba(16,185,129,0.1)' },
          '50%': { boxShadow: '0 0 0 6px rgba(16,185,129,0), 0 0 24px rgba(16,185,129,0.2)' },
        },
        gradientShift: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        notifSlide: {
          from: { opacity: '0', transform: 'translateX(100%) scale(0.95)' },
          to: { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        pageEnter: {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.995)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      backdropBlur: {
        '3xl': '64px',
      },
      transitionDuration: {
        '250': '250ms',
        '350': '350ms',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'bounce': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
    },
  },
  plugins: [],
}
