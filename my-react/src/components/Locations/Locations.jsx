/*
 * This component displays the Central gym address and opening hours.
 * It helps visitors find the club and check when it is open.
 */
import { useEffect, useState } from 'react'
import './Locations.css'

const centralGymPhoto = 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80'

const OPENING_HOURS = [
  { opensAt: 8, closesAt: 18 },
  { opensAt: 5.5, closesAt: 22 },
  { opensAt: 5.5, closesAt: 22 },
  { opensAt: 5.5, closesAt: 22 },
  { opensAt: 5.5, closesAt: 22 },
  { opensAt: 5.5, closesAt: 22 },
  { opensAt: 7, closesAt: 20 },
]

function Locations() {
  const [currentTime, setCurrentTime] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const todayHours = OPENING_HOURS[currentTime.getDay()]
  const currentHour = currentTime.getHours() + currentTime.getMinutes() / 60
  const isOpen = currentHour >= todayHours.opensAt && currentHour < todayHours.closesAt

  return (
    <section className="locations-panel" id="locations" aria-labelledby="locations-heading">
      <div className="locations-copy">
        <p className="eyebrow">Come and find us</p>
        <h2 id="locations-heading">Locations</h2>
        <p className="location-live-status" aria-live="polite">
          <time dateTime={currentTime.toISOString()}>{currentTime.toLocaleString()}</time>
          <strong className={isOpen ? 'location-open' : 'location-closed'}>
            {isOpen ? 'Open now' : 'Closed now'}
          </strong>
        </p>
        <address className="location-address">
          <span>ToKa Fitness Central</span>
          <span>
            <span className="location-label">Address: </span>
            <br />
            <span className="location-pending">Awaiting further details</span>
          </span>
          <span>Monday–Friday: 05:30–22:00</span>
          <span>Saturday: 07:00–20:00</span>
          <span>Sunday: 08:00–18:00</span>
        </address>
      </div>
      <figure className="image-figure location-photo">
        <img
          className="image-content"
          src={centralGymPhoto}
          alt="A bright gym interior with strength-training equipment."
          loading="lazy"
        />
      </figure>
    </section>
  )
}

export default Locations
