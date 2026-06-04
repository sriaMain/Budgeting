

from django_redis import get_redis_connection

redis_conn = get_redis_connection("default")

ENV_PREFIX = "budgeting"  # Change this if you want a different namespace

def has_active_timer(user_id):
    """
    Returns True ONLY if timer is currently RUNNING
    """
    try:
        return redis_conn.exists(f"{ENV_PREFIX}:timer_start:{user_id}")
    except Exception as e:
        print(f"Warning: Redis connection failed: {e}")
        return False

def set_active_timer(user_id, task_id, start_time):
    try:
        redis_conn.set(f"{ENV_PREFIX}:active_timer:{user_id}", task_id)
        redis_conn.set(f"{ENV_PREFIX}:timer_start:{user_id}", start_time.isoformat())
    except Exception as e:
        print(f"Warning: Redis connection failed: {e}")

def clear_active_timer(user_id):
    try:
        redis_conn.delete(f"{ENV_PREFIX}:active_timer:{user_id}")
        redis_conn.delete(f"{ENV_PREFIX}:timer_start:{user_id}")
    except Exception as e:
        print(f"Warning: Redis connection failed: {e}")

def get_active_timer(user_id):
    try:
        task_id = redis_conn.get(f"{ENV_PREFIX}:active_timer:{user_id}")
        start_time = redis_conn.get(f"{ENV_PREFIX}:timer_start:{user_id}")
        return task_id, start_time
    except Exception as e:
        print(f"Warning: Redis connection failed: {e}")
        return None, None

def seconds_to_hms(total_seconds: int) -> dict:
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60

    return {
        "hours": hours,
        "minutes": minutes,
        "seconds": seconds,
        "formatted": f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    }