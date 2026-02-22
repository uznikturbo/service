import { useState } from 'react'
import { adminApi } from '../api'
import { useToast } from '../context/ToastContext'
import { Modal, Spinner } from './ui'

// ============== SERVICE RECORD MODAL ==============
interface ServiceRecordModalProps {
  problemId: number
  userId: number
  onClose: () => void
  onDone: () => void
}

export function ServiceRecordModal({ userId, problemId, onClose, onDone }: ServiceRecordModalProps) {
  const [form, setForm] = useState({ work_done: '', warranty_info: '', used_parts: '' })
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  const setField = (key: string, value: string) =>
    setForm(f => ({ ...f, [key]: value }))

  const submit = async () => {
    if (!form.work_done.trim() || !form.warranty_info.trim()) return
    setLoading(true)
    try {
      const parts = form.used_parts
        ? form.used_parts.split(',').map(s => s.trim()).filter(Boolean)
        : undefined
      
      await adminApi.createServiceRecord({
        problem_id: problemId,
        user_id: userId,
        work_done: form.work_done,
        warranty_info: form.warranty_info,
        used_parts: parts,
      })
      
      toast('Сервісний запис додано', 'success')
      onDone() // Закриваємо модалку і кажемо ProblemDetail оновити дані
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Помилка', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="Сервісний запис"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Скасувати</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading && <Spinner size={12} />}
            Зберегти
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label">Виконані роботи *</label>
        <textarea
          className="form-textarea"
          value={form.work_done}
          onChange={e => setField('work_done', e.target.value)}
          placeholder="Опишіть що було зроблено..."
        />
      </div>
      <div className="form-group">
        <label className="form-label">Гарантійна інформація *</label>
        <textarea
          className="form-textarea"
          value={form.warranty_info}
          onChange={e => setField('warranty_info', e.target.value)}
          placeholder="Умови гарантії, термін..."
        />
      </div>
      <div className="form-group">
        <label className="form-label">Використані запчастини (через кому)</label>
        <input
          className="form-input"
          value={form.used_parts}
          onChange={e => setField('used_parts', e.target.value)}
          placeholder="Процесор, RAM, SSD..."
        />
      </div>
    </Modal>
  )
}