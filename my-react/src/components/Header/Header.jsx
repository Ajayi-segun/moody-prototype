/*
 * This component renders the brand and primary page navigation.
 * It keeps the main destinations visible and keyboard-accessible.
 */
import './Header.css'

function Header({
  darkMode,
  highContrast,
  preferenceNotice,
  onDarkModeChange,
  onHighContrastChange,
}) {
  return (
    <header className="site-header" id="home">
      <a className="brand" href="#home" aria-label="ToKa Fitness home">
        <span className="brand-mark" aria-hidden="true">TK</span>
        <span className="brand-name">ToKa Fitness</span>
      </a>
      <nav className="main-nav" aria-label="Main navigation">
        <a href="#home">Home</a>
        <a href="#mission">Our Mission</a>
        <a href="#training">Training</a>
        <a href="#membership">Membership</a>
        <a href="#locations">Contact</a>
      </nav>
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
    </header>
  )
}

export default Header
