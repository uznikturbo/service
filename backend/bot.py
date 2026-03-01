import asyncio
import os

import httpx
from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import KeyboardButton, ReplyKeyboardMarkup, ReplyKeyboardRemove
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
API_URL_CONFIRM = "http://fastapi_backend:8000/users/telegram/confirm"
API_URL_CHECK = "http://fastapi_backend:8000/users/telegram/check"

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


kb = ReplyKeyboardMarkup(
    keyboard=[
        [KeyboardButton(text="📄 Заявки")]
    ],
    resize_keyboard=True
)

@dp.message(CommandStart(deep_link=True))
async def handle_start(message: types.Message, command: CommandObject):
    token = command.args
    tg_id = message.from_user.id

    async with httpx.AsyncClient() as client:
        if token:
            try:
                res = await client.post(API_URL_CONFIRM, json={"token": token, "telegram_id": tg_id})
                if res.status_code == 200:
                    data = res.json()
                    await message.answer(f"✅✅ Ваш Telegram успішно прив'язаний до акаунта {data.get('username')}\n\nТепер ви будете отримувати сповіщення про зміну статусу ваших заявок сюди😀", reply_markup=kb)
                else:
                    err = res.json().get('detail', "Невідома помилка при прив'язці")
                    await message.answer(f"❌❌ {err}")
            except Exception as e:
                await message.answer("❌ Сервер Service Desk тимчасово недоступний")
            return

        try:
            res = await client.get(f"{API_URL_CHECK}/{tg_id}")
            if res.status_code == 200:
                data = res.json()
                if data.get("linked"):
                    await message.answer(f"👋 Привіт, {data.get('username')}!\nВаш акаунт вже прив'язаний до Service Desk😉", reply_markup=kb)
            else:
                await message.answer("👋 Привіт!\nЯ бот Service Desk.\n\nЯ поки що не знаю хто ви. Щоб отримувати сповіщення, перейдіть у свій профіль на сайті та натисніть кнопку «Прив'язати Telegram».")
        except Exception as e:
            await message.answer("👋 Привіт! На жаль, зараз немає зв'язку з основним сервером.")

@dp.message(Command("problems"))
@dp.message(F.text.lower().contains("заявки"))
async def handle_problems(message: types.Message):
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get("http://fastapi_backend:8000/problems/tg", params={"tg_id": message.from_user.id})
            if res.status_code == 200:

                data = res.json()
                if not data:
                    await message.answer("У вас немає заявок😭😭. Ви можете створити їх на сайті ServiceDesk😉", reply_markup=kb)
                else:
                    text = "Ваші заявки:\n\n"
                    for problem in data:
                        p_id = problem.get("id", "N/A")
                        p_title = problem.get("title", "Без назви")
                        p_status = problem.get("status", "Невідомо")

                        text += f"Заявка №{p_id}\nНазва: {p_title}\nСтатус: {p_status}\n\n"

                    await message.answer(text, reply_markup=kb)
            elif res.status_code == 404:
                await message.answer("Ваш акаунт не прив'язаний до сайту")

        except Exception as e:
            print(f"Error: {e}")
            await message.answer("Немає зв'язку з сервером.")



async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())