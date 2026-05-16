import random

from messenger.backend.core.redis import get_redis


async def send_verification_code(phone_number: str) -> str:
    """
    Generates a 6-digit verification code, saves it in Redis with 5 minutes TTL,
    and returns it (in a real app, this should send an SMS).
    """
    redis = get_redis()
    existing_code = await redis.get(f"verification:{phone_number}")
    if existing_code:
        print(f"[DEVELOPMENT ONLY] Verification code for {phone_number}: {existing_code}")
        return existing_code
    
    code = f"{random.randint(100000, 999999)}"
    
    # Set key with TTL of 300 seconds (5 minutes)
    key = f"verification:{phone_number}"
    await redis.setex(key, 300, code)
    
    # TODO: Integration with SMS provider like Twilio/Vonage
    print(f"[DEVELOPMENT ONLY] Verification code for {phone_number}: {code}")
    return code

async def verify_code(phone_number: str, code: str) -> bool:
    """
    Checks if the given code matches the stored code in Redis for the phone number.
    Deletes the code upon successful verification so it cannot be reused.
    """
    redis = get_redis()
    key = f"verification:{phone_number}"
    stored_code = await redis.get(key)
    
    if stored_code is not None and stored_code == code:
        await redis.delete(key)
        return True
        
    return False
