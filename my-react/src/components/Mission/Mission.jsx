/*
 * This component introduces the ToKa Fitness mission.
 * It explains the service's focus on practical and accessible wellbeing support.
 */
import './Mission.css'

function Mission({ showHeading = true }) {
  return (
    <div className="mission-copy">
      <p className="eyebrow">Your pace. Your people. Your next win.</p>
      {showHeading && <h2 id="mission-heading">Move in your own rhythm.</h2>}
      <p>No perfect routines. No pressure. Just good guidance, good people, and progress that fits real life.</p>
      <p>Explore practical training advice, try a workout, and find your own reason to show up today. Big goals welcome; one small step counts too.</p>
      <p>Read along, turn on text-to-speech, and make the page feel like yours. However you move, you belong here.</p>
    </div>
  )
}

export default Mission
