/*
 * This component assembles the ToKa Fitness homepage in the order of the brief.
 * It gives visitors a clear introduction, member information, and contact options.
 */
import { useEffect, useState } from 'react'
import Header from './components/Header/Header.jsx'
import Mission from './components/Mission/Mission.jsx'
import Specials from './components/Specials/Specials.jsx'
import ArticleGrid from './components/ArticleGrid/ArticleGrid.jsx'
import Testimonials from './components/Testimonials/Testimonials.jsx'
import Locations from './components/Locations/Locations.jsx'
import MailingList from './components/MailingList/MailingList.jsx'
import Footer from './components/Footer/Footer.jsx'
import AccountPage from './components/AccountPage/AccountPage.jsx'
import WorkoutLibrary from './components/WorkoutLibrary/WorkoutLibrary.jsx'
import { apiRequest } from './lib/api.js'
import './styles/global.css'
import './App.css'

const pagePath = window.location.pathname.replace(/\/+$/, '') || '/'

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
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authNotice, setAuthNotice] = useState('')
  const [authCheck, setAuthCheck] = useState(0)

  useEffect(() => {
    let active = true
    apiRequest('/auth/me')
      .then(({ user: currentUser }) => {
        if (!active) return
        setUser(currentUser)
      })
      .catch((error) => {
        if (!active) return
        setAuthNotice(error.message)
      })
      .finally(() => {
        if (active) setAuthLoading(false)
      })

    return () => {
      active = false
    }
  }, [authCheck])

  async function signOut() {
    try {
      const result = await apiRequest('/auth/logout', { method: 'POST' })
      setUser(null)
      setAuthNotice(result.message)
    } catch (error) {
      setAuthNotice(`Could not sign out: ${error.message}`)
    }
  }

  function retryAuthConnection() {
    setAuthNotice('')
    setAuthLoading(true)
    setAuthCheck((current) => current + 1)
  }

  function changeDisplayPreference(preference) {
    const nextPreferences = {
      ...displayPreferences,
      [preference]: !displayPreferences[preference],
    }
    const notice = saveDisplayPreferences(nextPreferences)

    setDisplayPreferences({ ...nextPreferences, notice })
  }

  function renderPage() {
    switch (pagePath) {
      case '/':
      case '/home':
        return (
          <>
            <h1 className="visually-hidden">ToKa Fitness</h1>
            <section className="hero-panel" id="mission" aria-labelledby="mission-heading">
              <Mission />
              <Specials />
            </section>
            <ArticleGrid />
            <MemberTools />
            <Faq />
            <div className="lower-content">
              <Testimonials />
              <Locations />
            </div>
          </>
        )
      case '/mission':
        return (
          <section className="standalone-page mission-page" aria-labelledby="page-heading">
            <h1 id="page-heading">Our mission</h1>
            <Mission showHeading={false} />
            <Testimonials />
          </section>
        )
      case '/training':
        return <WorkoutLibrary />
      case '/membership':
        return (
          <section className="standalone-page" aria-labelledby="page-heading">
            <p className="eyebrow">Find your way to move</p>
            <h1 id="page-heading">Membership</h1>
            <p className="page-intro">
              Build a routine that fits your life with practical guidance, flexible training ideas and a supportive community.
            </p>
            <MemberTools />
            <Faq />
            <p><a href="/contact">Get in touch about visiting ToKa Fitness</a></p>
          </section>
        )
      case '/contact':
        return (
          <section className="standalone-page contact-page" aria-labelledby="page-heading">
            <p className="eyebrow">Come and find us</p>
            <h1 id="page-heading">Contact and locations</h1>
            <p className="page-intro">
              Plan a visit to ToKa Fitness Central. Our team is happy to help you find out more about the club.
            </p>
            <Locations />
          </section>
        )
      case '/sign-in':
      case '/register':
      case '/account':
        return (
          <AccountPage
            initialMode={pagePath === '/register' ? 'register' : 'sign-in'}
            user={user}
            onSignedIn={setUser}
            onPasswordUpdated={() => {
              setAuthNotice('Your password has been updated.')
            }}
            loading={authLoading}
            notice={authNotice}
            onSignOut={signOut}
          />
        )
      default:
        return (
          <section className="standalone-page not-found-page" aria-labelledby="page-heading">
            <p className="eyebrow">Page not found</p>
            <h1 id="page-heading">We can’t find that page</h1>
            <p>Try one of the main destinations or return to the home page.</p>
            <a href="/">Go to home</a>
          </section>
        )
    }
  }

  return (
    <div className={`site-shell${displayPreferences.darkMode ? ' dark-mode' : ''}${displayPreferences.highContrast ? ' high-contrast' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Header
        darkMode={displayPreferences.darkMode}
        highContrast={displayPreferences.highContrast}
        preferenceNotice={displayPreferences.notice}
        user={user}
        authNotice={authNotice}
        onRetryAuth={retryAuthConnection}
        onSignOut={signOut}
        onDarkModeChange={() => changeDisplayPreference('darkMode')}
        onHighContrastChange={() => changeDisplayPreference('highContrast')}
      />
      <main id="main-content">{renderPage()}</main>
      <MailingList />
      <Footer />
    </div>
  )
}

function MemberTools() {
  return (
    <section className="member-tools" id="membership" aria-labelledby="member-tools-heading">
      <div className="section-shell">
        <h2 id="member-tools-heading">Member tools</h2>
        <p className="member-tools-intro">
          Practical tools to help you build healthy routines, one session at a time.
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
            <WorkoutTimer />
          </article>
          <article className="tool-item">
            <h3>Membership and payments</h3>
            <p>Membership management and payments will be handled through a secure service.</p>
          </article>
        </div>
      </div>
    </section>
  )
}

function WorkoutTimer() {
  const [duration, setDuration] = useState(5)
  const [remainingSeconds, setRemainingSeconds] = useState(5 * 60)
  const [endTime, setEndTime] = useState(null)
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    if (endTime === null) return undefined

    function updateRemainingTime() {
      const nextRemaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
      setRemainingSeconds(nextRemaining)
      if (nextRemaining === 0) {
        setEndTime(null)
        setCompleted(true)
      }
    }

    updateRemainingTime()
    const intervalId = window.setInterval(updateRemainingTime, 250)
    return () => window.clearInterval(intervalId)
  }, [endTime])

  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  const isRunning = endTime !== null

  function chooseDuration(nextDuration) {
    if (isRunning) return
    setDuration(nextDuration)
    setRemainingSeconds(nextDuration * 60)
    setCompleted(false)
  }

  function toggleTimer() {
    if (isRunning) {
      setRemainingSeconds(Math.max(0, Math.ceil((endTime - Date.now()) / 1000)))
      setEndTime(null)
      return
    }
    if (remainingSeconds === 0) {
      setRemainingSeconds(duration * 60)
      setCompleted(false)
      setEndTime(Date.now() + duration * 60 * 1000)
      return
    }
    setCompleted(false)
    setEndTime(Date.now() + remainingSeconds * 1000)
  }

  function resetTimer() {
    setEndTime(null)
    setRemainingSeconds(duration * 60)
    setCompleted(false)
  }

  return (
    <div className="workout-timer" aria-labelledby="workout-timer-heading">
      <h3 id="workout-timer-heading">Make It Count</h3>
      <p>Set a focused workout interval and make every minute count.</p>
      <div className="timer-display" role="timer" aria-label={`${minutes} minutes and ${seconds} seconds remaining`}>
        {formattedTime}
      </div>
      <div className="timer-presets" role="group" aria-label="Workout length">
        {[1, 5, 10, 20].map((preset) => (
          <button
            key={preset}
            type="button"
            className="timer-preset"
            aria-pressed={duration === preset}
            disabled={isRunning}
            onClick={() => chooseDuration(preset)}
          >
            {preset} min
          </button>
        ))}
      </div>
      <div className="timer-controls">
        <button className="timer-start" type="button" onClick={toggleTimer}>
          {isRunning ? 'Pause timer' : remainingSeconds === duration * 60 ? 'Start timer' : 'Resume timer'}
        </button>
        <button className="timer-reset" type="button" onClick={resetTimer} disabled={!isRunning && remainingSeconds === duration * 60}>
          Reset
        </button>
      </div>
      <p className="timer-status" role="status" aria-live="polite">
        {completed ? 'Interval complete. Great work — take a moment to recover.' : isRunning ? 'Timer running. You’ve got this.' : 'Ready when you are.'}
      </p>
    </div>
  )
}

function Faq() {
  return (
    <section className="faq-section" aria-labelledby="faq-heading">
      <div className="faq-content">
        <p className="eyebrow">Quick answers</p>
        <h2 id="faq-heading">Frequently asked questions</h2>
        <details className="faq-item">
          <summary>Can I book a class on this page?</summary>
          <p>This site is a static preview. Class booking will be added when the member service is available.</p>
        </details>
        <details className="faq-item">
          <summary>Does the mailing list send my email anywhere?</summary>
          <p>No. The mailing list is a visual mockup and does not send or store your email address.</p>
        </details>
        <details className="faq-item">
          <summary>How can I change the page colours?</summary>
          <p>Use the Dark mode and High contrast buttons in the header. Both settings can be used together.</p>
        </details>
      </div>
    </section>
  )
}

export default App
