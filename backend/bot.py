import asyncio
import os

import httpx
from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandObject, CommandStart
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
API_URL_CONFIRM = "http://localhost:8000/users/telegram/confirm"
API_URL_CHECK = "http://localhost:8000/users/telegram/check"

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

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
                    await message.answer(f"✅✅ Ваш Telegram успішно прив'язаний до акаунта {data.get('username')}\n\nТепер ви будете отримувати сповіщення про зміну статусу ваших заявок сюди😀")
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
                    await message.asnwer(f"👋 Привіт, {data.get('username')}!\nВаш акаунт вже прив'язаний до Service Desk😉")
            else:
                await message.answer("👋 Привіт!\nЯ бот Service Desk.\n\nЯ поки що не знаю хто ви. Щоб отримувати сповіщення, перейдіть у свій профіль на сайті та натисніть кнопку «Прив'язати Telegram».")
        except Exception as e:
            await message.answer("👋 Привіт! На жаль, зараз немає зв'язку з основним сервером.")
    
async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())