import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Layout({ children, theme, toggleTheme }) {
  const router = useRouter();

  return (
    <div className="page-wrap">
      <header className="header">
        <Link href="/" className="header-logo">
          Stud<span>Lit</span>
        </Link>

        <nav className="header-nav">
          <Link href="/" className={router.pathname === '/' ? 'active' : ''}>Home</Link>
          <Link href="/upload" className={router.pathname === '/upload' ? 'active' : ''}>Study</Link>
        </nav>

        <div className="header-actions">
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <Link href="/upload" className="btn-primary" style={{ padding: '9px 20px', fontSize: 14 }}>
            Start Studying
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
