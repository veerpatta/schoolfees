# Database Seeds

## 01_test_session_setup.sql

Creates the TEST-2026-27 session, 19 classes, fee_settings, conventional
discount policies (RTE, Staff Child, 3rd Child), and 4 test family groups.
Safe to re-run. Run this first.

## 02_test_students_seed.sql

Inserts ~120 test students across all 19 classes covering all test scenarios:
standard, new student, transport, RTE, Staff Child, 3rd Child, family groups,
custom overrides, no phone, no DOB, combined discount policies.
All admission numbers are prefixed with TEST-.
Safe to re-run (ON CONFLICT DO NOTHING).
Run after 01.

## 03_cleanup_existing_students.sql

Safe deletion script for production session cleanup.
Contains preview queries (run these first), a safe-delete block (removes
students with no payment history), and a full-wipe block (staging only).
Read the file carefully before running any DELETE statements.

## Usage

Run in Supabase SQL Editor (Database -> SQL Editor) as postgres/service role,
or via psql / supabase CLI.
Always run 01 before 02.
