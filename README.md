# MigrationReport

## How To: Add a Country (for ChatGPT or similar LLM)

Goal: Create a new country JSON report that matches this repo’s schema, aligns the values to our family’s needs (from `family_profile.json`), and register the country in `main.json` so it appears in the UI.

Follow these steps precisely and conservatively to maximize alignment accuracy.

1) Load Inputs and Build Context
- Read `family_profile.json` and extract key preferences, constraints, and priorities (e.g., climate, job market, schools, culture, cost). Keep these top‑of‑mind for every judgment you make.
- Read `main.json` and list all Keys under each Category in `Categories`. These Keys form the required checklist for the country report.

2) Create the Country Report File
- File name: `<lower_snake_case_country>_report.json` (e.g., `japan_report.json`).
- JSON shape must match existing reports exactly:
  {
    "iso": "XX",   // ISO 3166-1 alpha-2 code (required for flag)
    "values": [
      { "key": "…", "alignmentText": "…", "alignmentValue": N },
      … one object per Key from main.json …
    ]
  }
- Include every Key from `main.json` once, in any order. Do not invent new Keys.
- Use the correct country `iso` code (two letters). If unknown, research; do not guess. If you truly cannot determine it, leave out the country until it’s known.

3) Scoring and Text Guidance
- alignmentValue scale (use integers 1-10; reserve 0 for "No data"):
  - -1: Unknown (treated same color as No data in UI; leave alignmentText empty).
  - 0: No data (leave alignmentText empty string "").
  - 1–3: Poor fit or mostly negative for our family.
  - 4–6: Mixed/uncertain; notable trade‑offs or variability.
  - 7: Caution/mostly positive but with important caveats.
  - 8–10: Strong fit with clear, consistent evidence for our family.
- alignmentText style:
  - 1–2 concise sentences tailored to our family profile. State the “why” (evidence/logic) in plain language that reflects our needs.
  - If helpful, include short Markdown links like [source](https://example.com). Links are auto‑rendered in the UI.
  - Avoid filler or generic claims. Call out trade‑offs explicitly where relevant to the profile.
- Missing info:
  - If you cannot make a justified judgment, set alignmentValue to 0 and alignmentText to "" (empty). The UI will show “No data”.

4) Alignment Process (do this for each Key)
- Read the Key’s Category and Guidance from `main.json` to understand what to evaluate.
- Ask: “Given `family_profile.json`, how does this country align with this Key?”
- Weigh pros/cons, be specific (e.g., “good broadband coverage in cities” vs. generic “good internet”).
- Choose a score using the rubric above; write a short justification in alignmentText.

5) Register the Country in main.json
- Open `main.json` and append your country to `Countries`:
  {
    "name": "Country Name",
    "file": "country_name_report.json"
  }
- Ensure the `file` matches the report filename you created.

6) Quality Checks Before Finishing
- The report includes:
  - An `iso` field (uppercase ISO 3166‑1 alpha‑2).
  - A `values` array with exactly one entry per Key from `main.json`.
- JSON is valid and loads without errors.
- No hallucinated facts: prefer conservative, evidence‑based claims. Use “No data” (0 + empty text) rather than guessing.
- Scores reflect the family’s stated needs, not generic averages.

7) Quick Manual Validation (optional but encouraged)
- Open `index.html` and select the new country in the left panel.
- Verify the table renders; flag appears; chips show colors that match scores.
- Confirm that only intentionally missing items show as “No data”.

That’s it. Be precise, justify every score succinctly, and favor accuracy over coverage.
