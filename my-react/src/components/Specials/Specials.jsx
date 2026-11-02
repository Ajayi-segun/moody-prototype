/*
 * This component highlights practical ways to get started with ToKa Fitness.
 * It connects the homepage with the training, accessibility, and member tools.
 */
import './Specials.css'

const workoutPhoto = 'https://images.unsplash.com/photo-1579758629938-03607ccdbaba?auto=format&fit=crop&w=800&q=80'

function Specials() {
  return (
    <aside className="monthly-updates" aria-labelledby="monthly-heading">
      <div className="update-copy">
        <p className="eyebrow">A good place to start</p>
        <h2 id="monthly-heading">Little steps. Big main-character energy.</h2>
        <ul>
          <li>Pick a beginner-friendly workout and start at your pace</li>
          <li>Listen to any page in the voice that feels right</li>
          <li>Find your crew and send a little encouragement</li>
          <li>Build a routine and keep track of every win with membership</li>
        </ul>
        <a className="updates-action" href="/training">Pick your first workout <span aria-hidden="true">↗</span></a>
      </div>
      <figure className="image-figure image-square">
        <img
          className="image-content"
          src={workoutPhoto}
          alt="A gym member doing a strength workout."
        />
      </figure>
    </aside>
  )
}

export default Specials
