import { forwardRef } from 'react'
import styles from './Input.module.css'

/**
 * Input — text field with optional leading/trailing slots.
 *
 * Props:
 *   label:       string
 *   hint:        string — helper text below the field
 *   error:       string — validation error (replaces hint)
 *   leading:     ReactNode — icon or text prefix inside the input
 *   trailing:    ReactNode — icon or text suffix inside the input
 *   size:        'sm' | 'md' | 'lg'
 */
const Input = forwardRef(function Input(
  {
    label,
    hint,
    error,
    leading,
    trailing,
    size = 'md',
    className = '',
    id,
    ...props
  },
  ref
) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className={`${styles.wrapper} ${className}`}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      <div
        className={[
          styles.inputWrapper,
          styles[`size-${size}`],
          error ? styles.hasError : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {leading && (
          <span className={styles.leading} aria-hidden="true">
            {leading}
          </span>
        )}
        <input
          id={inputId}
          ref={ref}
          className={styles.input}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          {...props}
        />
        {trailing && (
          <span className={styles.trailing} aria-hidden="true">
            {trailing}
          </span>
        )}
      </div>
      {error && (
        <span id={`${inputId}-error`} className={styles.error} role="alert">
          {error}
        </span>
      )}
      {!error && hint && (
        <span id={`${inputId}-hint`} className={styles.hint}>
          {hint}
        </span>
      )}
    </div>
  )
})

export default Input
