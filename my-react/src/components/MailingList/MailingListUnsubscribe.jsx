import { useState } from 'react'
import { apiRequest } from '../../lib/api.js'

function MailingListUnsubscribe() {
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const token = new URLSearchParams(window.location.search).get('token')

  async function handleUnsubscribe() {
    if (!token || isSubmitting || isComplete) return

    setIsSubmitting(true)
    setMessage('')
    try {
      const result = await apiRequest('/mailing-list/unsubscribe', {
        method: 'POST',
        body: { token },
      })
      setMessage(result.message)
      setIsComplete(true)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="standalone-page" aria-labelledby="unsubscribe-heading">
      <p className="eyebrow">Email preferences</p>
      <h1 id="unsubscribe-heading">Unsubscribe from email updates</h1>
      {isComplete ? (
        <p role="status">{message}</p>
      ) : (
        <>
          <p>
            {token
              ? 'Confirm below and we’ll stop sending ToKa Fitness mailing-list updates.'
              : 'This unsubscribe link is missing its token. Use the complete link from your email.'}
          </p>
          {token && (
            <button type="button" onClick={handleUnsubscribe} disabled={isSubmitting}>
              {isSubmitting ? 'Unsubscribing…' : 'Confirm unsubscribe'}
            </button>
          )}
          {message && <p role="alert">{message}</p>}
        </>
      )}
    </section>
  )
}

export default MailingListUnsubscribe
