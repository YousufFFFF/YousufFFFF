import { AppPreview } from '@/components/AppPreview';
import styles from './page.module.css';

/**
 * The RIVAL landing page.
 *
 * One promise, stated plainly, then the product doing each part of it. Every
 * number shown is one the app really produces — the previews render the same
 * demo rivalry the seeded database contains.
 */

const STEPS = [
  {
    number: '01',
    title: 'Connect',
    body: 'Find the people you actually train with and send a request. Nothing is compared until you both accept.',
  },
  {
    number: '02',
    title: 'Train & track',
    body: 'Log every set, rep and kilogram. RIVAL spots your personal records for you — no separate step.',
  },
  {
    number: '03',
    title: 'Compete',
    body: 'Your PRs and gym days line up against theirs. Take a lead, lose one, take it back.',
  },
];

const PRIVACY = [
  {
    icon: '🔒',
    title: 'Nothing is compared until you both accept',
    body: 'A connection request on its own shows nobody anything. The rivalry starts when you both say yes.',
  },
  {
    icon: '👤',
    title: 'Your body is not a leaderboard',
    body: 'Bodyweight is private by default and stays that way unless you deliberately change it.',
  },
  {
    icon: '🎚️',
    title: 'Per-category controls',
    body: 'PRs, workout history, gym days, progress and your activity feed each have their own setting.',
  },
  {
    icon: '⏸️',
    title: 'Pause any time',
    body: 'Step out of every rivalry and leaderboard with one switch. Nothing is deleted, and you can step back in.',
  },
];

const FREE_FEATURES = [
  'Workout logging, sets, reps and weight',
  'Automatic PR detection',
  'Connections and rivalries',
  'Private leaderboards',
  'Up to 3 custom challenges at a time',
];

const PRO_FEATURES = [
  'Everything in Free',
  'Full PR history and progression charts',
  'Advanced rivalry analytics',
  'Unlimited custom challenges',
  'Detailed improvement analytics',
  'Custom rivalry settings',
];

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={`container ${styles.navInner}`}>
          <span className={styles.wordmark}>RIVAL</span>
          <nav className={styles.navLinks} aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#track">Tracking</a>
            <a href="#privacy">Privacy</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <a className="btn btn-primary" href="#pricing">
            Start for free
          </a>
        </div>
      </header>

      <main>
        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={`container ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <span className="eyebrow">Your friends · Your PRs · Your competition</span>
              <h1 className={`display ${styles.heroTitle}`}>
                Your friends are
                <br />
                getting stronger.
                <small>Are you?</small>
              </h1>
              <p className="lede">
                Track your workouts. Beat your PRs. Compete with the gym friends you actually train with — and
                nobody else.
              </p>
              <div className={styles.ctaRow}>
                <a className="btn btn-primary" href="#pricing">
                  Start for free
                </a>
                <a className="btn btn-secondary" href="#how">
                  See how it works
                </a>
              </div>
              <div className={styles.trustRow}>
                <span>🔒 Private by default</span>
                <span>⚔️ Connection-based only</span>
                <span>📵 No ads, no strangers</span>
              </div>
            </div>
            <div className={styles.heroVisual}>
              <AppPreview variant="home" />
            </div>
          </div>
        </section>

        {/* ── 1. YOUR GYM FRIENDS ──────────────────────────────────────── */}
        <section className={styles.section} id="how">
          <div className="container">
            <span className="eyebrow">Connection-based competition</span>
            <h2 className="headline" style={{ marginTop: 14, maxWidth: '18ch' }}>
              Your gym friends just became your rivals.
            </h2>
            <p className="lede" style={{ marginTop: 18 }}>
              RIVAL is not a feed of strangers. You compete with people you have both agreed to compete with — and
              the rivalry only exists once you have.
            </p>
            <div className={styles.steps}>
              {STEPS.map((step) => (
                <article key={step.number} className={`card ${styles.step}`}>
                  <span className={styles.stepNumber}>{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── 2. TRACK EVERY SET ───────────────────────────────────────── */}
        <section className={styles.section} id="track">
          <div className={`container ${styles.sectionGrid}`}>
            <div className={styles.sectionCopy}>
              <span className="eyebrow">Workout logging</span>
              <h2 className="headline">Track every set.</h2>
              <p className="lede">
                Weight, reps, RPE and notes, set by set. Kilograms or pounds — RIVAL stores one and converts the
                other, so you and a friend logging in different units still compare exactly.
              </p>
              <ul className={styles.bullets}>
                <li>
                  <span className={styles.bulletMark}>✓</span>
                  Push, pull, legs, upper, lower, full body or your own split
                </li>
                <li>
                  <span className={styles.bulletMark}>✓</span>
                  Forty exercises out of the box, plus your own
                </li>
                <li>
                  <span className={styles.bulletMark}>✓</span>
                  Fix a mistake later — your history stays honest
                </li>
              </ul>
            </div>
            <div className={styles.sectionVisual}>
              <AppPreview variant="logging" />
            </div>
          </div>
        </section>

        {/* ── 3. BREAK YOUR PR ─────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={`container ${styles.sectionGrid} ${styles.reverse}`}>
            <div className={styles.sectionVisual}>
              <AppPreview variant="pr" />
            </div>
            <div className={styles.sectionCopy}>
              <span className="eyebrow">Automatic PR detection</span>
              <h2 className="headline">Break your PR.</h2>
              <p className="lede">
                You do not mark a personal record. Log the set and RIVAL works it out — heaviest lift, most reps at a
                weight, biggest session volume, and an estimated one-rep max that is always labelled as an estimate.
              </p>
              <ul className={styles.bullets}>
                <li>
                  <span className={styles.bulletMark}>✓</span>
                  Four record types, so adding reps counts as progress too
                </li>
                <li>
                  <span className={styles.bulletMark}>✓</span>
                  Full history with the date and the percentage gain
                </li>
                <li>
                  <span className={styles.bulletMark}>✓</span>
                  A share card ready the moment you hit one
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── 4. DON'T FALL BEHIND ─────────────────────────────────────── */}
        <section className={styles.section}>
          <div className="container">
            <span className="eyebrow">Consistency</span>
            <h2 className="headline" style={{ marginTop: 14 }}>
              Don&rsquo;t fall behind.
            </h2>
            <div className={`card ${styles.gapCard}`} style={{ marginTop: 32 }}>
              <div className={styles.gapSide}>
                <div className={styles.gapName}>You</div>
                <div className={`stat-number ${styles.gapValue}`}>18</div>
                <div className={styles.gapName}>gym days</div>
              </div>
              <div className={styles.gapVersus}>vs</div>
              <div className={styles.gapSide}>
                <div className={styles.gapName}>Rahul</div>
                <div className={`stat-number ${styles.gapValue}`} style={{ color: 'var(--behind)' }}>
                  21
                </div>
                <div className={styles.gapName}>gym days</div>
              </div>
              <p className={styles.gapMessage}>
                You&rsquo;re <span className="accent-text">3 gym days</span> behind Rahul. Your next session makes it
                two.
              </p>
            </div>
            <div className={`container ${styles.sectionGrid}`} style={{ padding: 0, marginTop: 56 }}>
              <div className={styles.sectionCopy}>
                <p className="lede">
                  Attendance comes from what you actually logged, counted once a day — so nobody wins by logging the
                  same session twice.
                </p>
                <ul className={styles.bullets}>
                  <li>
                    <span className={styles.bulletMark}>✓</span>
                    Rest days are part of your plan, not a failure — a planned rest never breaks your streak
                  </li>
                  <li>
                    <span className={styles.bulletMark}>✓</span>
                    RIVAL never asks for a second session in one day to close a gap
                  </li>
                  <li>
                    <span className={styles.bulletMark}>✓</span>
                    Train too many days in a row and it says so, plainly and without a sales pitch
                  </li>
                </ul>
              </div>
              <div className={styles.sectionVisual}>
                <AppPreview variant="consistency" />
              </div>
            </div>
          </div>
        </section>

        {/* ── 5. CHALLENGE YOUR FRIENDS ────────────────────────────────── */}
        <section className={styles.section}>
          <div className={`container ${styles.sectionGrid} ${styles.reverse}`}>
            <div className={styles.sectionVisual}>
              <AppPreview variant="battle" />
            </div>
            <div className={styles.sectionCopy}>
              <span className="eyebrow">Challenges</span>
              <h2 className="headline">Challenge your friends.</h2>
              <p className="lede">
                Pick a rival, a lift, a target and a deadline. Progress is read from what you both log, so there is
                nothing to claim and nothing to argue about.
              </p>
              <ul className={styles.bullets}>
                <li>
                  <span className={styles.bulletMark}>✓</span>
                  Beat my PR · highest lift by a date · most workouts · volume war
                </li>
                <li>
                  <span className={styles.bulletMark}>✓</span>
                  Measured from the day you both accept, not from what you had banked
                </li>
                <li>
                  <span className={styles.bulletMark}>✓</span>
                  A most-improved board, so the newest lifter can still win something
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── 6. ONLY YOUR CONNECTIONS ─────────────────────────────────── */}
        <section className={styles.section} id="privacy">
          <div className="container">
            <span className="eyebrow">Privacy</span>
            <h2 className="headline" style={{ marginTop: 14, maxWidth: '20ch' }}>
              Only your connections. Nobody else.
            </h2>
            <p className="lede" style={{ marginTop: 18 }}>
              Competition is the point, but it is yours to control. Someone who is not connected to you sees your name
              and nothing else.
            </p>
            <div className={styles.privacyGrid}>
              {PRIVACY.map((item) => (
                <article key={item.title} className={`card ${styles.privacyItem}`}>
                  <span className={styles.privacyIcon} aria-hidden="true">
                    {item.icon}
                  </span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── 7. PRICING ───────────────────────────────────────────────── */}
        <section className={styles.section} id="pricing">
          <div className="container">
            <span className="eyebrow">Pricing</span>
            <h2 className="headline" style={{ marginTop: 14 }}>
              Free to compete.
            </h2>
            <p className="lede" style={{ marginTop: 18 }}>
              Everything that makes RIVAL work — logging, PRs, rivalries, leaderboards and challenges — is free. Pro
              adds the deeper analytics.
            </p>

            <div className={styles.pricing}>
              <article className={`card ${styles.plan}`}>
                <div>
                  <span className="pill">Free</span>
                  <div className={styles.planPrice} style={{ marginTop: 16 }}>
                    <span className={`stat-number ${styles.planAmount}`}>₹0</span>
                    <span className={styles.planPeriod}>forever</span>
                  </div>
                </div>
                <ul className={styles.planFeatures}>
                  {FREE_FEATURES.map((feature) => (
                    <li key={feature}>
                      <span className={styles.check}>✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <a className="btn btn-secondary" href="#join">
                  Start for free
                </a>
              </article>

              <article className={`card ${styles.planFeatured}`}>
                <div>
                  <span className="pill pill-accent">RIVAL PRO</span>
                  <div className={styles.planPrice} style={{ marginTop: 16 }}>
                    <span className={`stat-number ${styles.planAmount}`}>₹199</span>
                    <span className={styles.planPeriod}>per month</span>
                  </div>
                  <p className={styles.planNote}>or ₹1,499 a year · indicative pricing</p>
                </div>
                <ul className={styles.planFeatures}>
                  {PRO_FEATURES.map((feature) => (
                    <li key={feature}>
                      <span className={styles.check}>✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <a className="btn btn-primary" href="#join">
                  Go Pro
                </a>
              </article>
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ────────────────────────────────────────────────── */}
        <section className={styles.finalCta} id="join">
          <div className={`container ${styles.finalInner}`}>
            <h2 className="display" style={{ maxWidth: '14ch' }}>
              Stop training alone.
            </h2>
            <p className="lede" style={{ textAlign: 'center' }}>
              Start your rivalry.
            </p>
            <a className="btn btn-primary" href="/admin" style={{ minHeight: 56, paddingInline: 40 }}>
              Join RIVAL
            </a>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`container ${styles.footerInner}`}>
          <span>RIVAL — your friends, your PRs, your competition.</span>
          <nav className={styles.footerLinks} aria-label="Footer">
            <a href="#privacy">Privacy</a>
            <a href="#pricing">Pricing</a>
            <a href="/admin">Admin</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
