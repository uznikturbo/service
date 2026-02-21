import { useState, useRef, useEffect } from 'react'
import { problemsApi } from '../api'
import { useToast } from '../context/ToastContext'
import { Modal, Spinner } from './ui'

interface CreateProblemModalProps {
  onClose: () => void
  onCreated: () => void
}

export function CreateProblemModal({ onClose, onCreated }: CreateProblemModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  
  // Новые стейты для работы с файлом
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()
  
  // Реф для вызова скрытого input type="file"
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Очищаем ссылку на превью из памяти при закрытии модалки или смене файла
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Будь ласка, оберіть саме зображення (PNG, JPG, WEBP)')
        return
      }
      setImageFile(file)
      setPreviewUrl(URL.createObjectURL(file))
      setError('')
    }
  }

  const removeImage = () => {
    setImageFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      setError("Заповніть обов'язкові поля")
      return
    }
    setLoading(true)
    setError('')
    
    try {
      // Собираем данные в FormData вместо обычного JSON-объекта
      const formData = new FormData()
      formData.append('title', title)
      formData.append('description', description)
      if (imageFile) {
        formData.append('image', imageFile)
      }

      // API-клиент теперь должен принимать formData
      await problemsApi.create(formData)
      
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
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>
            Скасувати
          </button>
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
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Коротко опишіть проблему..."
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Опис проблеми *</label>
        <textarea
          className="form-textarea"
          style={{ minHeight: 120 }}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Детальний опис: що сталося, коли, за яких обставин..."
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Скріншот або фото (необов'язково)</label>
        
        {/* Скрытый инпут для файла */}
        <input
          type="file"
          accept="image/png, image/jpeg, image/jpg, image/webp"
          ref={fileInputRef}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          disabled={loading}
        />

        {!previewUrl ? (
          // Зона для кліку (залишається без змін)
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed rgba(138, 43, 226, 0.4)',
              borderRadius: '8px',
              padding: '24px',
              textAlign: 'center',
              cursor: 'pointer',
              color: 'var(--text2)',
              backgroundColor: 'rgba(138, 43, 226, 0.05)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(138, 43, 226, 0.8)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(138, 43, 226, 0.4)'}
          >
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📸</div>
            <div style={{ fontSize: '14px', fontFamily: 'var(--font-mono)' }}>
              Натисніть, щоб завантажити зображення
            </div>
          </div>
        ) : (
          // === ОНОВЛЕНИЙ БЛОК ПРЕВЬЮ ===
          <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
             {/* Використовуємо <img> замість div з background-image */}
            <img
              src={previewUrl}
              alt="Preview"
              style={{
                maxWidth: '100%',       // Не ширше батьківського блоку
                maxHeight: '300px',     // ГОЛОВНЕ ОБМЕЖЕННЯ: не вище 300px
                width: 'auto',          // Ширина підлаштовується автоматично
                height: 'auto',         // Висота підлаштовується автоматично
                objectFit: 'contain',   // МАГІЯ: показувати зображення повністю, не обрізаючи
                borderRadius: '8px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg2)' // Легкий фон на випадок, якщо у картинки є прозорість
              }}
            />
            {/* Кнопка видалення */}
            <button
              onClick={removeImage}
              style={{
                position: 'absolute',
                // Трохи посунув кнопку, щоб вона не перекривала кут картинки
                top: '-10px',
                right: '-10px',
                background: 'var(--bg)', // Використовуємо колір фону теми
                color: 'var(--text)',
                border: '2px solid var(--border)',
                borderRadius: '50%',
                width: '30px',
                height: '30px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                fontWeight: 'bold',
                transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,50,50,0.9)'
                e.currentTarget.style.color = 'white'
                e.currentTarget.style.borderColor = 'transparent'
              }}
              onMouseLeave={(e) => {
                 e.currentTarget.style.background = 'var(--bg)'
                 e.currentTarget.style.color = 'var(--text)'
                 e.currentTarget.style.borderColor = 'var(--border)'
              }}
              disabled={loading}
            >
              ✕
            </button>
          </div>
        )}

      </div>

      {error && <div className="form-error">⚠ {error}</div>}
    </Modal>
  )
}