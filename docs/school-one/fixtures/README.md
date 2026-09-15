# fixtures — rules

Files here are **structural** inputs for tests and import scripts: the timetable CSV block (staff first names as they appear on the public timetable are acceptable), header rows of exports, sample calendar rows.

Never commit here, or anywhere in this repository: a child's name, any phone number, Aadhaar / Jan Aadhaar / APAAR values, addresses, photos, or a real staff phone number. Fake students use the pattern `Student A01`; fake phones use `+91 00000 000NN`.

If a script needs real data (e.g. the Sampark teachers export with phone numbers), it reads a file **outside** the repository, passed by path at run time, and the path is never committed.

Planned fixtures:
- `timetable-v11.txt` — the `rawData` block from `timetable2025/scripts/data.js` (copied by Janmejay in Phase 1).
- `sampark-students-header.csv` — header row only.
- `calendar-sample.csv` — five rows showing the expected columns.
