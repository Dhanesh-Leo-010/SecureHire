/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        page: '#F8FAFC', subtle: '#F1F5F9', line: '#E2E8F0', divider: '#EEF2F6',
        ink: '#0F172A', body: '#475569', muted: '#94A3B8',
        primary: { DEFAULT: '#4F46E5', hover: '#4338CA', soft: '#EEF2FF', 600: '#4F46E5', 700: '#4338CA' },
        ok: '#16A34A', warn: '#D97706', review: '#EA580C', risk: '#DC2626', info: '#2563EB', neutral: '#64748B',
        video: '#0F172A',
      },
      boxShadow: { card: '0 1px 3px rgba(15,23,42,0.06)', pop: '0 10px 30px rgba(15,23,42,0.12)' },
      borderRadius: { card: '12px' },
    },
  },
  safelist: ['text-ok', 'text-warn', 'text-review', 'text-risk', 'text-neutral', 'bg-ok', 'bg-warn', 'bg-review', 'bg-risk', 'bg-neutral', 'bg-info', 'text-info'],
  plugins: [],
};
