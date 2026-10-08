/*
 * This component renders the small copyright line at the bottom of the page.
 * It closes the homepage with a clear ownership statement.
 */
import './Footer.css'

function Footer() {
  return (
    <footer className="site-footer">
      <p>© ToKa Fitness. All rights reserved.<br />
        <span className="copyright-notice">Strictly by segz</span>
      </p>
    </footer>
  )
}

export default Footer
