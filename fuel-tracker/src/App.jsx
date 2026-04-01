import { useState, useEffect } from 'react'

const STORAGE_KEY = 'fuel_entries'

function useEntries() {
  const [entries, setEntries] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] }
    catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  }, [entries])

  return [entries, setEntries]
}

function calcConsumption(entries, i) {
  if (i === 0) return null
  const km = entries[i].odometer - entries[i - 1].odometer
  if (km <= 0) return null
  return (entries[i].liters / km) * 100
}

function StatCard({ label, value, unit, color }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 text-center">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500">{unit}</p>
    </div>
  )
}

function AddForm({ onAdd }) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({ date: today, odometer: '', liters: '', price: '' })
  const [error, setError] = useState('')

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const odometer = parseFloat(form.odometer)
    const liters   = parseFloat(form.liters)
    const price    = parseFloat(form.price)

    if (!form.date)                       return flash('Please enter a date.')
    if (isNaN(odometer) || odometer <= 0) return flash('Please enter a valid odometer reading.')
    if (isNaN(liters)   || liters   <= 0) return flash('Please enter a valid liter amount.')
    if (isNaN(price)    || price    <= 0) return flash('Please enter a valid price per liter.')

    const ok = onAdd({ date: form.date, odometer, liters, price })
    if (ok === false) return flash('Odometer must be greater than the previous entry.')

    setForm({ date: today, odometer: '', liters: '', price: '' })
  }

  function flash(msg) {
    setError(msg)
    setTimeout(() => setError(''), 3000)
  }

  const fields = [
    { id: 'date',     label: 'Date',             type: 'date',   placeholder: '',           value: form.date },
    { id: 'odometer', label: 'Odometer (km)',     type: 'number', placeholder: 'e.g. 45320', value: form.odometer },
    { id: 'liters',   label: 'Liters',            type: 'number', placeholder: 'e.g. 42.5',  value: form.liters },
    { id: 'price',    label: 'Price per Liter',   type: 'number', placeholder: 'e.g. 1.85',  value: form.price },
  ]

  return (
    <div className="bg-gray-800 rounded-xl p-6 mb-8">
      <h2 className="text-lg font-semibold mb-4 text-white">Add Fill-up</h2>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-4">
          {fields.map(f => (
            <div key={f.id}>
              <label className="block text-xs text-gray-400 mb-1">{f.label}</label>
              <input
                type={f.type}
                step={f.type === 'number' ? '0.001' : undefined}
                placeholder={f.placeholder}
                value={f.value}
                onChange={set(f.id)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          ))}
        </div>
        {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
        <button
          type="submit"
          className="mt-4 w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors text-sm"
        >
          Add Fill-up
        </button>
      </form>
    </div>
  )
}

function LogRow({ entry, index, consumption, onDelete }) {
  const cost = entry.liters * entry.price
  const consColor =
    consumption === null ? 'text-gray-500'
    : consumption > 10   ? 'text-red-400'
    : consumption > 7    ? 'text-yellow-400'
    : 'text-green-400'

  return (
    <tr className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
      <td className="px-4 py-3 text-gray-300">{entry.date}</td>
      <td className="px-4 py-3 text-right text-gray-300">{entry.odometer.toLocaleString()}</td>
      <td className="px-4 py-3 text-right text-gray-300">{entry.liters.toFixed(2)}</td>
      <td className="px-4 py-3 text-right text-gray-300">{cost.toFixed(2)}</td>
      <td className={`px-4 py-3 text-right font-medium ${consColor}`}>
        {consumption === null ? '—' : consumption.toFixed(1)}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={() => onDelete(index)}
          className="text-gray-600 hover:text-red-400 transition-colors text-xs bg-transparent border-0 p-0"
        >
          ✕
        </button>
      </td>
    </tr>
  )
}

export default function App() {
  const [entries, setEntries] = useEntries()

  function handleAdd(entry) {
    if (entries.length && entry.odometer <= entries[entries.length - 1].odometer) {
      return false
    }
    setEntries(prev => [...prev, entry])
  }

  function handleDelete(index) {
    setEntries(prev => prev.filter((_, i) => i !== index))
  }

  function handleClearAll() {
    if (confirm('Delete all fill-up entries?')) setEntries([])
  }

  const consumptions = entries.map((_, i) => calcConsumption(entries, i)).filter(Boolean)
  const avg        = consumptions.length ? consumptions.reduce((a, b) => a + b, 0) / consumptions.length : null
  const totalSpent = entries.reduce((sum, e) => sum + e.liters * e.price, 0)
  const totalKm    = entries.length >= 2 ? entries[entries.length - 1].odometer - entries[0].odometer : null

  return (
    <div className="bg-gray-950 text-gray-100 min-h-screen font-sans">
      <div className="max-w-2xl mx-auto px-4 py-10">

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">Fuel Tracker</h1>
          <p className="text-gray-400 mt-1 text-sm">Log your fill-ups and track consumption</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatCard label="Avg Consumption" value={avg ? avg.toFixed(1) : '—'}                     unit="L/100km"   color="text-blue-400"   />
          <StatCard label="Total Spent"     value={entries.length ? totalSpent.toFixed(2) : '—'}   unit="currency"  color="text-green-400"  />
          <StatCard label="Total KM"        value={totalKm ? totalKm.toLocaleString() : '—'}       unit="kilometers" color="text-purple-400" />
        </div>

        <AddForm onAdd={handleAdd} />

        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">Fill-up Log</h2>
            {entries.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs text-red-400 hover:text-red-300 transition-colors bg-transparent border-0 p-0"
              >
                Clear all
              </button>
            )}
          </div>

          {entries.length === 0 ? (
            <p className="px-6 py-10 text-center text-gray-500 text-sm">
              No fill-ups yet. Add your first one above.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-700">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-right">Odometer</th>
                  <th className="px-4 py-3 text-right">Liters</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3 text-right">L/100km</th>
                  <th className="px-4 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <LogRow
                    key={i}
                    entry={entry}
                    index={i}
                    consumption={calcConsumption(entries, i)}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}
