/*
 * This component shares short member experiences and accessibility feedback.
 * The quotes show how ToKa supports people with different routines and needs.
 */
import './Testimonials.css'

const testimonials = [
  {
    quote: '“I can fit a class around work and still have energy for the rest of my day.”',
    name: 'Amara',
    detail: 'Busy professional',
    portrait: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=240&h=240&q=80',
    portraitDescription: 'Portrait of a woman smiling.',
  },
  {
    quote: '“Text-to-speech lets me read the training guidance in a way that works for me.”',
    name: 'Derek',
    detail: 'Member with sight loss',
    portrait: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&h=240&q=80',
    portraitDescription: 'Portrait of a man smiling.',
  },
  {
    quote: '“The free resources help me stay active while I am studying.”',
    name: 'Priya',
    detail: 'Student member',
    portrait: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&h=240&q=80',
    portraitDescription: 'Portrait of a woman smiling.',
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
