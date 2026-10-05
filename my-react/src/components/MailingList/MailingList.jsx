/*
 * This component invites visitors to receive ToKa Fitness updates by email.
 * Its demo form validates an address and confirms that nothing is submitted.
 */
import { useState } from 'react'
import './MailingList.css'

function MailingList() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    setMessage(`Thanks! ${email} is valid, but this demo does not send or store your address.`)
    setEmail('')
  }

  return (
    <section className="mailing-list" id="contact" aria-labelledby="mailing-heading">
      <div className="mailing-main">
        <h2 id="mailing-heading">Join our mailing list</h2>
        <form className="mailing-form" onSubmit={handleSubmit}>
          <label className="visually-hidden" htmlFor="mailing-email">Email address</label>
          <input
            id="mailing-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Your email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <button type="submit">Join</button>
        </form>
        <p className="mailing-feedback" aria-live="polite">{message}</p>
      </div>
      <div className="mailing-links">
        <nav className="footer-links" aria-label="Footer links">
          <a href="#mission">About ToKa Fitness</a>
          <a href="#membership">Membership information</a>
          <a href="#locations">Visit ToKa Fitness Central</a>
        </nav>
        <div className="social-links" aria-label="Social media">
          <a href="#contact" aria-label="Facebook">
            <svg viewBox="0 0 24 24" role="img" aria-label="Facebook icon"><path d="M13.5 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5h1.7V3.9c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3V10H7.3v3h2.8v8z" /></svg>
          </a>
          <a href="#contact" aria-label="Twitter or X">
            <svg viewBox="0 0 24 24" role="img" aria-label="Twitter or X icon"><path d="M18.9 3h2.8l-6.1 7 7.2 11h-5.6l-4.4-6.8L6.9 21H4.1l6.5-7.5L3.7 3h5.7l4 6.3zm-1 16h1.5L8.6 4.9H7z" /></svg>
          </a>
          <a href="#contact" aria-label="Instagram">
            <svg viewBox="0 0 24 24" role="img" aria-label="Instagram icon"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5m0 2.2A2.8 2.8 0 0 0 4.2 7v10A2.8 2.8 0 0 0 7 19.8h10a2.8 2.8 0 0 0 2.8-2.8V7A2.8 2.8 0 0 0 17 4.2zm10.5 1.6a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10m0 2.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6" /></svg>
          </a>
          <a href="#contact" aria-label="LinkedIn">
            <svg viewBox="0 0 24 24" role="img" aria-label="LinkedIn icon"><path d="M5.2 3a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4M3.3 9h3.8v12H3.3zm6.1 0H13v1.6h.1A4.1 4.1 0 0 1 16.8 8c4 0 4.7 2.6 4.7 6v7h-3.8v-6.2c0-1.5 0-3.4-2.1-3.4s-2.4 1.6-2.4 3.3V21H9.4z" /></svg>
          </a>
        </div>
      </div>
    </section>
  )
}

export default MailingList
