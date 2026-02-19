import os

from redis import asyncio as aioredis

REDIS_URL = os.getenv("REDIS_URL")

redis_client = aioredis.from_url(
    REDIS_URL,
    decode_responses=True
)

async def get_redis():
    return redis_client
