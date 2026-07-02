import os
import django
import urllib.request
import urllib.error
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')
django.setup()

req = urllib.request.Request("http://localhost:8000/api/accounts/users/")

try:
    response = urllib.request.urlopen(req, timeout=10)
    print("STATUS:", response.status)
    print("BODY:", response.read().decode('utf-8')[:500])
except urllib.error.HTTPError as e:
    print("HTTPError:", e.code)
    try:
        body = e.read().decode('utf-8')
        print("BODY:", body)
    except Exception as ex:
        print("Could not read body:", ex)
except Exception as e:
    print("Exception:", e)
