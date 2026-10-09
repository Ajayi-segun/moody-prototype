/*
 * This component renders the brand and primary page navigation.
 * It keeps the main destinations visible and keyboard-accessible.
 */
import './Header.css'

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/mission', label: 'Our Mission' },
  { href: '/training', label: 'Training' },
  { href: '/membership', label: 'Membership' },
  { href: '/contact', label: 'Contact' },
]

function Header({
  darkMode,
  highContrast,
  preferenceNotice,
  user,
  authNotice,
  onSignOut,
  onRetryAuth,
  onDarkModeChange,
  onHighContrastChange,
}) {
  const currentPath = typeof window === 'undefined'
    ? '/'
    : window.location.pathname.replace(/\/+$/, '') || '/'

  return (
    <header className="site-header" id="home">
      <a className="brand" href="/" aria-label="ToKa Fitness home">
        <span className="brand-mark" aria-hidden="true">TK</span>
        <span className="brand-name">ToKa Fitness</span>
      </a>
      <nav className="main-nav" aria-label="Main navigation">
        {navItems.map(({ href, label }) => {
          const isCurrent = currentPath === href || (href === '/' && currentPath === '/home')
          return (
            <a
              key={href}
              href={href}
              aria-current={isCurrent ? 'page' : undefined}
              className={isCurrent ? 'main-nav-link active' : 'main-nav-link'}
            >
              {label}
            </a>
          )
        })}
      </nav>
      <div className="account-controls">
        {user ? (
          <>
            <a href="/account">My account</a>
            <button className="account-button" type="button" onClick={onSignOut}>Sign out</button>
          </>
        ) : (
          <>
            <a className="sign-in" href="/sign-in">Sign in</a>
            <a className="account-button" href="/register">Join us</a>
          </>
        )}
      </div>
      <div className="appearance-controls" aria-label="Display preferences">
        <button
          className="appearance-button"
          type="button"
          aria-pressed={darkMode}
          onClick={onDarkModeChange}
        >
          {darkMode ? 'Light mode' : 'Dark mode'}
        </button>
        <button
          className="appearance-button"
          type="button"
          aria-pressed={highContrast}
          onClick={onHighContrastChange}
        >
          {highContrast ? 'Standard contrast' : 'High contrast'}
        </button>
      </div>
      <p className="preference-feedback" role="status">{preferenceNotice}</p>
      {authNotice && (
        <div className="account-header-notice" role="status">
          <span>{authNotice}</span>
          <button type="button" onClick={onRetryAuth}>Try again</button>
        </div>
      )}
    </header>
  )
}

export default Header
