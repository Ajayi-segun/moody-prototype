/*
 * This component displays the Central gym address and opening hours.
 * It helps visitors find the club and check when it is open.
 */
import centralGymPhoto from '../../assets/central-gym.jpg'
import './Locations.css'

function Locations() {
  return (
    <section className="locations-panel" id="locations" aria-labelledby="locations-heading">
      <div className="locations-copy">
        <p className="eyebrow">Come and find us</p>
        <h2 id="locations-heading">Locations</h2>
        <address className="location-address">
          <span>ToKa Fitness Central</span>
          <span>
            <span className="location-label">Address: </span>
            <br />
            <span className="location-pending">
              <a href="\">Awaiting further details</a>
              </span>
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
