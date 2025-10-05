# MigrationReport Country Update SOP

This SOP is optimized for LLM agents that need to refresh an existing country report so it better reflects the family’s priorities. Follow the sequence exactly—each step is designed to minimize back-and-forth commands while maximizing scoring accuracy.

## 0. Load Context Once
1. Open `family_profile.json` to anchor every judgement in the household’s priorities, deal-breakers, and weighting (`evaluation_weights_0_to_5`).
2. Open `main.json` and list every `Key` under `Categories`; this is the authoritative checklist of fields you must keep in the report.
3. Open `rating_guides.json` and locate the section for each `Key`. This file defines what every score from 1–10 should mean; use it to calibrate your revisions.
4. Open the target country file inside `reports/` (e.g., `reports/portugal_report.json`). Copy its current structure locally so you can compare old vs. new entries as you revise.

> **Do not** move forward until you have all four files loaded. They are the only sources you need for the update.

## 1. Build an Update Worksheet
1. Create a working table (mentally or in notes) that lists every `Key` from `main.json`.
2. For each `Key`, note the existing `alignmentValue` and `alignmentText` from the country report. This creates a baseline you can audit against.
3. Flag keys whose guidance in `rating_guides.json` does not currently align with the existing score or explanation.

## 2. Re-Evaluate Each Key
Perform the following loop for every `Key` (use the worksheet order to avoid skipping anything):

1. **Interpret the rating guide.** Read the 1–10 descriptions for the `Key`. Identify the two closest ratings that bracket the country’s real situation; interpolate if necessary.
2. **Cross-check with the family profile.** Confirm the new score honors the family’s needs (e.g., progressive politics, childcare, entrepreneurship). If the profile elevates a topic, lean conservative unless evidence is very strong.
3. **Adjust the score.** Set `alignmentValue` to the rating that best fits both the guide and the family’s priorities. Use integers 1–10; use `0` only when you truly have insufficient data (leave the text empty in that case). Avoid `-1` unless you are intentionally marking “Unknown”.
4. **Rewrite the justification.** Craft 1–2 concise sentences for `alignmentText` that:
   - Reference the family’s needs (“polyamory-positive communities”, “quality public schools”, etc.).
   - Cite concrete factors or trade-offs. Mention sourcing context in plain language; add short Markdown links only when necessary.
   - Make it clear why the chosen score fits the guide (e.g., “Transit is efficient but rural gaps keep it at a 7 per the guide’s caution tier”).
5. **Document gaps.** If reliable data is missing, set `alignmentValue` to `0` and `alignmentText` to `""`. Call this out in your worksheet so a future pass can research it.

## 3. Apply Updates to the JSON
1. Work inside the existing country JSON file. Preserve the `iso` value and the array order (order is flexible but staying close to the original minimizes diff noise).
2. For every `Key` in your worksheet, update the corresponding object’s `alignmentValue` and `alignmentText`.
3. Add a top-level `"version": 2` field directly under the opening `{`. This marks the country as refreshed; if a `version` already exists, overwrite it with `2`.
4. Ensure every `Key` from `main.json` still appears exactly once. Do **not** add or remove keys.
5. Keep valid JSON formatting (commas, quotes, etc.).

Example structure after updates:
```json
{
  "version": 2,
  "iso": "XX",
  "values": [
    { "key": "Air Quality", "alignmentText": "…", "alignmentValue": 6 },
    { "key": "Public Transportation", "alignmentText": "…", "alignmentValue": 7 }
  ]
}
```

## 4. Spot-Check Before Saving
1. Re-read the entire file to confirm tone is evidence-driven and tailored to the family profile.
2. Verify that every `alignmentValue` is compatible with its rating guide narrative.
3. Confirm no `alignmentText` contradicts the family’s stated deal-breakers or weights.
4. Validate JSON syntax (e.g., by using a formatter or running `node -e "JSON.parse(fs.readFileSync('reports/<file>.json','utf8'))"`).

## 5. Update Metadata (if needed)
- `main.json` already lists the country. Only edit it if the filename changed (it shouldn’t in an update). If you touched `main.json`, keep formatting consistent.

## 6. Final Review for Commit Readiness
1. Ensure your diff shows only the intended score/text changes plus the `version` field.
2. Summarize the major rating shifts in your commit message so reviewers understand what improved.
3. Run any available linting or formatting tools if the repository provides them (none are required by default).

When you finish these steps, the country report will be aligned to the new rating guides, grounded in the family profile, and clearly marked as a version 2 update.
