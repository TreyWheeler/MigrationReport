import json
from glob import glob
from pathlib import Path

REPORT_GLOB = "reports/*_report.json"

with open("data/rating_guides.json", encoding="utf-8") as fh:
    rating_guides = {
        guide["key"]: {entry["rating"]: entry["guidance"] for entry in guide["ratingGuide"]}
        for guide in json.load(fh)["ratingGuides"]
    }

QUAL_DESCRIPTORS = [
    (9, "excellent"),
    (7, "strong"),
    (5, "mixed"),
    (3, "challenging"),
    (1, "unsustainable"),
]


def qualitative_descriptor(score: int) -> str:
    for threshold, descriptor in QUAL_DESCRIPTORS:
        if score >= threshold:
            return descriptor
    return QUAL_DESCRIPTORS[-1][1]


def with_article(word: str) -> str:
    return f"an {word}" if word[0].lower() in "aeiou" else f"a {word}"


def clamp_score(value: float) -> int:
    rounded = int(round(value))
    return max(1, min(10, rounded))


COMPUTATION_PLAN = [
    (
        "Seasonal Extremes & Variability",
        [("Seasonal Weather", 0.7), ("Natural Disasters", 0.3)],
    ),
    (
        "Seasonal Sunlight Hours",
        [("Seasonal Weather", 0.6), ("Environment", 0.4)],
    ),
    (
        "Pleasant Weather Windows",
        [("Seasonal Weather", 0.7), ("Environment", 0.3)],
    ),
    (
        "Quality of Life – Lower-Income Tier",
        [("Minimum Wage", 0.4), ("Housing Situation", 0.3), ("Childcare Support (Citizens)", 0.3)],
    ),
    (
        "Quality of Life – Middle-Income Tier",
        [("Typical Software Salaries", 0.4), ("Housing Situation", 0.3), ("Work-Life Balance", 0.3)],
    ),
    (
        "Quality of Life – Higher-Income Tier",
        [("Housing Situation", 0.4), ("Private Education", 0.3), ("Family Life", 0.3)],
    ),
    (
        "Spacious Housing Benchmark (2k sq ft Rent)",
        [("Housing Situation", 0.7), ("Cost of Living (Optional)", 0.3)],
    ),
    (
        "Community Living Opportunities",
        [("Community Vibes", 0.4), ("Meetups & Communities", 0.3), ("Family Life", 0.3)],
    ),
    (
        "Friendliness & Neighborliness Index",
        [("Community Vibes", 0.5), ("Meetups & Communities", 0.3), ("Common Hobbies", 0.2)],
    ),
    (
        "Immigrant Sentiment – General",
        [("Welcoming of US Migrants", 0.4), ("Progressivism", 0.3), ("Language & English Ubiquity", 0.3)],
    ),
    (
        "Immigrant Sentiment – White Migrants",
        [("Welcoming of US Migrants", 0.4), ("Language & English Ubiquity", 0.3), ("View of Them by Neighboring Countries", 0.3)],
    ),
    (
        "Surface Interaction Norms",
        [("Community Vibes", 0.5), ("Nightlife Culture", 0.3), ("Common Hobbies", 0.2)],
    ),
    (
        "Depth-Seeking Social Norms",
        [("Community Vibes", 0.4), ("Meetups & Communities", 0.3), ("What Is Intriguing", 0.3)],
    ),
    (
        "Personal Boundary & Bubble Norms",
        [("Community Vibes", 0.4), ("Sex (Attitudes)", 0.3), ("View of self", 0.3)],
    ),
    (
        "Moral, Honesty & Openness Expectations",
        [("Progressivism", 0.4), ("What Is Intriguing", 0.3), ("Trust in Government", 0.3)],
    ),
    (
        "Grooming & Beauty Investment",
        [("Fashion Trends (Male)", 0.5), ("Fashion Trends (Female)", 0.5)],
    ),
    (
        "Body Image & Fitness Pressure",
        [("Fashion Trends (Male)", 0.3), ("Fashion Trends (Female)", 0.3), ("Sex (Attitudes)", 0.4)],
    ),
    (
        "Fashion & Style Expectations",
        [("Fashion Trends (Male)", 0.5), ("Fashion Trends (Female)", 0.5)],
    ),
    (
        "Flirting Boundaries & Consent Culture",
        [("Sex (Attitudes)", 0.4), ("LGBTQ+ Attitudes", 0.3), ("Nightlife Culture", 0.3)],
    ),
    (
        "Gendered Flirting Expectations",
        [("Gender Roles", 0.5), ("Gender Fluidity", 0.3), ("Sex (Attitudes)", 0.2)],
    ),
    (
        "Monogamy vs. Non-Monogamy Acceptance",
        [("Polyamory", 0.5), ("Sex (Attitudes)", 0.3), ("Community Vibes", 0.2)],
    ),
    (
        "Promiscuity Attitudes",
        [("Sex (Attitudes)", 0.5), ("Nightlife & Music", 0.3), ("Community Vibes", 0.2)],
    ),
    (
        "Group & Multi-Partner Relationship Attitudes",
        [("Polyamory", 0.6), ("Community Vibes", 0.2), ("LGBTQ+ Attitudes", 0.2)],
    ),
    (
        "Personal Space & Touch Norms",
        [("Community Vibes", 0.4), ("Sex (Attitudes)", 0.3), ("Nightlife Culture", 0.3)],
    ),
    (
        "Firearm Laws & Ownership Culture",
        [("Safety & Crime", 0.6), ("State Ideology", 0.2), ("Political System", 0.2)],
    ),
    (
        "Controlled Substance Policies",
        [("Progressivism", 0.4), ("Political System", 0.3), ("Safety & Crime", 0.3)],
    ),
    (
        "Drug Enforcement Climate",
        [("Safety & Crime", 0.5), ("Progressivism", 0.3), ("Authoritarian Backsliding Risk", 0.2)],
    ),
    (
        "Mass Violence Incidence",
        [("Safety & Crime", 0.6), ("Stability", 0.4)],
    ),
    (
        "Carceral Conditions & Prison Labor",
        [("Authoritarian Backsliding Risk", 0.4), ("Safety & Crime", 0.3), ("Perceived Corruption", 0.3)],
    ),
    (
        "Walkability & Pedestrian Safety",
        [("Public Transportation", 0.4), ("Housing Situation", 0.3), ("Nature Access", 0.3)],
    ),
    (
        "Community Health Consciousness",
        [("Healthcare (Citizens)", 0.4), ("Work-Life Balance", 0.3), ("Community Vibes", 0.3)],
    ),
    (
        "Fresh & International Cuisine Access",
        [("Nightlife & Music", 0.4), ("Common Hobbies", 0.3), ("Meetups & Communities", 0.3)],
    ),
    (
        "Processed Food Saturation",
        [("Cost of Living (Optional)", 0.4), ("Community Health Consciousness", 0.3), ("Fresh & International Cuisine Access", 0.3)],
    ),
    (
        "Depression Prevalence",
        [("Seasonal Weather", 0.4), ("Work-Life Balance", 0.3), ("Community Vibes", 0.3)],
    ),
    (
        "Obesity Rate",
        [("Community Health Consciousness", 0.5), ("Work-Life Balance", 0.3), ("Cost of Living (Optional)", 0.2)],
    ),
    (
        "Cancer Incidence",
        [("Environment", 0.4), ("Healthcare (Citizens)", 0.3), ("Community Health Consciousness", 0.3)],
    ),
    (
        "Broader Job Market Resilience",
        [("Economic Health", 0.5), ("Remote-Friendly Culture", 0.3), ("Typical Software Salaries", 0.2)],
    ),
]


PLAN_LOOKUP = {name: weights for name, weights in COMPUTATION_PLAN}


def build_context(name: str, influences, score: int, get_score):
    descriptor = qualitative_descriptor(score)
    mentions = []
    for influence, _ in influences:
        value = get_score(influence)
        mentions.append(f"{influence} at {value}/10")
    if not mentions:
        return f"This yields {with_article(descriptor)} footing for {name.lower()}."
    if len(mentions) == 1:
        joined = mentions[0]
    elif len(mentions) == 2:
        joined = " and ".join(mentions)
    else:
        joined = ", ".join(mentions[:-1]) + f", and {mentions[-1]}"
    return f"{joined} steer the family toward {with_article(descriptor)} outlook for {name.lower()}."


report_paths = [Path(p) for p in glob(REPORT_GLOB)]

for report_path in report_paths:
    with report_path.open(encoding="utf-8") as fh:
        report = json.load(fh)

    values = report.get("values", [])
    existing_values = {entry["key"]: entry["alignmentValue"] for entry in values}
    updates = {}

    def score_for(key: str) -> int:
        if key in updates:
            return updates[key]["score"]
        return existing_values.get(key, 5)

    for name, weights in COMPUTATION_PLAN:
        total = 0.0
        weight_sum = 0.0
        for influence, weight in weights:
            total += score_for(influence) * weight
            weight_sum += weight
        score = clamp_score(total / weight_sum if weight_sum else 5)
        guide = rating_guides.get(name, {})
        guide_text = guide.get(score)
        if not guide_text:
            # fall back to closest available rating guidance
            if guide:
                available = sorted(guide.keys())
                closest = min(available, key=lambda r: abs(r - score))
                guide_text = guide[closest]
            else:
                guide_text = f"Score of {score} for {name}."
        context = build_context(name, weights, score, score_for)
        updates[name] = {
            "score": score,
            "text": f"{guide_text} {context}".strip(),
        }

    changed = False
    for entry in values:
        key = entry.get("key")
        if key in updates:
            data = updates[key]
            if entry.get("alignmentValue") != data["score"] or entry.get("alignmentText") != data["text"]:
                entry["alignmentValue"] = data["score"]
                entry["alignmentText"] = data["text"]
                changed = True

    if changed:
        with report_path.open("w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
