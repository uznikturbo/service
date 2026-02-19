import { useState } from 'react'
import { problemsApi } from '../api'
import { useToast } from '../context/ToastContext'
import { Modal, Spinner } from './ui'

interface CreateProblemModalProps {
  onClose: () => void
  onCreated: () => void
}

export function CreateProblemModal({ onClose, onCreated }: CreateProblemModalProps) {
  const [form, setForm] = useState({ title: '', description: '', image_url: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()

  const setField = (key: string, value: string) =>
    setForm(f => ({ ...f, [key]: value }))

  const submit = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      setError("Заповніть обов'язкові поля")
      return
    }
    setLoading(true)
    setError('')
    try {
      await problemsApi.create({
        title: form.title,
        description: form.description,
        image_url: form.image_url || undefined,
      })
      toast('Заявку подано', 'success')
      onCreated()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="Нова заявка"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Скасувати</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading && <Spinner size={12} />}
            Подати заявку
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label">Тема заявки *</label>
        <input
          className="form-input"
          value={form.title}
          onChange={e => setField('title', e.target.value)}
          placeholder="Коротко опишіть проблему..."
        />
      </div>
      <div className="form-group">
        <label className="form-label">Опис проблеми *</label>
        <textarea
          className="form-textarea"
          style={{ minHeight: 120 }}
          value={form.description}
          onChange={e => setField('description', e.target.value)}
          placeholder="Детальний опис: що сталося, коли, за яких обставин..."
        />
      </div>
      <div className="form-group">
        <label className="form-label">URL зображення (необов'язково)</label>
        <input
          className="form-input"
          value={form.image_url}
          onChange={e => setField('image_url', e.target.value)}
          placeholder="https://..."
        />
      </div>
      {error && <div className="form-error">⚠ {error}</div>}
    </Modal>
  )
}
