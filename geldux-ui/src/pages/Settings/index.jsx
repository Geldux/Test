import { useState, useCallback, useEffect } from 'react'
import { User, Bell, Shield, Sliders, Globe, KeyRound, Gift, Zap } from 'lucide-react'
import { Card, CardTitle, CardDescription, Button, Input, Divider, Badge } from '@/components/ui'
import { useWallet } from '@/contexts/WalletContext'
import { useAppData } from '@/contexts/DataContext'
import { useToast } from '@/contexts/ToastContext'
import { regPts } from '@/services/web3/data'
import { sbCI, sbSU } from '@/services/api/supabase'
import styles from './Settings.module.css'

const SECTIONS = [
  { id: 'profile',       label: 'Profile',        icon: User    },
  { id: 'points',        label: 'Points',          icon: Gift    },
  { id: 'notifications', label: 'Notifications',  icon: Bell    },
  { id: 'security',      label: 'Security',        icon: Shield  },
  { id: 'trading',       label: 'Trading',         icon: Sliders },
  { id: 'preferences',   label: 'Preferences',     icon: Globe   },
  { id: 'api',           label: 'API Keys',        icon: KeyRound},
]

export default function Settings() {
  const { account }              = useWallet()
  const { pts, refresh }         = useAppData()
  const { showToast }            = useToast()

  /* ── Profile form state ─────────────────────────────────────────────── */
  const [username,   setUsername]   = useState('')
  const [isSavingProfile, setSavingProfile] = useState(false)

  /* ── Points / referral state ────────────────────────────────────────── */
  const [myCode,     setMyCode]     = useState('')

  /* Sync myCode once pts data loads (pts is null on first render) */
  useEffect(() => {
    if (pts?.code) setMyCode(pts.code)
  }, [pts?.code])
  const [refCode,    setRefCode]    = useState('')
  const [isCheckingIn,  setCheckingIn]  = useState(false)
  const [isRegistering, setRegistering] = useState(false)

  /* ── Save profile (username + referral code to Supabase) ────────────── */
  const handleSaveProfile = useCallback(async () => {
    if (!account || isSavingProfile) return
    setSavingProfile(true)
    try {
      await sbSU(username, refCode)
      showToast('Profile saved', 'success')
      setTimeout(refresh, 1500)
    } catch (e) {
      showToast(e.message || 'Save failed', 'error')
    } finally {
      setSavingProfile(false)
    }
  }, [account, username, refCode, isSavingProfile, refresh, showToast])

  /* ── Daily check-in ─────────────────────────────────────────────────── */
  const handleCheckIn = useCallback(async () => {
    if (!account || isCheckingIn) return
    setCheckingIn(true)
    try {
      const { streak, bonus } = await sbCI()
      showToast(`Check-in! +${bonus} pts · Streak: ${streak} days`, 'success')
      setTimeout(refresh, 1500)
    } catch (e) {
      showToast(e.message || 'Check-in failed', 'error')
    } finally {
      setCheckingIn(false)
    }
  }, [account, isCheckingIn, refresh, showToast])

  /* ── Register referral code on-chain ────────────────────────────────── */
  const handleRegister = useCallback(async () => {
    if (!account || !myCode || isRegistering) return
    setRegistering(true)
    try {
      const hash = await regPts(myCode, refCode)
      showToast(`Referral code registered · Tx: ${hash.slice(0, 10)}…`, 'success')
      setTimeout(refresh, 3000)
    } catch (e) {
      showToast(e.message || 'Registration failed', 'error')
    } finally {
      setRegistering(false)
    }
  }, [account, myCode, refCode, isRegistering, refresh, showToast])

  const ptsTotal  = pts?.pts    ?? '—'
  const streak    = pts?.streak ?? '—'
  const refCount  = pts?.refCount ?? '—'
  const onChainCode = pts?.code || null

  return (
    <div className={styles.page}>
      {/* Side nav */}
      <nav className={styles.sideNav} aria-label="Settings sections">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            className={`${styles.sideNavItem} ${id === 'profile' ? styles.activeSideNav : ''}`}
          >
            <Icon size={15} strokeWidth={1.75} />
            {label}
          </a>
        ))}
      </nav>

      <div className={styles.panels}>
        {/* Profile */}
        <Card id="profile">
          <div className={styles.sectionHeader}>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your public identity on Geldux.</CardDescription>
          </div>
          <Divider className={styles.divider} />
          <div className={styles.avatarRow}>
            <div className={styles.avatarLarge}>G</div>
            <div>
              <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', marginBottom: 'var(--space-1)' }}>Profile Photo</p>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-3)' }}>PNG, JPG up to 2MB</p>
              <Button variant="secondary" size="sm">Upload</Button>
            </div>
          </div>
          <div className={styles.formGrid}>
            <Input
              label="Display Name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Guest User"
              disabled={isSavingProfile}
            />
            <Input label="Email" type="email" defaultValue="guest@example.com" />
            <Input label="Time Zone" defaultValue="UTC+0" />
          </div>
          <div className={styles.formActions}>
            <Button
              variant="primary"
              onClick={handleSaveProfile}
              disabled={!account || isSavingProfile || !username}
            >
              {isSavingProfile ? 'Saving…' : 'Save Changes'}
            </Button>
            <Button variant="ghost" onClick={() => setUsername('')}>Cancel</Button>
          </div>
        </Card>

        {/* Points & Referral */}
        <Card id="points">
          <div className={styles.sectionHeader}>
            <CardTitle>Points &amp; Referral</CardTitle>
            <CardDescription>Earn points, check in daily, and refer friends.</CardDescription>
          </div>
          <Divider className={styles.divider} />

          {/* Stats row */}
          <div className={styles.ptsStats}>
            {[
              { label: 'Total Points', value: ptsTotal },
              { label: 'Day Streak',   value: streak   },
              { label: 'Referrals',    value: refCount  },
            ].map(({ label, value }) => (
              <div key={label} className={styles.ptsStat}>
                <span className={styles.ptsStatValue}>{value}</span>
                <span className={styles.ptsStatLabel}>{label}</span>
              </div>
            ))}
          </div>

          {/* Daily check-in */}
          <div className={styles.checkInRow}>
            <div>
              <p className={styles.toggleLabel}>Daily Check-In</p>
              <p className={styles.toggleDesc}>+50 pts base · Streak bonuses up to +2000 pts</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<Zap size={13} />}
              onClick={handleCheckIn}
              disabled={!account || isCheckingIn}
            >
              {isCheckingIn ? 'Checking in…' : 'Check In'}
            </Button>
          </div>

          <Divider className={styles.divider} />

          {/* On-chain referral code registration */}
          <p className={styles.toggleLabel} style={{ marginBottom: 'var(--space-3)' }}>
            Referral Code Registration
          </p>
          {onChainCode ? (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
              Your code: <strong className="mono">{onChainCode}</strong> · {refCount} referral{refCount !== 1 ? 's' : ''}
            </p>
          ) : (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-3)' }}>
              No code registered yet. Set yours below.
            </p>
          )}
          <div className={styles.formGrid}>
            <Input
              label="My Referral Code"
              value={myCode}
              onChange={(e) => setMyCode(e.target.value)}
              placeholder="e.g. GELDUX"
              disabled={isRegistering || !!onChainCode}
            />
            <Input
              label="Referred By (optional)"
              value={refCode}
              onChange={(e) => setRefCode(e.target.value)}
              placeholder="Friend's code"
              disabled={isRegistering}
            />
          </div>
          <div className={styles.formActions}>
            <Button
              variant="primary"
              onClick={handleRegister}
              disabled={!account || !myCode || isRegistering || !!onChainCode}
            >
              {isRegistering ? 'Registering…' : onChainCode ? 'Already Registered' : 'Register Code'}
            </Button>
          </div>
        </Card>

        {/* Notifications */}
        <Card id="notifications">
          <div className={styles.sectionHeader}>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Control what you hear about and how.</CardDescription>
          </div>
          <Divider className={styles.divider} />
          <div className={styles.toggleList}>
            {[
              { label: 'Order filled',      desc: 'Notify when a limit or market order is fully filled', enabled: true  },
              { label: 'Liquidation alert', desc: 'Warn when a position approaches liquidation price',    enabled: true  },
              { label: 'Price alerts',      desc: 'Notify when an asset crosses a configured threshold',  enabled: false },
              { label: 'News digest',       desc: 'Daily market summary email',                           enabled: false },
              { label: 'Login activity',    desc: 'Email on each new device sign-in',                     enabled: true  },
            ].map(({ label, desc, enabled }) => (
              <div key={label} className={styles.toggleRow}>
                <div className={styles.toggleInfo}>
                  <span className={styles.toggleLabel}>{label}</span>
                  <span className={styles.toggleDesc}>{desc}</span>
                </div>
                <button
                  className={`${styles.toggle} ${enabled ? styles.toggleOn : ''}`}
                  role="switch"
                  aria-checked={enabled}
                  aria-label={label}
                >
                  <span className={styles.toggleThumb} />
                </button>
              </div>
            ))}
          </div>
        </Card>

        {/* Security */}
        <Card id="security">
          <div className={styles.sectionHeader}>
            <CardTitle>Security</CardTitle>
            <CardDescription>Manage your password, 2FA, and sessions.</CardDescription>
          </div>
          <Divider className={styles.divider} />
          <div className={styles.securityList}>
            <div className={styles.securityRow}>
              <div>
                <p className={styles.toggleLabel}>Password</p>
                <p className={styles.toggleDesc}>Last changed 30 days ago</p>
              </div>
              <Button variant="secondary" size="sm">Change</Button>
            </div>
            <div className={styles.securityRow}>
              <div>
                <p className={styles.toggleLabel}>Two-Factor Authentication</p>
                <p className={styles.toggleDesc}>Authenticator app (TOTP)</p>
              </div>
              <Badge variant="success" dot>Enabled</Badge>
            </div>
            <div className={styles.securityRow}>
              <div>
                <p className={styles.toggleLabel}>Active Sessions</p>
                <p className={styles.toggleDesc}>1 device currently signed in</p>
              </div>
              <Button variant="danger" size="sm">Revoke All</Button>
            </div>
          </div>
        </Card>

        {/* API Keys */}
        <Card id="api">
          <div className={styles.sectionHeader}>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>Create keys for programmatic trading access.</CardDescription>
          </div>
          <Divider className={styles.divider} />
          <div className={styles.apiEmpty}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>No API keys yet.</p>
            <Button variant="secondary" size="sm" icon={<KeyRound size={14} />}>
              Create API Key
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
