# Community Wellbeing & Social Climate Category Proposal

## Objective
Create a consolidated category that surfaces how day-to-day community life, social acceptance, and safety intersect for relocating families. This category is built entirely from existing keys so we can pilot the re-organization without expanding the schema.

## Proposed Category Structure
| Sub-Section | Existing Key | Source Category | Purpose |
| --- | --- | --- | --- |
| Social Climate & Inclusivity | Progressivism | Culture & Values Fit | Capture broad social liberalism signals that influence community openness. |
|  | Marxism (Societal Attitudes) | Culture & Values Fit | Clarify ideological lean that shapes discourse with newcomers. |
|  | Atheism | Culture & Values Fit | Describe religious diversity and tolerance in social settings. |
|  | LGBTQ+ Attitudes | Culture & Values Fit | Highlight treatment of queer residents and visitors. |
|  | Gender Fluidity | Gender & Identity | Show visibility and everyday inclusion of non-binary residents. |
|  | Gender Rights | Gender & Identity | Surface legal protections that impact family decision-making. |
|  | Femininity Norms | Gender & Identity | Explain expectations that influence social comfort. |
|  | Masculinity Norms | Gender & Identity | Balance perspective on masculinity standards and respectfulness. |
| Community Experience | Community Vibes | Culture & Values Fit | Describe friendliness, expat density, and informal support networks. |
|  | Meetups & Communities | Entertainment & Community | Provide actionable entry points into social circles. |
|  | Nightlife & Music | Entertainment & Community | Explain evening culture that shapes connection opportunities. |
|  | Nature Access | Entertainment & Community | Include shared outdoor gathering spaces and their accessibility. |
| Safety & Trust | Safety & Crime | Governance & Stability | Connect legal/safety climate (including firearms and violent incidents) to community confidence. |
|  | Workers' Rights | Governance & Stability | Reflect on labor protections that prevent exploitation (e.g., forced labor). |
|  | Trust in Government | Governance & Stability | Gauge institutional reliability that underpins community trust. |
| Health & Family Support | Healthcare (Citizens) | Public Services | Cover systemic health outcomes (mental health, chronic diseases). |
|  | Healthcare (Visa Holders) | Public Services | Ensure migrants understand access realities. |
|  | Child Care Support | Public Services | Discuss support systems for families seeking community childcare. |
|  | Family Policy (Common Family) | Public Services | Describe norms around multi-generational or communal living. |

By grouping these existing keys, reports can narratively connect inclusivity, safety, and wellbeing without altering data collection requirements.

## Alignment With TODO Themes (Cost of Living Omitted)
- **Climate & Environmental Context**: Use existing `Environment`, `Seasonal Weather`, `Air Quality`, and seasonal temperature range keys to provide the detailed climate ranges, sunniness, and daylight expectations requested in TODO.
- **Quality of Life Across Income Bands**: Leverage `Economic System`, `Expected Tax Rate (Our Family)`, and narrative in `Work Opportunities` to contrast experiences for low-, medium-, and high-income households without new keys.
- **Housing & Co-Living**: Continue using `Housing Situation`, `Family Policy (Common Family)`, and `Meetups & Communities` to explain traditional housing costs, availability of large rentals, and community living arrangements.
- **Community Warmth & Attitudes**: The consolidated category spotlights `Community Vibes`, `Welcoming of US Migrants`, `Progressivism`, and gender/sex attitude keys to capture friendliness, openness, and positivity toward immigrants as listed.
- **Legal & Safety Landscape**: Address gun, marijuana, and broader drug regulations alongside mass-shooting statistics within `Safety & Crime`, while `Trust in Government` and `Workers' Rights` give context on enforcement, incarceration norms, and forced-labor concerns.
- **Mobility & Walkability**: Combine `Public Transportation`, `Nature Access`, and `Safety & Crime` commentary to cover walkability and perceived safety of moving through neighborhoods.
- **Health & Nutrition Signals**: Incorporate data on health consciousness, prevalence of processed foods, and health outcomes (depression, obesity, cancer) in narrative form under `Healthcare (Citizens)` and `Healthcare (Visa Holders)`.
- **Food Scene Variety**: Use `What Is Intriguing`, `Nightlife & Music`, and `Community Vibes` to map availability of diverse cuisines (Italian, Mexican, etc.) and communal dining culture.
- **Work & Job Market**: Continue relying on the `Work Opportunities` suite (language-specific keys plus `Work-Life Balance`) to summarize job prospects and day-to-day schedules.
- **Social & Romantic Norms**: Capture flirting dynamics, respect for boundaries, and attitudes toward monogamy through existing `Sex (Attitudes)`, `Femininity Norms`, and `Masculinity Norms` keys.

## Next Steps
1. Update report templates to render the new consolidated category and ensure key order matches the table above.
2. Add editorial guidance so contributors understand how TODO themes map to existing keys within this organization.
3. Pilot the structure with one country report to validate readability before rolling out across the dataset.
