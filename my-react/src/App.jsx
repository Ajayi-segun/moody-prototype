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
import { supabase } from './lib/supabase.js'
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
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [authNotice, setAuthNotice] = useState('')
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      setUser(session?.user ?? null)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      if (event === 'USER_UPDATED' || event === 'SIGNED_OUT') setPasswordRecovery(false)
    })

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setAuthNotice(`Could not restore your sign-in: ${error.message}`)
        } else {
          setUser(data.session?.user ?? null)
        }
        setAuthLoading(false)
      })
      .catch((error) => {
        if (!active) return
        setAuthNotice(`Could not restore your sign-in: ${error.message || 'An unexpected error occurred.'}`)
        setAuthLoading(false)
      })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    setAuthNotice(error ? `Could not sign out: ${error.message}` : 'You are signed out.')
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
        return <ArticleGrid />
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
            passwordRecovery={passwordRecovery}
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
    <div className={`site-shell${displayPreferences.darkMode ? ' dark-mode' : ''}${displayPreferences.highContrast ? ' high-contrast' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Header
        darkMode={displayPreferences.darkMode}
        highContrast={displayPreferences.highContrast}
        preferenceNotice={displayPreferences.notice}
        user={user}
        authNotice={authNotice}
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
