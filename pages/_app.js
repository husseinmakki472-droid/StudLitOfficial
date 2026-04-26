import { StudyProvider } from '../context/StudyContext';
import '../styles/globals.css';
import { useEffect, useState } from 'react';

export default function App({ Component, pageProps }) {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const saved = localStorage.getItem('sl-theme') || 'dark';
    setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('sl-theme', next);
    document.documentElement.setAttribute('data-theme', next);
  }

  return (
    <StudyProvider>
      <Component {...pageProps} theme={theme} toggleTheme={toggleTheme} />
    </StudyProvider>
  );
}
