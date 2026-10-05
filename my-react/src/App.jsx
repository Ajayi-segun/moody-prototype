/*
 * This component assembles the ToKa Fitness homepage in the order of the brief.
 * It gives visitors a clear introduction, member information, and contact options.
 */
import { useState } from 'react'
import Header from './components/Header/Header.jsx'
import Mission from './components/Mission/Mission.jsx'
import Specials from './components/Specials/Specials.jsx'
import ArticleGrid from './components/ArticleGrid/ArticleGrid.jsx'
import Testimonials from './components/Testimonials/Testimonials.jsx'
import Locations from './components/Locations/Locations.jsx'
import MailingList from './components/MailingList/MailingList.jsx'
import Footer from './components/Footer/Footer.jsx'
import './styles/global.css'
import './App.css'

function readDisplayPreferences() {
  try {
    const savedPreferences = window.localStorage.getItem('toka-display-preferences')
    const preferences = savedPreferences ? JSON.parse(savedPreferences) : {}

    return {
      darkMode: preferences.darkMode === true,
      highContrast: preferences.highContrast === true,
      notice: '',
    }
  } catch {
    return {
      darkMode: false,
      highContrast: false,
      notice: 'Saved display preferences could not be read. You can still change them for this visit.',
    }
  }
}

function saveDisplayPreferences(preferences) {
  try {
    window.localStorage.setItem(
      'toka-display-preferences',
      JSON.stringify({
        darkMode: preferences.darkMode,
        highContrast: preferences.highContrast,
      }),
    )
    return ''
  } catch {
    return 'Display settings could not be saved. They will work until you leave this page.'
  }
}

function App() {
  const [displayPreferences, setDisplayPreferences] = useState(readDisplayPreferences)

  function changeDisplayPreference(preference) {
    const nextPreferences = {
      ...displayPreferences,
      [preference]: !displayPreferences[preference],
    }
    const notice = saveDisplayPreferences(nextPreferences)

    setDisplayPreferences({ ...nextPreferences, notice })
  }

  return (
    <div className={`site-shell${displayPreferences.darkMode ? ' dark-mode' : ''}${displayPreferences.highContrast ? ' high-contrast' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Header
        darkMode={displayPreferences.darkMode}
        highContrast={displayPreferences.highContrast}
        preferenceNotice={displayPreferences.notice}
        onDarkModeChange={() => changeDisplayPreference('darkMode')}
        onHighContrastChange={() => changeDisplayPreference('highContrast')}
      />
      <main id="main-content">
        <h1 className="visually-hidden">ToKa Fitness</h1>
        <section className="hero-panel" id="mission" aria-labelledby="mission-heading">
          <Mission />
          <Specials />
        </section>
        <ArticleGrid />
        <section className="member-tools" id="membership" aria-labelledby="member-tools-heading">
          <div className="section-shell">
            <h2 id="member-tools-heading">Member tools</h2>
            <p className="member-tools-intro">
              These planned digital features are part of our commitment to making healthy routines easier to manage.
            </p>
            <div className="tools-grid">
              <article className="tool-item">
                <h3>Class booking</h3>
                <p>Class reservations will be available when the member booking service is ready.</p>
              </article>
              <article className="tool-item">
                <h3>BMI guidance</h3>
                <p>A future wellbeing tool will offer general guidance alongside professional advice.</p>
              </article>
              <article className="tool-item">
                <h3>Workout timer</h3>
                <p>A simple training timer is planned as a member feature.</p>
              </article>
              <article className="tool-item">
                <h3>Membership and payments</h3>
                <p>Membership management and payments will be handled through a secure service.</p>
              </article>
            </div>
          </div>
        </section>
        <section className="faq-section" aria-labelledby="faq-heading">
          <div className="faq-content">
            <p className="eyebrow">Quick answers</p>
            <h2 id="faq-heading">Frequently asked questions</h2>
            <details className="faq-item">
              <summary>Can I book a class on this page?</summary>
              <p>This homepage is a static preview. Class booking will be added when the member service is available.</p>
            </details>
            <details className="faq-item">
              <summary>Does the mailing list send my email anywhere?</summary>
              <p>No. The mailing list is a visual mockup and does not send or store your email address.</p>
            </details>
            <details className="faq-item">
              <summary>How can I change the page colours?</summary>
              <p>Use the Dark mode and High contrast checkboxes in the header. Both settings can be used together.</p>
            </details>
          </div>
        </section>
        <div className="lower-content">
          <Testimonials />
          <Locations />
        </div>
      </main>
      <MailingList />
      <Footer />
    </div>
  )
}

export default App
