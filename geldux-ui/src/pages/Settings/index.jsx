import { User, Bell, Shield, Sliders, Globe, KeyRound } from 'lucide-react'
import { Card, CardTitle, CardDescription, Button, Input, Divider, Badge } from '@/components/ui'
import styles from './Settings.module.css'

const SECTIONS = [
  { id: 'profile',       label: 'Profile',        icon: User    },
  { id: 'notifications', label: 'Notifications',  icon: Bell    },
  { id: 'security',      label: 'Security',        icon: Shield  },
  { id: 'trading',       label: 'Trading',         icon: Sliders },
  { id: 'preferences',   label: 'Preferences',     icon: Globe   },
  { id: 'api',           label: 'API Keys',        icon: KeyRound},
]

export default function Settings() {
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
            <Input label="Display Name" defaultValue="Guest User" />
            <Input label="Email" type="email" defaultValue="guest@example.com" />
            <Input label="Username" defaultValue="@guest" leading={<span style={{ fontSize: 'var(--text-sm)' }}>@</span>} />
            <Input label="Time Zone" defaultValue="UTC+0" />
          </div>
          <div className={styles.formActions}>
            <Button variant="primary">Save Changes</Button>
            <Button variant="ghost">Cancel</Button>
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
