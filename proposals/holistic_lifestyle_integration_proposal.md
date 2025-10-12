# Holistic Lifestyle & Integration Category Proposal

## Compliance Snapshot
- **Data structures**: Re-uses the existing `categories` and `category_keys` tables; proposes a single new category plus new keys only. No novel tables or nested schemas are introduced.
- **Existing keys**: Every key that moves is explicitly listed below with its current category. Keys not mentioned remain where they are today—none are removed or deprecated.
- **Implementation aids**: Execution is expected to follow the repository data dictionary (`data/DATA_DICTIONARY.md`) and `SOP-Add New Key` for every net-new key.

## Step 1 – Baseline Inventory (Current State Only)
Documenting the status quo ensures the migration plan accounts for every key. The following lists reflect the exact keys presently stored in `data/category_keys.json` within the relevant categories.

### Environment & Climate (`environment_and_climate`)
- Environment
- Global Warming Risk
- Seasonal Weather
- Air Quality
- Natural Disasters
- Spring Temperature Range (C/F)
- Summer Temperature Range (C/F)
- Fall Temperature Range (C/F)
- Winter Temperature Range (C/F)

### Nature & Outdoors (`nature_and_outdoors`)
- Beach Life
- Seasonal Beach Water Temp
- Natural Beauty

### Entertainment & Community (`entertainment_and_community`)
- Common Hobbies
- Boardgaming & Tabletop
- Nightlife & Music
- Meetups & Communities
- Nature Access

### Family Friendliness (`family_friendliness`)
- Family Life
- Polyamory
- Parenting Expectations
- Child-Friendliness of Cities
- Schooling Options
- Pre-K / Early Childcare Landscape
- Childcare Support (Citizens)
- Childcare Support (Visa Holders)
- K-12 Education Access (Citizens)
- K-12 Education Access (Visa Holders)
- Private Education
- Family Policy (Citizens)
- Family Policy (Visa Holders)
- Higher Education Access (Citizens)
- Higher Education Access (Visa Holders)

### Culture & Values Fit (`culture_and_values_fit`)
- What Is Intriguing
- Language & English Ubiquity
- Progressivism
- Marxism (Societal Attitudes)
- Atheism
- Sex (Attitudes)
- LGBTQ+ Attitudes
- Community Vibes
- View of self
- View of Neighboring Countries
- View of Them by Neighboring Countries
- Nightlife Culture
- Fashion Trends (Male)
- Fashion Trends (Female)

### Governance & Stability (`governance_and_stability`)
- Housing Situation
- Safety & Crime
- Political System
- Religion in Politics
- Workers' Rights
- State Ideology
- Authoritarian Backsliding Risk
- State of Capitalism
- Stability
- Propaganda Prevalence
- Propaganda Messaging
- Social Policies
- Trust in Government
- Perceived Corruption
- Type of Corruption

## Step 2 – Proposed Holistic Lifestyle & Integration Category
Create a new category (`holistic_lifestyle_and_integration`) that gathers lifestyle-centric keys. Existing keys move according to the mapping below; all moves are between existing tables and require only `categoryId` updates. Every listed key remains intact.

### 1. Environmental Comfort
- Environment *(from Environment & Climate)*
- Global Warming Risk *(from Environment & Climate)*
- Seasonal Weather *(from Environment & Climate)*
- Air Quality *(from Environment & Climate)*
- Natural Disasters *(from Environment & Climate)*
- Spring Temperature Range (C/F) *(from Environment & Climate)*
- Summer Temperature Range (C/F) *(from Environment & Climate)*
- Fall Temperature Range (C/F) *(from Environment & Climate)*
- Winter Temperature Range (C/F) *(from Environment & Climate)*
- Natural Beauty *(from Nature & Outdoors)*
- Beach Life *(from Nature & Outdoors)*
- Seasonal Beach Water Temp *(from Nature & Outdoors)*

### 2. Community Belonging & Activities
- Community Vibes *(from Culture & Values Fit)*
- Meetups & Communities *(from Entertainment & Community)*
- Common Hobbies *(from Entertainment & Community)*
- Boardgaming & Tabletop *(from Entertainment & Community)*
- Nightlife & Music *(from Entertainment & Community)*
- Nightlife Culture *(from Culture & Values Fit)*
- Nature Access *(from Entertainment & Community)*

### 3. Inclusivity, Family Support & Livability Economics
- Family Life *(from Family Friendliness)*
- Polyamory *(from Family Friendliness)*
- Parenting Expectations *(from Family Friendliness)*
- Child-Friendliness of Cities *(from Family Friendliness)*
- Schooling Options *(from Family Friendliness)*
- Pre-K / Early Childcare Landscape *(from Family Friendliness)*
- Childcare Support (Citizens) *(from Family Friendliness)*
- Childcare Support (Visa Holders) *(from Family Friendliness)*
- K-12 Education Access (Citizens) *(from Family Friendliness)*
- K-12 Education Access (Visa Holders) *(from Family Friendliness)*
- Private Education *(from Family Friendliness)*
- Family Policy (Citizens) *(from Family Friendliness)*
- Family Policy (Visa Holders) *(from Family Friendliness)*
- Higher Education Access (Citizens) *(from Family Friendliness)*
- Higher Education Access (Visa Holders) *(from Family Friendliness)*

### 4. Cultural Expression, Relationships & Values
- What Is Intriguing *(from Culture & Values Fit)*
- Language & English Ubiquity *(from Culture & Values Fit)*
- Progressivism *(from Culture & Values Fit)*
- Marxism (Societal Attitudes) *(from Culture & Values Fit)*
- Atheism *(from Culture & Values Fit)*
- Sex (Attitudes) *(from Culture & Values Fit)*
- LGBTQ+ Attitudes *(from Culture & Values Fit)*
- View of self *(from Culture & Values Fit)*
- View of Neighboring Countries *(from Culture & Values Fit)*
- View of Them by Neighboring Countries *(from Culture & Values Fit)*
- Fashion Trends (Male) *(from Culture & Values Fit)*
- Fashion Trends (Female) *(from Culture & Values Fit)*

### 5. Safety, Governance & Legal Climate
- Safety & Crime *(from Governance & Stability)*
- Housing Situation *(from Governance & Stability)*

> **Unaffected keys:** Any Governance & Stability keys not named above (e.g., Political System, Trust in Government) remain in their current category.

## Step 3 – Proposed Additions (Keys Only)
These additions expand qualitative coverage without altering underlying structures. Each bullet represents a new key to be created via `SOP-Add New Key` with supporting rating guides.

### Environmental Comfort Enhancements
- Seasonal Extremes & Variability *(New Key)*
- Seasonal Sunlight Hours *(New Key)*
- Pleasant Weather Windows *(New Key)*

### Livability Economics & Housing
- Quality of Life – Lower-Income Tier *(New Key)*
- Quality of Life – Middle-Income Tier *(New Key)*
- Quality of Life – Higher-Income Tier *(New Key)*
- Spacious Housing Benchmark (2k sq ft Rent) *(New Key)*
- Community Living Opportunities *(New Key)*

### Community Belonging & Activities Deep-Dive
- Friendliness & Neighborliness Index *(New Key)*
- Immigrant Sentiment – General *(New Key)*
- Immigrant Sentiment – White Migrants *(New Key)*
- Surface Interaction Norms *(New Key)*
- Depth-Seeking Social Norms *(New Key)*
- Personal Boundary & Bubble Norms *(New Key)*
- Moral, Honesty & Openness Expectations *(New Key)*

### Cultural Expression, Relationships & Vanity
- Grooming & Beauty Investment *(New Key)*
- Body Image & Fitness Pressure *(New Key)*
- Fashion & Style Expectations *(New Key)*
- Flirting Boundaries & Consent Culture *(New Key)*
- Gendered Flirting Expectations *(New Key)*
- Monogamy vs. Non-Monogamy Acceptance *(New Key)*
- Promiscuity Attitudes *(New Key)*
- Group & Multi-Partner Relationship Attitudes *(New Key)*
- Personal Space & Touch Norms *(New Key)*

### Safety, Governance & Legal Climate
- Firearm Laws & Ownership Culture *(New Key)*
- Controlled Substance Policies *(New Key)*
- Drug Enforcement Climate *(New Key)*
- Mass Violence Incidence *(New Key)*
- Carceral Conditions & Prison Labor *(New Key)*

### Mobility & Built Environment
- Walkability & Pedestrian Safety *(New Key)*

### Health, Food Access & Wellness
- Community Health Consciousness *(New Key)*
- Processed Food Saturation *(New Key)*
- Fresh & International Cuisine Access *(New Key)*
- Depression Prevalence *(New Key)*
- Obesity Rate *(New Key)*
- Cancer Incidence *(New Key)*

### Employment & Opportunity Context
- Broader Job Market Resilience *(New Key)*

## Step 4 – Implementation Roadmap for Future Agent
1. **Confirm current data** using the PowerShell GET scripts referenced in `data/DATA_DICTIONARY.md` to export existing category and key records. This guards against drift before editing.
2. **Create the new category** `holistic_lifestyle_and_integration` through `scripts/powershell/Categories_INSERT.ps1` (or update ordering as needed) while retaining all other categories.
3. **Move existing keys** listed in Step 2 by updating their `categoryId` with `CategoryKeys_UPDATE.ps1`. Track progress in a worksheet to ensure each key is migrated exactly once.
4. **Add each new key** via the `SOP-Add New Key`, producing aligned entries in:
   - `data/category_keys.json` (with guidance text),
   - `data/rating_guides.json`, and
   - every `reports/*.json` file (country and city) with coherent scoring and narrative.
5. **Quality assurance**: run JSON validation on modified files and re-export category/key listings to confirm the final structure matches the proposal and that no legacy keys were dropped.

This roadmap keeps the intent clear for a future implementation pass while respecting all repository standards.
