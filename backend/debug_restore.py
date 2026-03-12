import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

async def debug_active_user():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "taskflow")
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("--- Active Session Check ---")
    session = await db.user_sessions.find_one(sort=[("created_at", -1)])
    if not session:
        print("No active session found.")
        return
        
    user_id = session.get("user_id")
    user = await db.users.find_one({"user_id": user_id})
    if user:
        print(f"Active User ID: {user_id}")
        print(f"Email: {user.get('email')}")
        print(f"Admin: {user.get('is_admin')}")
    else:
        print(f"Active User ID {user_id} not found in users collection!")

    print("\n--- All Accounts for this Email ---")
    email = user.get('email') if user else "vasangr27@gmail.com"
    async for u in db.users.find({"email": email}):
        print(f"ID: {u.get('user_id')} | Created: {u.get('created_at')}")

if __name__ == "__main__":
    asyncio.run(debug_active_user())
