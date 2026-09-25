#!/usr/bin/env python
"""Forwards to the real manage.py in the nested Project_Budgeting-BE- folder,
so `python manage.py <command>` works from the repo root."""
import os
import runpy
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent / "Project_Budgeting-BE-"

sys.path.insert(0, str(PROJECT_DIR))
os.chdir(PROJECT_DIR)
runpy.run_path(str(PROJECT_DIR / "manage.py"), run_name="__main__")
