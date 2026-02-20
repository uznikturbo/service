import { useState } from 'react'
import { adminApi, problemsApi } from '../api'
import { useToast } from '../context/ToastContext'
import { Modal, Spinner } from './ui'
import { Problem } from '../types' // Виправив шлях імпорту на відносний, як у решті твоїх файлів

// ============== ADMIN RESPONSE MODAL ==============
interface AdminResponseModalProps {
  problemId: number
  onClose: () => void
  onDone: (data: Problem) => void // Очікує дані типу Problem
}

export function AdminResponseModal({ problemId, onClose, onDone }: AdminResponseModalProps) {
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  const submit = async () => {
    if (!msg.trim()) return
    setLoading(true)
    try {
      // Зберігаємо результат запиту в змінну data
      await adminApi.respond(problemId, msg)
      const data = await problemsApi.get(problemId)
      toast('Відповідь надіслана', 'success')
      onDone(data) // Передаємо оновлену заявку в батьківський компонент
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Помилка', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="Відповідь адміністратора"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Скасувати</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading || !msg.trim()}>
            {loading && <Spinner size={12} />}
            Надіслати
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label">Повідомлення</label>
        <textarea
          className="form-textarea"
          style={{ minHeight: 140 }}
          value={msg}
          onChange={e => setMsg(e.target.value)}
          placeholder="Напишіть відповідь на заявку..."
        />
      </div>
    </Modal>
  )
}

// ============== SERVICE RECORD MODAL ==============
interface ServiceRecordModalProps {
  problemId: number
  userId: number
  onClose: () => void
  onDone: (data: Problem) => void // Очікує дані типу Problem
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
      
      // Зберігаємо результат створення запису (бекенд має повернути оновлену Problem)
      await adminApi.createServiceRecord({
        problem_id: problemId,
        user_id: userId,
        work_done: form.work_done,
        warranty_info: form.warranty_info,
        used_parts: parts,
      })
      
      const data = await problemsApi.get(problemId)
      toast('Сервісний запис додано', 'success')
      onDone(data) // Передаємо оновлену заявку далі
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