/*
 * This component shares short member experiences and accessibility feedback.
 * The quotes show how ToKa supports people with different routines and needs.
 */
import amaraPortrait from '../../assets/amara.jpg'
import derekPortrait from '../../assets/derek.jpg'
import priyaPortrait from '../../assets/priya.jpg'
import './Testimonials.css'

const testimonials = [
  {
    quote: '“I can fit a class around work and still have energy for the rest of my day.”',
    name: 'Amara',
    detail: 'Busy professional',
    portrait: amaraPortrait,
    portraitDescription: 'Studio portrait of a woman looking toward the camera.',
  },
  {
    quote: '“Text-to-speech lets me read the training guidance in a way that works for me.”',
    name: 'Derek',
    detail: 'Member with sight loss',
    portrait: derekPortrait,
    portraitDescription: 'Portrait of a man smiling at the camera.',
  },
  {
    quote: '“The free resources help me stay active while I am studying.”',
    name: 'Priya',
    detail: 'Student member',
    portrait: priyaPortrait,
    portraitDescription: 'Portrait of a woman wearing a patterned top.',
  },
]

function Testimonials() { 
  return (
    <section className="testimonials-band" aria-labelledby="testimonials-heading">
      <div className="testimonials-content">
        <p className="eyebrow">Real people, real progress</p>
        <h2 id="testimonials-heading">Testimonials</h2>
        <div className="testimonial-list">
          {testimonials.map((testimonial) => (
            <article className="testimonial" key={testimonial.name}>
              <figure className="image-figure">
                <img
                  className="testimonial-photo"
                  src={testimonial.portrait}
                  alt={testimonial.portraitDescription}
                  loading="lazy"
                />
              </figure>
              <div className="testimonial-copy">
                <blockquote>{testimonial.quote}</blockquote>
                <p className="testimonial-name">{testimonial.name}</p>
                <p className="testimonial-detail">{testimonial.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Testimonials
