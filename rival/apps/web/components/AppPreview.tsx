import styles from './AppPreview.module.css';

/**
 * The hero visual: a miniature of the real home screen.
 *
 * The numbers are the demo rivalry's — the same figures the app computes for
 * the seeded Muzz/Rahul pair — so the landing page shows the product as it
 * actually behaves rather than an idealised mock.
 */

export type PreviewVariant = 'home' | 'logging' | 'pr' | 'consistency' | 'battle';

const GYM_DAYS = { you: 18, rival: 21 };
const BENCH = { you: 32.5, rival: 35 };

function TabBar({ active }: { active: string }) {
  const tabs = [
    { key: 'home', icon: '🏠', label: 'Home' },
    { key: 'log', icon: '＋', label: 'Log' },
    { key: 'rivals', icon: '⚔️', label: 'Rivals' },
    { key: 'challenges', icon: '🏆', label: 'Battles' },
    { key: 'profile', icon: '👤', label: 'You' },
  ];
  return (
    <nav className={styles.tabBar} aria-hidden="true">
      {tabs.map((tab) => (
        <span key={tab.key} className={tab.key === active ? styles.tabActive : styles.tab}>
          <span className={styles.tabIcon}>{tab.icon}</span>
          {tab.label}
        </span>
      ))}
    </nav>
  );
}

function HomeScreen() {
  return (
    <>
      <div className={styles.greeting}>
        <span className={styles.greetingName}>Good morning, Muzz</span>
        <span className={styles.streak}>🔥 8 days</span>
      </div>

      <div className={styles.card}>
        <div className={styles.cardLabel}>⚔️ Your next battle</div>
        <div className={styles.versus}>
          <div className={styles.side}>
            <span className={styles.sideName}>You</span>
            <span className={styles.sideValue}>{GYM_DAYS.you}</span>
          </div>
          <span className={styles.swords}>⚔️</span>
          <div className={`${styles.side} ${styles.sideRight}`}>
            <span className={styles.sideName}>Rahul</span>
            <span className={`${styles.sideValue} ${styles.behind}`}>{GYM_DAYS.rival}</span>
          </div>
        </div>
        <p className={styles.gapLine}>
          You&rsquo;re <strong>{GYM_DAYS.rival - GYM_DAYS.you} gym days</strong> behind Rahul.
        </p>
        <button type="button" className={styles.cta} tabIndex={-1}>
          Catch up
        </button>
      </div>

      <div className={styles.card}>
        <div className={styles.cardLabel}>Recent PR battle · Dumbbell bench</div>
        <div className={styles.versus}>
          <div className={styles.side}>
            <span className={styles.sideName}>You</span>
            <span className={styles.sideValue}>
              {BENCH.you}
              <span className={styles.unit}>kg</span>
            </span>
          </div>
          <span className={styles.swords}>⚔️</span>
          <div className={`${styles.side} ${styles.sideRight}`}>
            <span className={styles.sideName}>Rahul</span>
            <span className={`${styles.sideValue} ${styles.behind}`}>
              {BENCH.rival}
              <span className={styles.unit}>kg</span>
            </span>
          </div>
        </div>
        <p className={styles.gapLine}>🔴 Rahul leads by {BENCH.rival - BENCH.you} kg</p>
        <button type="button" className={styles.cta} tabIndex={-1}>
          Take the lead
        </button>
      </div>

      <div className={styles.card}>
        <div className={styles.cardLabel}>Friend activity</div>
        <div className={styles.activity}>
          <span className={styles.activityRow}>
            <span className={styles.activityIcon}>🔥</span> Rahul hit a new Deadlift PR
          </span>
          <span className={styles.activityRow}>
            <span className={styles.activityIcon}>👑</span> Sameer took #1 in Bench Press
          </span>
          <span className={styles.activityRow}>
            <span className={styles.activityIcon}>⚔️</span> Rahul challenged you
          </span>
        </div>
      </div>

      <TabBar active="home" />
    </>
  );
}

function LoggingScreen() {
  const sets = [
    { n: 1, kg: 60, reps: 10 },
    { n: 2, kg: 70, reps: 8 },
    { n: 3, kg: 80, reps: 5 },
  ];
  return (
    <>
      <div className={styles.greeting}>
        <span className={styles.greetingName}>Push day</span>
        <span className={styles.streak}>00:42</span>
      </div>
      <div className={styles.card}>
        <div className={styles.cardLabel}>Bench Press</div>
        <div className={styles.activity}>
          {sets.map((set) => (
            <span key={set.n} className={styles.activityRow}>
              <span className={styles.sideName}>Set {set.n}</span>
              <strong style={{ color: 'var(--text-primary)', marginLeft: 'auto' }}>
                {set.kg} kg × {set.reps}
              </strong>
            </span>
          ))}
        </div>
        <button type="button" className={styles.ctaGhost} tabIndex={-1}>
          + Add set
        </button>
      </div>
      <div className={styles.card}>
        <div className={styles.cardLabel}>Incline Dumbbell Press</div>
        <span className={styles.activityRow}>
          <span className={styles.sideName}>Set 1</span>
          <strong style={{ color: 'var(--text-primary)', marginLeft: 'auto' }}>24 kg × 12</strong>
        </span>
        <button type="button" className={styles.ctaGhost} tabIndex={-1}>
          + Add set
        </button>
      </div>
      <div className={styles.card}>
        <button type="button" className={styles.cta} tabIndex={-1}>
          Finish workout
        </button>
      </div>
      <TabBar active="log" />
    </>
  );
}

function PrScreen() {
  return (
    <>
      <div style={{ textAlign: 'center', marginTop: 46 }}>
        <div style={{ fontSize: '2.4rem', marginBottom: 6 }}>🔥</div>
        <div
          className={styles.cardLabel}
          style={{ color: 'var(--flame-300)', fontSize: '0.7rem', letterSpacing: '0.24em' }}
        >
          New PR
        </div>
        <div className={styles.sideName} style={{ marginTop: 10 }}>
          Bench Press
        </div>
        <div className={styles.sideValue} style={{ fontSize: '3.4rem', margin: '4px 0' }}>
          95
          <span className={styles.unit} style={{ fontSize: '0.9rem' }}>
            kg
          </span>
        </div>
        <span className="pill pill-accent" style={{ fontSize: '0.6rem' }}>
          +5 kg
        </span>
        <p className={styles.gapLine} style={{ marginTop: 14, textAlign: 'center' }}>
          You just beat your previous best of 90 kg.
        </p>
        <div className={styles.card} style={{ marginTop: 16, textAlign: 'left' }}>
          <div className={styles.cardLabel}>Also unlocked</div>
          <span className={styles.activityRow}>
            <span className={styles.activityIcon}>👑</span> You passed Rahul&rsquo;s 95 kg
          </span>
          <span className={styles.activityRow}>
            <span className={styles.activityIcon}>🏆</span> #1 in your circle
          </span>
        </div>
        <button type="button" className={styles.cta} style={{ marginTop: 14 }} tabIndex={-1}>
          Share it
        </button>
      </div>
      <TabBar active="home" />
    </>
  );
}

function ConsistencyScreen() {
  const days = [true, true, false, true, false, true, false, true, true, true, false, true, true, true];
  return (
    <>
      <div className={styles.greeting}>
        <span className={styles.greetingName}>⚔️ Catch-up mode</span>
      </div>
      <div className={styles.card}>
        <div className={styles.cardLabel}>Rahul is 3 days ahead</div>
        <div className={styles.versus}>
          <div className={styles.side}>
            <span className={styles.sideName}>You</span>
            <span className={styles.sideValue}>{GYM_DAYS.you}</span>
          </div>
          <span className={styles.swords}>⚔️</span>
          <div className={`${styles.side} ${styles.sideRight}`}>
            <span className={styles.sideName}>Rahul</span>
            <span className={`${styles.sideValue} ${styles.behind}`}>{GYM_DAYS.rival}</span>
          </div>
        </div>
        <div className={styles.bars} aria-hidden="true">
          {days.map((on, index) => (
            <span
              key={index}
              className={`${styles.bar} ${on ? styles.barOn : ''}`}
              style={{ height: on ? `${60 + (index % 4) * 12}%` : '26%' }}
            />
          ))}
        </div>
        <p className={styles.gapLine}>Your next session closes the gap to 2.</p>
        <button type="button" className={styles.cta} tabIndex={-1}>
          Log workout
        </button>
      </div>
      <div className={styles.card}>
        <div className={styles.cardLabel}>Recovery</div>
        <p className={styles.gapLine} style={{ margin: 0 }}>
          Consistency matters, but recovery matters too. Rest days never break your streak.
        </p>
      </div>
      <TabBar active="rivals" />
    </>
  );
}

function BattleScreen() {
  const rows = [
    { name: 'Bench Press', you: 97.5, rival: 95 },
    { name: 'Squat', you: 110, rival: 105 },
    { name: 'Deadlift', you: 140, rival: 150 },
  ];
  return (
    <>
      <div className={styles.greeting}>
        <span className={styles.greetingName}>⚔️ Muzz vs Rahul</span>
        <span className={styles.streak}>9–7</span>
      </div>
      <div className={styles.card}>
        <div className={styles.cardLabel}>Strength</div>
        <div className={styles.activity}>
          {rows.map((row) => {
            const youLead = row.you > row.rival;
            return (
              <span key={row.name} className={styles.activityRow}>
                <span className={styles.sideName} style={{ minWidth: 68 }}>
                  {row.name}
                </span>
                <strong className={youLead ? styles.ahead : styles.behind} style={{ marginLeft: 'auto' }}>
                  {row.you} kg
                </strong>
                <span style={{ color: 'var(--text-faint)' }}>vs</span>
                <span>{row.rival} kg</span>
              </span>
            );
          })}
        </div>
      </div>
      <div className={styles.card}>
        <div className={styles.cardLabel}>Deadlift battle · 18 days left</div>
        <div className="progress" style={{ marginTop: 4 }}>
          <span style={{ width: '88%' }} />
        </div>
        <p className={styles.gapLine}>Target 160 kg · you 140 kg · Rahul 150 kg</p>
        <button type="button" className={styles.cta} tabIndex={-1}>
          View challenge
        </button>
      </div>
      <TabBar active="challenges" />
    </>
  );
}

const SCREENS: Record<PreviewVariant, () => React.JSX.Element> = {
  home: HomeScreen,
  logging: LoggingScreen,
  pr: PrScreen,
  consistency: ConsistencyScreen,
  battle: BattleScreen,
};

const LABELS: Record<PreviewVariant, string> = {
  home: 'The RIVAL home screen: Muzz is three gym days behind Rahul and 2.5 kg behind on dumbbell bench press.',
  logging: 'Logging a push session in RIVAL, set by set.',
  pr: 'A new bench press personal record of 95 kg, five kilograms above the previous best.',
  consistency: 'Catch-up mode, showing an 18 to 21 gym-day gap and the next chance to close it.',
  battle: 'The Muzz versus Rahul rivalry screen with a live deadlift challenge.',
};

export function AppPreview({ variant = 'home' }: { variant?: PreviewVariant }) {
  const Screen = SCREENS[variant];
  return (
    <div className={styles.phone} role="img" aria-label={LABELS[variant]}>
      <div className={styles.notch} />
      <div className={styles.screen}>
        <Screen />
      </div>
    </div>
  );
}
