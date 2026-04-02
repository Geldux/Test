import styles from './Table.module.css'

/**
 * Lightweight data table components.
 *
 * Usage:
 *   <Table>
 *     <TableHead>
 *       <TableRow>
 *         <TableCell header>Name</TableCell>
 *       </TableRow>
 *     </TableHead>
 *     <TableBody>
 *       <TableRow>
 *         <TableCell>BTC</TableCell>
 *       </TableRow>
 *     </TableBody>
 *   </Table>
 */
export function Table({ children, className = '' }) {
  return (
    <div className={`${styles.tableWrapper} ${className}`}>
      <table className={styles.table}>{children}</table>
    </div>
  )
}

export function TableHead({ children }) {
  return <thead className={styles.thead}>{children}</thead>
}

export function TableBody({ children }) {
  return <tbody className={styles.tbody}>{children}</tbody>
}

export function TableRow({ children, className = '', onClick }) {
  return (
    <tr
      className={`${styles.row} ${onClick ? styles.clickable : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </tr>
  )
}

export function TableCell({
  children,
  header = false,
  align = 'left',
  className = '',
}) {
  const Tag = header ? 'th' : 'td'
  return (
    <Tag
      className={[
        styles.cell,
        header ? styles.headerCell : styles.bodyCell,
        styles[`align-${align}`],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Tag>
  )
}
