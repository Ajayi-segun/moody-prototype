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
import MailingListUnsubscribe from './components/MailingList/MailingListUnsubscribe.jsx'
import Footer from './components/Footer/Footer.jsx'
import AccountPage from './components/AccountPage/AccountPage.jsx'
import WorkoutLibrary from './components/WorkoutLibrary/WorkoutLibrary.jsx'
import ChatPage from './components/ChatPage/ChatPage.jsx'
import MembershipPage from './components/MembershipPage/MembershipPage.jsx'
import SpeechControls from './components/SpeechControls/SpeechControls.jsx'
import PremiumTraining from './components/PremiumTraining/PremiumTraining.jsx'
import { getCurrentMember, signOutMember } from './lib/account.js'
import './styles/global.css'
import './App.css'

function currentPagePath() {
  return window.location.pathname.replace(/\/+$/, '') || '/'
}

function readDisplayPreferences() {
  try {
    const savedPreferences = window.localStorage.getItem('toka-display-preferences')
    const preferences = savedPreferences ? JSON.parse(savedPreferences) : {}

    return {
      darkMode: preferences.darkMode === true,
      highContrast: preferences.highContrast === true,
      colorVariant: preferences.colorVariant === true,
      notice: '',
    }
  } catch {
    return {
      darkMode: false,
      highContrast: false,
      colorVariant: false,
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
        colorVariant: preferences.colorVariant,
      }),
    )
    return ''
  } catch {
    return 'Display settings could not be saved. They will work until you leave this page.'
  }
}

function App() {
  const [pagePath, setPagePath] = useState(currentPagePath)
  const [displayPreferences, setDisplayPreferences] = useState(readDisplayPreferences)
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(pagePath !== '/register')
  const [authNotice, setAuthNotice] = useState('')
  const [passwordRecovery, setPasswordRecovery] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery',
  )

  useEffect(() => {
    function handlePopState() {
      const nextPath = currentPagePath()
      setPagePath(nextPath)
      if (nextPath === '/register') setAuthLoading(false)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const header = document.querySelector('.site-header')
    if (!header) return undefined

    function updateHeaderHeight() {
      document.documentElement.style.setProperty(
        '--site-header-height',
        `${header.getBoundingClientRect().height}px`,
      )
    }

    updateHeaderHeight()
    const observer = new ResizeObserver(updateHeaderHeight)
    observer.observe(header)

    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty('--site-header-height')
    }
  }, [])


  useEffect(() => {
    let active = true

    async function connectAuth() {
      try {
        const member = await getCurrentMember()

        if (!active) return

        setUser(member)
        setAuthNotice('')
      } catch {
        if (!active) return

        setUser(null)
        setAuthNotice('')
      } finally {
        if (active) {
          setAuthLoading(false)
        }
      }
    }

    connectAuth()

    return () => {
      active = false
    }
  }, [])


  function handleInternalNavigation(event) {
    const link = event.target.closest?.('a[href]')
    if (
      !link
      || event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || link.target
      || link.hasAttribute('download')
    ) {
      return
    }

    const destination = new URL(link.href, window.location.href)
    if (destination.origin !== window.location.origin) return

    const isHashOnlyNavigation = (
      destination.pathname === window.location.pathname
      && destination.search === window.location.search
    )
    if (isHashOnlyNavigation) return

    event.preventDefault()
    window.history.pushState({}, '', destination)
    const nextPath = currentPagePath()
    setPagePath(nextPath)
    if (nextPath === '/register') setAuthLoading(false)

    if (destination.hash) {
      window.setTimeout(() => {
        document.getElementById(decodeURIComponent(destination.hash.slice(1)))?.scrollIntoView()
      }, 0)
    } else {
      window.scrollTo({ top: 0 })
    }
  }

  async function signOut() {
    try {
      await signOutMember()
      setUser(null)
      setAuthNotice('You are signed out.')
    } catch (error) {
      setAuthNotice(`Could not sign out: ${error.message}`)
    }
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
      case '/premium-training':
        return <PremiumTraining key={user?.id ?? 'guest'} user={user} />
      case '/membership':
        return (
          <MembershipPage key={user?.id ?? 'guest'} user={user} loading={authLoading} />
        )
      case '/chat':
        return <ChatPage user={user} />
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
      case '/unsubscribe':
        return <MailingListUnsubscribe />
      case '/sign-in':
      case '/register':
      case '/account':
        return (
          <AccountPage
            key={`${pagePath}-${passwordRecovery}`}
            initialMode={passwordRecovery
              ? 'reset-password'
              : pagePath === '/register' ? 'register' : 'sign-in'}
            user={user}
            onSignedIn={setUser}
            onPasswordUpdated={() => {
              setPasswordRecovery(false)
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
    <div
      className={`site-shell${displayPreferences.darkMode ? ' dark-mode' : ''}${displayPreferences.highContrast ? ' high-contrast' : ''}${displayPreferences.colorVariant ? ' color-variant' : ''}`}
      onClick={handleInternalNavigation}
    >
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Header
        darkMode={displayPreferences.darkMode}
        highContrast={displayPreferences.highContrast}
        colorVariant={displayPreferences.colorVariant}
        preferenceNotice={displayPreferences.notice}
        user={user}
        onSignOut={signOut}
        onDarkModeChange={() => changeDisplayPreference('darkMode')}
        onHighContrastChange={() => changeDisplayPreference('highContrast')}
        onColorVariantChange={() => changeDisplayPreference('colorVariant')}
      />
      <SpeechControls />
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
            <BmiCalculator />
          </article>
          <article className="tool-item">
            <h3>Member community</h3>
            <p>Connect with verified ToKa Fitness members using private messages.</p>
            <a href="/chat">Open member messages</a>
          </article>
          <article className="tool-item">
            <WorkoutTimer />
          </article>
          <article className="tool-item">
            <h3>Membership and payments</h3>
            <p>Compare free and Premium access, then pay securely through Stripe.</p>
            <a href="/membership">Compare memberships</a>
          </article>
        </div>
      </div>
    </section>
  )
}

function BmiCalculator() {
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [result, setResult] = useState(null)

  function calculateBmi(event) {
    event.preventDefault()
    const heightMetres = Number(height) / 100
    const weightKg = Number(weight)
    if (!heightMetres || !weightKg) return

    const bmi = weightKg / (heightMetres * heightMetres)
    const category = bmi < 18.5
      ? 'below the adult reference range'
      : bmi < 25
        ? 'within the adult reference range'
        : bmi < 30
          ? 'above the adult reference range'
          : 'well above the adult reference range'
    const guidance = bmi < 18.5
      ? 'Choose regular, varied meals with enough energy and nutrients. If you have concerns, ask a qualified professional for personal advice.'
      : bmi < 25
        ? 'For general wellbeing, choose varied meals with vegetables, wholegrains, protein and healthy fats.'
        : 'A varied meal pattern with vegetables, wholegrains, protein and healthy fats can support general wellbeing. Avoid restrictive plans and seek personal advice if needed.'

    setResult({ value: bmi.toFixed(1), category, guidance })
  }

  return (
    <div className="bmi-calculator">
      <h3>BMI guidance</h3>
      <p>Check an adult BMI estimate and see general, non-medical food guidance.</p>
      <form onSubmit={calculateBmi}>
        <label>
          Height (cm)
          <input
            type="number"
            min="100"
            max="250"
            step="0.1"
            value={height}
            onChange={(event) => setHeight(event.target.value)}
            required
          />
        </label>
        <label>
          Weight (kg)
          <input
            type="number"
            min="25"
            max="350"
            step="0.1"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            required
          />
        </label>
        <button type="submit">Calculate BMI</button>
      </form>
      {result && (
        <p className="bmi-result" role="status">
          BMI {result.value}: {result.category}. {result.guidance} This tool is for adults and does
          not store your measurements.
        </p>
      )}
      <p className="bmi-disclaimer">BMI is a broad screening measure, not a diagnosis or a measure of individual health.</p>
    </div>
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
          <p>Contact ToKa Fitness for the current class timetable and reservations. Online class booking is not available yet.</p>
        </details>
        <details className="faq-item">
          <summary>Does the mailing list send my email anywhere?</summary>
          <p>Only when you choose to join and give consent. Your address is stored securely for email updates, and every welcome email includes an unsubscribe link.</p>
        </details>
        <details className="faq-item">
          <summary>How can I listen to a page?</summary>
          <p>Use the read-aloud controls above the page to play, pause, rewind five words, choose a voice, and adjust reading speed. You can also enable click-to-read.</p>
        </details>
        <details className="faq-item">
          <summary>Can I adjust the page colours?</summary>
          <p>Use Dark mode, High contrast, and Warm reading colours in the header. The settings can be combined.</p>
        </details>
      </div>
    </section>
  )
}

export default App
