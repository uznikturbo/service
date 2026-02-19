# Используем легкий образ Python
FROM python:3.11-slim

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# Отключаем создание .pyc файлов и буферизацию вывода (чтобы логи видеть сразу)
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Сначала копируем только зависимости (для кэширования слоев Docker)
COPY requirements.txt .

# Устанавливаем зависимости
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь остальной код
COPY . .

# Команда запуска (порт 8000)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]