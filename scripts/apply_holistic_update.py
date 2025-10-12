import json
import os
import re
from glob import glob

NEW_CATEGORY = {
    "id": "holistic_lifestyle_and_integration",
    "name": "Holistic Lifestyle & Integration",
    "order": 15,
}

MOVED_KEY_NAMES = {
    "Environment",
    "Global Warming Risk",
    "Seasonal Weather",
    "Air Quality",
    "Natural Disasters",
    "Spring Temperature Range (C/F)",
    "Summer Temperature Range (C/F)",
    "Fall Temperature Range (C/F)",
    "Winter Temperature Range (C/F)",
    "Natural Beauty",
    "Beach Life",
    "Seasonal Beach Water Temp",
    "Community Vibes",
    "Meetups & Communities",
    "Common Hobbies",
    "Boardgaming & Tabletop",
    "Nightlife & Music",
    "Nightlife Culture",
    "Nature Access",
    "Family Life",
    "Polyamory",
    "Parenting Expectations",
    "Child-Friendliness of Cities",
    "Schooling Options",
    "Pre-K / Early Childcare Landscape",
    "Childcare Support (Citizens)",
    "Childcare Support (Visa Holders)",
    "K-12 Education Access (Citizens)",
    "K-12 Education Access (Visa Holders)",
    "Private Education",
    "Family Policy (Citizens)",
    "Family Policy (Visa Holders)",
    "Higher Education Access (Citizens)",
    "Higher Education Access (Visa Holders)",
    "What Is Intriguing",
    "Language & English Ubiquity",
    "Progressivism",
    "Marxism (Societal Attitudes)",
    "Atheism",
    "Sex (Attitudes)",
    "LGBTQ+ Attitudes",
    "View of self",
    "View of Neighboring Countries",
    "View of Them by Neighboring Countries",
    "Fashion Trends (Male)",
    "Fashion Trends (Female)",
    "Safety & Crime",
    "Housing Situation",
}


def slugify(name: str) -> str:
    name = name.lower()
    name = name.replace("–", " ")
    name = name.replace("—", " ")
    name = name.replace("-", " ")
    name = re.sub(r"[^a-z0-9\s]", "", name)
    name = re.sub(r"\s+", "_", name.strip())
    return name


NEW_KEYS_DATA = [
    {
        "name": "Seasonal Extremes & Variability",
        "guidance": "Captures how volatile and hazardous seasonal swings are, from temperature spikes to sudden storms, and how much they disrupt daily routines.",
        "ratings": {
            10: "Seasons transition gently with only rare, short-lived spikes; dangerous storms or heatwaves are exceptional and everyday plans stay intact all year.",
            9: "Seasonal shifts are mostly mild with the odd intense week that the family can manage through simple scheduling tweaks.",
            8: "Weather is generally predictable yet each season carries a couple of notable extremes that require monitoring and contingency planning.",
            7: "Meaningful swings appear a few times per season; we budget extra time and gear to handle sudden cold snaps or storm systems.",
            6: "Frequent abrupt changes make certain months feel unstable with several days of hazardous conditions that push us indoors.",
            5: "Every season brings common extremes, so we rely on specialized clothing, cooling, or heating solutions to stay comfortable.",
            4: "Seasons are defined by severe volatility with repeated power outages, transportation pauses, or property damage concerns.",
            3: "Dangerous extremes are routine, forcing us to track emergency alerts and modify plans multiple times a quarter.",
            2: "Chronic life-threatening swings and infrastructure strain make the family question long-term viability without major resiliency investments.",
            1: "Climate chaos dominates: extremes are constant and the location feels unsafe for raising the family.",
        },
    },
    {
        "name": "Seasonal Sunlight Hours",
        "guidance": "Evaluates daylight balance across the year and how much seasonal darkness or midnight sun affects mood, sleep, and routine.",
        "ratings": {
            10: "Daylight stays well-balanced year-round; no season forces blackout curtains or therapy lamps to feel normal.",
            9: "Long summer days and shorter winters still provide ample light; mood stays strong with light-touch coping habits.",
            8: "Noticeable winter darkness arrives but we can maintain energy with regular outdoor breaks and occasional light therapy.",
            7: "Deep winter gloom lasts several weeks, so we plan strict routines, supplements, and possible getaways to maintain morale.",
            6: "Extended daylight deficits and short, cloudy summers introduce ongoing mood strain the family must actively counter.",
            5: "Major daylight imbalances demand heavy interventions—SAD lamps, vitamin regimens, and frequent travel for sun exposure.",
            4: "Months of oppressive darkness or bright nights disrupt sleep cycles and make remote work or study harder to sustain.",
            3: "Extreme light swings dominate lifestyle planning with regular sleep disruption and mood crashes even with preparation.",
            2: "Daylight patterns undermine well-being for most of the year, leaving the family drained despite constant mitigation.",
            1: "Sunlight extremes are intolerable: our family cannot function without relocating seasonally.",
        },
    },
    {
        "name": "Pleasant Weather Windows",
        "guidance": "Measures how many months deliver comfortable temperatures, humidity, and precipitation so the family can enjoy outdoor life.",
        "ratings": {
            10: "Eight to ten months feel effortlessly pleasant with mild temperatures and low humidity; outdoor living is the norm.",
            9: "Most of the year is comfortable with only a few sticky or chilly weeks that barely alter our plans.",
            8: "Two to three strong seasons offer great weather while shoulder months require occasional adjustments.",
            7: "Roughly half the year is wonderful, half demands planning around heat, cold, or rain to enjoy time outside.",
            6: "Comfortable windows exist but are short; we stack activities in one or two prime seasons.",
            5: "Pleasant stretches appear sporadically, so spontaneous outdoor plans are rare and weather dominates scheduling.",
            4: "Only brief shoulder weeks feel good; most months push us indoors due to muggy, icy, or stormy conditions.",
            3: "Comfortable days are infrequent; we constantly monitor forecasts to grab the odd mild afternoon.",
            2: "Weather rarely cooperates; outdoor family life is severely limited without travel.",
            1: "Pleasant weather windows are virtually nonexistent, making the location impractical for our lifestyle.",
        },
    },
    {
        "name": "Quality of Life – Lower-Income Tier",
        "guidance": "Assesses how supportive the city is for lower-income households: housing stability, public benefits, neighborhood safety, and mobility to improve circumstances.",
        "ratings": {
            10: "Even on modest wages, families access safe housing, healthcare, transit, and enrichment; upward mobility programs are visible and effective.",
            9: "Strong safety nets and affordable essentials keep financial stress low while community programs help build stability.",
            8: "Costs are manageable with budgeting and public services cushion shocks, though trade-offs on housing quality may be needed.",
            7: "Lower-income families can make it work but face long waitlists or limited options in desirable neighborhoods.",
            6: "Basic needs are met but savings and extracurriculars are hard to sustain without extra support or side work.",
            5: "High living costs erode quality of life; reliable childcare or healthcare coverage often falls through the cracks.",
            4: "Families regularly compromise on safety or overcrowd to stay housed; civic support is patchy.",
            3: "Survival dominates—frequent trade-offs between rent, food, and healthcare with minimal institutional help.",
            2: "Poverty traps are entrenched; eviction, food insecurity, and unsafe neighborhoods are common outcomes.",
            1: "Lower-income households face crisis conditions with little pathway to stability or dignity.",
        },
    },
    {
        "name": "Quality of Life – Middle-Income Tier",
        "guidance": "Looks at how comfortably a typical professional household can thrive: housing choice, disposable income, services, and work-life harmony.",
        "ratings": {
            10: "Middle-income families enjoy spacious housing, strong public services, and meaningful savings even after leisure and travel.",
            9: "Budgets stretch comfortably with room for hobbies and education; occasional cost spikes are manageable.",
            8: "We can afford a good lifestyle with mindful budgeting, though premiums or tuition may require trade-offs.",
            7: "Comfortable living is possible but major purchases or travel demand careful planning and occasional sacrifices.",
            6: "Housing and childcare strain the budget, limiting savings and discretionary spending most months.",
            5: "We feel squeezed: decent neighborhoods or schools require long commutes or high costs that crowd out enrichment.",
            4: "Lifestyle feels brittle; one unexpected expense forces significant cutbacks or debt.",
            3: "Maintaining middle-class standards requires constant vigilance and side income just to stay afloat.",
            2: "Quality of life is compromised—overwork and cramped housing become normal to cover basics.",
            1: "Middle-income households rapidly slide toward burnout or relocation to maintain standards.",
        },
    },
    {
        "name": "Quality of Life – Higher-Income Tier",
        "guidance": "Evaluates whether affluent families enjoy frictionless services, luxury experiences, and wealth stewardship without social backlash.",
        "ratings": {
            10: "High earners access exceptional dining, culture, schools, and advisory services with community acceptance and minimal bureaucracy.",
            9: "Premium amenities are abundant and reliable; occasional waitlists exist but alternatives are plentiful.",
            8: "Most luxury services are available though some niche options require travel or early booking.",
            7: "High-end living is feasible yet demands planning around limited providers or exclusive networks.",
            6: "Affluent households encounter noticeable friction—specialists, tutors, or clubs are scarce or highly gated.",
            5: "Premium experiences exist but feel overpriced, shallow, or socially frowned upon.",
            4: "Luxury services are thin; wealth management and elite schooling often require another city.",
            3: "Affluent families struggle to find peer communities or trusted providers locally.",
            2: "High-income households face resentment and limited outlets for their lifestyle, undermining satisfaction.",
            1: "The location is hostile to affluent living, pushing families to split time elsewhere.",
        },
    },
    {
        "name": "Spacious Housing Benchmark (2k sq ft Rent)",
        "guidance": "Tracks availability and cost of renting a roughly 2,000 sq ft family home in safe, convenient neighborhoods.",
        "ratings": {
            10: "Large rentals are plentiful in prime areas at prices well within the family budget, often with modern amenities and yards.",
            9: "Finding a spacious rental is straightforward with a few weeks of searching and predictable pricing.",
            8: "Suitable homes exist but require compromise on location or finishing to stay on budget.",
            7: "Inventory is tight; we may accept longer commutes or older properties to secure space.",
            6: "Large rentals appear occasionally and move fast, demanding premium rent or broker connections.",
            5: "Most 2k sq ft options feel overpriced or stuck in fringe neighborhoods with weaker schools.",
            4: "Only a handful of listings surface each year; expect bidding wars and significant trade-offs.",
            3: "Spacious rentals are rare; we likely settle for smaller homes or relocate to a different metro.",
            2: "Large family rentals are virtually unattainable without corporate housing or extreme budgets.",
            1: "No realistic path exists to rent a 2k sq ft home in acceptable areas.",
        },
    },
    {
        "name": "Community Living Opportunities",
        "guidance": "Reviews access to co-housing, eco-villages, intentional communities, and supportive shared living models for families.",
        "ratings": {
            10: "A vibrant ecosystem of co-housing and intentional communities exists with clear entry paths and family-friendly programming.",
            9: "Multiple community living options operate nearby, and they regularly welcome new families into strong support networks.",
            8: "We can find a few reputable co-living or cooperative projects though demand may require patience.",
            7: "Intentional communities exist but are limited in size or geared toward niche demographics.",
            6: "Opportunities are sporadic; we rely on informal networks or satellite towns to join community living models.",
            5: "Only experimental or short-term arrangements pop up, offering little stability for families.",
            4: "Community living is rare and often under-resourced, requiring significant personal effort to sustain.",
            3: "No organized options exist locally; pursuing community life means starting from scratch.",
            2: "Cultural or regulatory barriers make intentional communities difficult to establish or join.",
            1: "Community living is effectively impossible; zoning or norms shut down attempts quickly.",
        },
    },
    {
        "name": "Friendliness & Neighborliness Index",
        "guidance": "Summarizes day-to-day warmth, neighborly help, and whether newcomers can easily build casual support networks.",
        "ratings": {
            10: "Neighbors greet, host, and proactively support newcomers; community chat groups buzz with generosity and invitations.",
            9: "People are consistently warm and offer help within weeks of arrival, making integration quick and genuine.",
            8: "Locals are polite and willing to connect when we show initiative, though relationships build gradually.",
            7: "Friendliness varies by neighborhood; we can cultivate ties but must invest time and select communities carefully.",
            6: "Surface politeness exists yet deeper support systems take sustained effort to unlock.",
            5: "Interactions feel transactional; expect friendly acquaintances but limited favors or shared childcare.",
            4: "Neighbors keep to themselves and rarely volunteer help; we lean heavily on external networks.",
            3: "Community interactions are cold or suspicious toward newcomers.",
            2: "Hostility or apathy dominates, making it hard to feel welcome.",
            1: "The environment is openly unfriendly, leaving the family isolated.",
        },
    },
    {
        "name": "Immigrant Sentiment – General",
        "guidance": "Captures public attitudes toward immigrants overall, including policy tone, media narratives, and day-to-day acceptance.",
        "ratings": {
            10: "Immigrants are celebrated; policies, media, and civic groups actively promote inclusion and anti-xenophobia efforts.",
            9: "Broadly positive sentiment with occasional debates; immigrants feel safe speaking their language and sharing traditions.",
            8: "Generally welcoming yet periodic political rhetoric creates mild concern.",
            7: "Sentiment splits; friendly communities exist but national discourse can turn skeptical.",
            6: "Immigrants are tolerated but face regular microaggressions or bureaucratic hurdles.",
            5: "Acceptance varies widely; caution is needed when discussing background in public spaces.",
            4: "Negative media framing and policy tightenings create a defensive posture for newcomers.",
            3: "Anti-immigrant sentiment is common; families feel compelled to downplay their origins.",
            2: "Harassment and exclusionary politics pose safety and stability risks.",
            1: "Open hostility dominates; immigration is framed as a threat and daily life feels unsafe.",
        },
    },
    {
        "name": "Immigrant Sentiment – White Migrants",
        "guidance": "Examines how white immigrants specifically are received, including assumptions of privilege or outsider status.",
        "ratings": {
            10: "White migrants integrate seamlessly with no resentment; locals treat them as valued neighbors and collaborators.",
            9: "Positive reception overall with the odd stereotype that is easy to navigate.",
            8: "Mostly comfortable integration though some circles question motives or commitment to the country.",
            7: "Reception depends on class and language; we must adapt quickly to avoid perceptions of aloofness.",
            6: "Noticeable grumbles about expats driving up costs or staying in enclaves; we mitigate by community engagement.",
            5: "Suspicion around privilege is common, demanding constant humility and proof of local investment.",
            4: "White migrants are linked to gentrification or colonial histories, prompting cool interactions.",
            3: "Integration is hard; there is regular backlash or political rhetoric targeting Western arrivals.",
            2: "Hostility or exclusionary policies make us feel unwelcome despite best efforts.",
            1: "White migrants face entrenched resentment and cannot find lasting belonging.",
        },
    },
    {
        "name": "Surface Interaction Norms",
        "guidance": "Describes expectations for casual social exchanges—small talk, customer service warmth, and day-to-day civility.",
        "ratings": {
            10: "Pleasant small talk and courteous service are standard; everyday errands feel uplifting and genuine.",
            9: "Most interactions are warm and upbeat with only occasional brusque encounters.",
            8: "Friendly exchanges happen when we initiate; staff and strangers respond positively.",
            7: "Politeness is situational; some contexts feel brisk but respectful.",
            6: "Interactions can be efficient yet emotionally flat; kindness takes effort to elicit.",
            5: "Service norms are pragmatic; smiles and chit-chat are rare outside personal networks.",
            4: "Everyday interactions often feel curt or impatient, leaving little room for warmth.",
            3: "Civility regularly breaks down with rude exchanges or visible frustration.",
            2: "Hostile or dismissive service experiences are common, eroding morale.",
            1: "Surface interactions feel adversarial, making daily life draining.",
        },
    },
    {
        "name": "Depth-Seeking Social Norms",
        "guidance": "Reflects how quickly relationships move beyond small talk into meaningful friendship and mutual support.",
        "ratings": {
            10: "Communities actively invite deep conversation and mutual aid; friendships accelerate within months.",
            9: "People welcome deeper bonds once we show interest, often through clubs or community dinners.",
            8: "Relationships deepen steadily with consistent effort; vulnerability is appreciated though not automatic.",
            7: "Many acquaintances stay casual, but dedicated outreach unlocks close friendships over time.",
            6: "Social circles are slow to open; we need persistence and shared projects to connect deeply.",
            5: "Depth is limited—most locals keep emotional distance except with lifelong friends.",
            4: "Building close relationships is difficult; newcomers remain on the periphery for years.",
            3: "Attempts at deeper connection are often rebuffed or misunderstood.",
            2: "Culture favors privacy to the point that meaningful friendships are rare for outsiders.",
            1: "Deep relationships are nearly impossible; social norms keep everyone guarded.",
        },
    },
    {
        "name": "Personal Boundary & Bubble Norms",
        "guidance": "Assesses expectations for physical space, touch, and how people signal comfort zones in social settings.",
        "ratings": {
            10: "Boundaries are respected with clear verbal cues; people default to comfortable distances and ask before touch.",
            9: "Personal space norms are healthy with occasional cultural quirks that are easy to learn.",
            8: "Most locals read body language well, though some settings skew closer than we prefer.",
            7: "Expect to navigate varied norms—crowded spaces or warm cultures may lean into closer contact.",
            6: "Personal space is often compressed, so we must advocate gently for comfort.",
            5: "Touchy or crowded norms are common and require constant boundary setting.",
            4: "Our preference for space regularly clashes with local habits, causing friction.",
            3: "People ignore signals or treat boundary requests as unusual.",
            2: "Physical space norms feel intrusive and stressful for the family.",
            1: "No meaningful respect for personal boundaries exists; daily life feels overwhelming.",
        },
    },
    {
        "name": "Moral, Honesty & Openness Expectations",
        "guidance": "Explores cultural norms around candor, sharing personal truths, and how communities respond to vulnerability or mistakes.",
        "ratings": {
            10: "Honesty is valued and met with empathy; communities address issues transparently without shame.",
            9: "People appreciate directness and respond constructively when we share concerns or needs.",
            8: "Openness is usually welcomed though some contexts expect diplomacy and softening of hard truths.",
            7: "We balance honesty with cultural nuance to avoid unintentionally offending.",
            6: "Politeness norms favor indirect communication; being candid sometimes backfires.",
            5: "Honesty is situational; locals may avoid uncomfortable topics entirely.",
            4: "Speaking openly risks social penalties, so most issues stay hidden.",
            3: "Trust is low; we keep personal matters private to avoid gossip or judgment.",
            2: "Communities punish vulnerability, making authentic connection difficult.",
            1: "Openness invites backlash; we must stay guarded to protect the family.",
        },
    },
    {
        "name": "Grooming & Beauty Investment",
        "guidance": "Examines how much time and money locals spend on appearance, and the pressure for the family to match those standards.",
        "ratings": {
            10: "Self-expression reigns; grooming expectations are flexible and no one judges a relaxed style.",
            9: "Appearance culture is balanced—care is appreciated but there is no pressure to overinvest.",
            8: "Moderate effort keeps us aligned; high-fashion scenes exist yet are optional.",
            7: "We feel a gentle push to stay polished in professional or social spaces.",
            6: "Noticeable emphasis on grooming means we budget extra time and money to fit in.",
            5: "Beauty investments run high; opting out draws comments or limits opportunities.",
            4: "Looking impeccable is expected daily, creating stress for a low-maintenance family.",
            3: "Significant judgment follows casual dress or natural looks.",
            2: "Appearance competition dominates social standing, exhausting our bandwidth.",
            1: "Constant scrutiny makes the location untenable for our preferred lifestyle.",
        },
    },
    {
        "name": "Body Image & Fitness Pressure",
        "guidance": "Reviews cultural expectations around physique, diet, and exercise, and how judgmental the environment feels.",
        "ratings": {
            10: "Body diversity is celebrated; fitness is framed as personal well-being without shaming.",
            9: "Healthy living is encouraged but inclusive; gyms and sports welcome all abilities.",
            8: "Some emphasis on fitness exists, yet conversations remain respectful and supportive.",
            7: "We notice subtle comparisons; maintaining confidence requires occasional boundary setting.",
            6: "Diet talk and body critiques surface regularly in social circles.",
            5: "Visible pressure to stay slim or athletic influences work and school culture.",
            4: "Body shaming is common and influences opportunities or friendships.",
            3: "Harsh judgments around weight or fitness saturate media and daily chatter.",
            2: "Nonconforming bodies face discrimination and exclusion.",
            1: "The environment is toxic—body policing is relentless and damaging.",
        },
    },
    {
        "name": "Fashion & Style Expectations",
        "guidance": "Considers how much locals value trendiness, designer labels, and sartorial polish across daily life.",
        "ratings": {
            10: "Fashion norms are relaxed; creative or casual attire fits in everywhere.",
            9: "Stylishness is appreciated but there is room for personal interpretation without judgment.",
            8: "We aim for tidy smart-casual looks to blend in; high fashion is optional.",
            7: "Certain districts expect polished outfits, though flexibility exists in family spaces.",
            6: "Fashionable appearance is expected in many settings, adding planning time and costs.",
            5: "Trend cycles move fast; failing to keep up draws comments or limits networking.",
            4: "Designer or curated looks are assumed, pressuring constant wardrobe investment.",
            3: "Style conformity is strict; experimentation or casual wear is frowned upon.",
            2: "Deviating from fashion norms triggers social penalties or professional doubts.",
            1: "Style expectations are overwhelming, making the culture incompatible with our preferences.",
        },
    },
    {
        "name": "Flirting Boundaries & Consent Culture",
        "guidance": "Analyzes norms around flirting, consent education, and respect for boundaries in social and nightlife settings.",
        "ratings": {
            10: "Consent culture is strong; people check in enthusiastically and intervene when lines are crossed.",
            9: "Flirting remains respectful with clear cues; nightlife staff reinforce boundaries.",
            8: "Most encounters are considerate though occasional missteps require direct communication.",
            7: "Boundaries are understood yet alcohol-fueled scenes need watchfulness.",
            6: "Mixed norms—some groups embrace consent while others rely on outdated assumptions.",
            5: "We experience periodic boundary-pushing and must be proactive about safety plans.",
            4: "Consent education is weak; unwanted advances occur regularly.",
            3: "Harassment complaints are common and rarely addressed seriously.",
            2: "Victim-blaming attitudes persist, eroding trust in institutions.",
            1: "Consent culture is poor; nightlife feels unsafe without constant vigilance.",
        },
    },
    {
        "name": "Gendered Flirting Expectations",
        "guidance": "Looks at how rigid gender roles shape dating and social interactions, and whether nontraditional dynamics are accepted.",
        "ratings": {
            10: "All genders can initiate or decline interest without stigma; scripts are fluid and inclusive.",
            9: "Expectations lean modern with minor lingering assumptions we can navigate easily.",
            8: "Mostly flexible though some circles still expect traditional roles on first approach.",
            7: "We notice gendered scripts in nightlife; deviating invites puzzled looks.",
            6: "Traditional norms dominate mainstream spaces, limiting how our family models relationships.",
            5: "Nontraditional approaches face regular pushback or misinterpretation.",
            4: "Rigid gender expectations create discomfort for progressive or queer expressions.",
            3: "Deviating from scripts sparks gossip or exclusion.",
            2: "Communities enforce strict gendered behavior with little tolerance for experimentation.",
            1: "Traditional roles are mandatory; alternative flirting styles are shunned.",
        },
    },
    {
        "name": "Monogamy vs. Non-Monogamy Acceptance",
        "guidance": "Evaluates cultural comfort with polyamory, open relationships, and families choosing non-monogamous structures.",
        "ratings": {
            10: "Non-monogamous families live openly with legal protections, social acceptance, and plentiful community resources.",
            9: "Polyamory is broadly understood; workplaces and schools treat it as a normal family variation.",
            8: "Supportive subcultures exist and mainstream spaces remain tolerant if discreet.",
            7: "Acceptance varies—urban hubs are welcoming while suburbs expect discretion.",
            6: "We can find community yet must manage privacy carefully to avoid backlash.",
            5: "Non-monogamy is tolerated in niche scenes but draws judgment elsewhere.",
            4: "Families risk stigma or legal complications when open about their structure.",
            3: "Negative narratives dominate; openness threatens custody, employment, or housing.",
            2: "Hostile policies or social norms make non-monogamy extremely risky.",
            1: "Open relationships are treated as deviant and unsafe to disclose.",
        },
    },
    {
        "name": "Promiscuity Attitudes",
        "guidance": "Considers moral views on casual sex and whether people feel judged for having or discussing multiple partners.",
        "ratings": {
            10: "Consenting adults face no moral policing; sexual choices are viewed as personal matters.",
            9: "Casual relationships are accepted though some circles prefer discretion.",
            8: "Most peers are nonjudgmental but traditional families may gossip.",
            7: "Attitudes split; open discussion is fine in urban enclaves yet frowned upon elsewhere.",
            6: "Moralizing comments surface regularly, pushing us to stay private about experiences.",
            5: "Reputational risks exist, especially for women or queer folks discussing partners.",
            4: "Conservative norms dominate; promiscuity is equated with poor character.",
            3: "Public shaming or policy consequences follow disclosures about casual sex.",
            2: "Community institutions actively police sexual behavior.",
            1: "Attitudes are punitive, making sexual openness dangerous.",
        },
    },
    {
        "name": "Group & Multi-Partner Relationship Attitudes",
        "guidance": "Measures openness toward triads, quads, and intentional multi-partner households beyond traditional couples.",
        "ratings": {
            10: "Group relationships are normalized; legal frameworks and community supports treat them on par with traditional families.",
            9: "Multi-partner households participate openly in civic life with minimal friction.",
            8: "Acceptance exists within progressive scenes and is tolerated publicly with respectful curiosity.",
            7: "Openness varies; we find understanding circles but remain discreet with institutions.",
            6: "Social services lack frameworks, so we navigate paperwork carefully and expect occasional bias.",
            5: "Multi-partner families keep a low profile to avoid gossip or discrimination.",
            4: "Stigma is strong; custody and tenancy agreements become complicated.",
            3: "Disclosure triggers backlash or official scrutiny.",
            2: "Multi-partner households face outright hostility or legal barriers.",
            1: "Group relationships are untenable; social and legal consequences are severe.",
        },
    },
    {
        "name": "Personal Space & Touch Norms",
        "guidance": "Focuses on how cultures handle greetings, casual touch, and crowding—critical for neurodiversity comfort.",
        "ratings": {
            10: "Respectful spacing is the norm; touch is consensual and people quickly adjust to cues.",
            9: "Most situations honor personal space with clear etiquette around hugs or handshakes.",
            8: "Crowded transit aside, locals check before touching and notice discomfort.",
            7: "We occasionally experience closer contact than preferred but can steer interactions politely.",
            6: "Tight quarters and spontaneous touch are common; advocating for space is a regular task.",
            5: "Culture favors close contact; sensory-sensitive family members often feel overwhelmed.",
            4: "Physical proximity is unavoidable in many settings with limited accommodations.",
            3: "Requests for space are ignored or mocked, straining well-being.",
            2: "Touch norms feel invasive and unpredictable.",
            1: "Personal space is disregarded, making daily life untenable.",
        },
    },
    {
        "name": "Firearm Laws & Ownership Culture",
        "guidance": "Evaluates gun prevalence, regulation, and community attitudes toward firearms impacting perceived safety.",
        "ratings": {
            10: "Strict firearm regulations and low ownership create a calm environment with minimal exposure to guns.",
            9: "Ownership exists but licensing, storage, and training rules are rigorous and widely respected.",
            8: "Guns are present yet culturally treated as tools with strong safety expectations.",
            7: "Laws are moderate; we occasionally encounter firearms but rarely feel threatened.",
            6: "Mixed regulations mean some communities normalize casual carry; we stay aware of local norms.",
            5: "Permissive laws and visible ownership prompt caution in public spaces.",
            4: "High prevalence of firearms and lax rules elevate daily risk perception.",
            3: "Gun culture is dominant; accidental discharges or intimidation incidents are common.",
            2: "Regulation is minimal and violence tied to firearms feels close to home.",
            1: "Firearms are ubiquitous with little oversight, undermining any sense of safety.",
        },
    },
    {
        "name": "Controlled Substance Policies",
        "guidance": "Looks at how the jurisdiction regulates recreational substances, harm reduction, and proportional penalties.",
        "ratings": {
            10: "Policies prioritize harm reduction, decriminalization, and access to treatment with minimal punitive enforcement.",
            9: "Light penalties and robust health services keep substance issues managed compassionately.",
            8: "Balanced approach: regulated markets exist alongside education and support.",
            7: "Possession laws are moderate though some substances still carry steep fines.",
            6: "Enforcement leans punitive; we monitor rules closely to avoid harsh consequences.",
            5: "Strict policies create criminal records for minor infractions, especially for immigrants.",
            4: "Zero-tolerance stances lead to aggressive policing and limited treatment options.",
            3: "Harsh sentencing and moral panic dominate political rhetoric.",
            2: "Even inadvertent infractions risk incarceration or deportation.",
            1: "Draconian laws and heavy policing make the environment unsafe for personal freedom.",
        },
    },
    {
        "name": "Drug Enforcement Climate",
        "guidance": "Captures how policing, courts, and community norms handle drug-related activity in practice.",
        "ratings": {
            10: "Enforcement focuses on trafficking and violence, while users receive support and diversion programs.",
            9: "Police practices are proportionate with strong oversight; families rarely witness aggressive sweeps.",
            8: "Most enforcement is targeted though occasional crackdowns create unease.",
            7: "Approach varies by district; we track neighborhood trends to avoid heavy-handed areas.",
            6: "Street-level policing is visible; marginalized communities report frequent stops.",
            5: "Enforcement feels unpredictable with regular raids or public shaming campaigns.",
            4: "Aggressive tactics and profiling are common, eroding trust in authorities.",
            3: "Families risk collateral trauma from militarized raids or wrongful accusations.",
            2: "Enforcement climate is punitive and discriminatory, threatening our stability.",
            1: "Drug policing is extreme; everyday life is shadowed by fear of raids or corruption.",
        },
    },
    {
        "name": "Mass Violence Incidence",
        "guidance": "Rates the frequency of mass shootings, terror attacks, and large-scale violent incidents impacting sense of safety.",
        "ratings": {
            10: "Mass violence is exceptionally rare and institutions have robust prevention plans and drills.",
            9: "Incidents are uncommon; authorities communicate transparently and communities feel prepared.",
            8: "Occasional events occur regionally, prompting situational awareness but not chronic fear.",
            7: "Recent history shows sporadic mass violence, so we stay vigilant at large gatherings.",
            6: "Multiple incidents within the past decade impact how we choose schools and venues.",
            5: "Mass violence risk is an ongoing topic; we regularly rehearse safety plans.",
            4: "Incidents happen with disturbing frequency, shaping daily routines and mental load.",
            3: "We know victims or near-misses personally; anxiety is constant.",
            2: "Mass violence is a recurring threat with little sign of systemic improvement.",
            1: "The area feels unsafe due to repeated mass casualty events.",
        },
    },
    {
        "name": "Carceral Conditions & Prison Labor",
        "guidance": "Examines prison conditions, treatment of incarcerated people, and reliance on prison labor in the justice system.",
        "ratings": {
            10: "Detention facilities emphasize rehabilitation, humane conditions, and pay fair wages for any labor.",
            9: "Prisons meet international standards with active oversight and restorative programs.",
            8: "Conditions are generally decent though some facilities lag in services or transparency.",
            7: "We track reports to avoid complacency; advocacy groups monitor periodic abuses.",
            6: "Overcrowding or low wages appear in investigative reports, raising ethical concerns.",
            5: "Systemic issues persist—forced labor, poor healthcare, or punitive isolation.",
            4: "Abuses are common and reforms stall; immigrants risk severe treatment if detained.",
            3: "Conditions are degrading with widespread labor exploitation and violence.",
            2: "Prisons operate as punitive work camps with minimal oversight.",
            1: "Carceral system is inhumane, making the jurisdiction ethically unacceptable.",
        },
    },
    {
        "name": "Walkability & Pedestrian Safety",
        "guidance": "Evaluates sidewalk coverage, safe crossings, traffic calming, and how easily the family can rely on walking daily.",
        "ratings": {
            10: "Streets prioritize pedestrians with wide sidewalks, slow traffic, and accessible crossings everywhere.",
            9: "Most neighborhoods support confident walking with only a few car-heavy corridors to navigate.",
            8: "Walkable pockets exist and connect via decent transit; we plan routes to avoid busy arterials.",
            7: "Sidewalks cover key areas but drivers often rush, so we stay alert with children.",
            6: "Infrastructure is inconsistent; safe walking requires choosing specific neighborhoods.",
            5: "Walking is possible yet stressful due to gaps in sidewalks or aggressive driving.",
            4: "Pedestrian deaths or injuries are common; car dominance limits independence.",
            3: "Sidewalks are scarce and crossings dangerous, restricting mobility.",
            2: "Walking feels unsafe most of the time; we rely heavily on cars or transit.",
            1: "Pedestrian infrastructure is effectively absent, making walking impractical.",
        },
    },
    {
        "name": "Community Health Consciousness",
        "guidance": "Assesses how strongly locals emphasize preventive health, fitness, and wellness resources accessible to families.",
        "ratings": {
            10: "Wellness culture thrives with community programs, markets, and healthcare messaging reinforcing healthy routines.",
            9: "Most residents engage in active lifestyles and local policies support preventive care.",
            8: "Health-conscious communities exist alongside more laid-back groups; resources are readily available.",
            7: "We can find wellness support but must seek out likeminded circles to stay motivated.",
            6: "Healthy living requires self-direction; fast food and sedentary habits dominate social life.",
            5: "Public health messaging is uneven; we invest extra time to maintain routines.",
            4: "Community norms lean unhealthy, making it hard to model good habits for kids.",
            3: "Limited access to wellness programs or safe recreation spaces hinders goals.",
            2: "Health literacy is low and chronic illness rates are high, challenging our priorities.",
            1: "The culture undermines healthy living, forcing us to seek alternatives elsewhere.",
        },
    },
    {
        "name": "Processed Food Saturation",
        "guidance": "Measures prevalence of ultra-processed foods in stores, schools, and advertising versus whole food availability.",
        "ratings": {
            10: "Whole foods dominate; processed snacks are limited and clearly labeled, supporting mindful eating.",
            9: "Healthy options are abundant though processed treats appear in moderation.",
            8: "We can shop and dine well with planning, yet convenience foods are always nearby.",
            7: "Processed foods are common but balanced by strong fresh markets.",
            6: "Ultra-processed options crowd shelves; schools and events lean heavily on packaged snacks.",
            5: "Maintaining clean eating requires vigilance and possibly specialty stores.",
            4: "Healthy choices are overshadowed by processed fare in most neighborhoods.",
            3: "Food deserts or convenience stores dominate, making whole foods hard to secure.",
            2: "Ultra-processed diets are the norm, challenging our health goals.",
            1: "Fresh food access is scarce; processed saturation is overwhelming.",
        },
    },
    {
        "name": "Fresh & International Cuisine Access",
        "guidance": "Evaluates availability of fresh produce, farmers markets, and diverse international dining that aligns with the family's palate.",
        "ratings": {
            10: "Fresh markets abound and global cuisines flourish, letting us enjoy familiar and adventurous meals weekly.",
            9: "We have plentiful access to quality produce and diverse restaurants with only rare gaps.",
            8: "Strong selection overall though certain cuisines require a bit of travel.",
            7: "We can meet most cravings but specialty ingredients or restaurants appear sporadically.",
            6: "Fresh options exist yet international diversity is limited to a few neighborhoods.",
            5: "We rely on home cooking with imported ingredients to achieve desired variety.",
            4: "Produce quality or range is inconsistent; international cuisine is niche.",
            3: "Choices are narrow and repetitive, forcing frequent trips to larger cities.",
            2: "Fresh and global food options are scarce, complicating meal planning.",
            1: "Access to fresh and international cuisine is practically nonexistent.",
        },
    },
    {
        "name": "Depression Prevalence",
        "guidance": "Considers mental health statistics, stigma, and support systems addressing depression across the community.",
        "ratings": {
            10: "Low prevalence thanks to robust mental health services, social supports, and proactive public health initiatives.",
            9: "Rates are below average with strong access to counseling and community care.",
            8: "Mental health burdens exist but are met with accessible services and open dialogue.",
            7: "Prevalence is moderate; we secure support with some wait times.",
            6: "Higher-than-average depression rates prompt us to plan carefully for therapy access.",
            5: "Stigma or limited providers make it harder to secure consistent care.",
            4: "Prevalence is high with long waits and patchy insurance coverage.",
            3: "Community struggles visibly with depression and lacks coordinated response.",
            2: "Mental health crises are common and under-treated, affecting day-to-day life.",
            1: "Depression rates are extreme with minimal support infrastructure.",
        },
    },
    {
        "name": "Obesity Rate",
        "guidance": "Reviews obesity prevalence and whether health systems, culture, and infrastructure mitigate the risks.",
        "ratings": {
            10: "Obesity rates are low thanks to active transport, healthy food norms, and strong preventative care.",
            9: "Rates stay below national averages with proactive wellness campaigns.",
            8: "Moderate obesity levels exist but community efforts keep trends stable.",
            7: "We monitor diet and activity because obesity is moderately common.",
            6: "Higher obesity prevalence indicates limited access to healthy routines in some areas.",
            5: "Obesity is widespread, signaling systemic lifestyle challenges we must counter individually.",
            4: "Rates continue climbing; youth obesity impacts schools and recreation.",
            3: "Chronic disease linked to obesity burdens healthcare systems noticeably.",
            2: "Obesity prevalence is severe and intersects with poverty and limited mobility.",
            1: "Extremely high obesity rates make maintaining our health goals significantly harder.",
        },
    },
    {
        "name": "Cancer Incidence",
        "guidance": "Tracks cancer incidence trends, screening access, and environmental contributors that affect long-term family planning.",
        "ratings": {
            10: "Cancer rates are low with strong screening programs and minimal environmental risk factors.",
            9: "Incidence stays below averages thanks to proactive healthcare and clean environments.",
            8: "Rates align with global norms; screening and early detection programs are reliable.",
            7: "Slightly elevated incidence prompts routine checkups and monitoring.",
            6: "Noticeable clusters or industrial risks require diligence and perhaps neighborhood vetting.",
            5: "Higher cancer rates tie to environmental or lifestyle factors we must actively mitigate.",
            4: "Incidence trends upward; access to specialized care may be strained.",
            3: "Multiple risk factors converge, making cancer a frequent community concern.",
            2: "Serious environmental or policy failures drive alarming cancer rates.",
            1: "Cancer incidence is extreme with poor mitigation, jeopardizing long-term health plans.",
        },
    },
    {
        "name": "Community Health Consciousness",
        "guidance": "Assesses how strongly locals emphasize preventive health, fitness, and wellness resources accessible to families.",
        "ratings": {
            10: "Wellness culture thrives with community programs, markets, and healthcare messaging reinforcing healthy routines.",
            9: "Most residents engage in active lifestyles and local policies support preventive care.",
            8: "Health-conscious communities exist alongside more laid-back groups; resources are readily available.",
            7: "We can find wellness support but must seek out likeminded circles to stay motivated.",
            6: "Healthy living requires self-direction; fast food and sedentary habits dominate social life.",
            5: "Public health messaging is uneven; we invest extra time to maintain routines.",
            4: "Community norms lean unhealthy, making it hard to model good habits for kids.",
            3: "Limited access to wellness programs or safe recreation spaces hinders goals.",
            2: "Health literacy is low and chronic illness rates are high, challenging our priorities.",
            1: "The culture undermines healthy living, forcing us to seek alternatives elsewhere.",
        },
    },
    {
        "name": "Processed Food Saturation",
        "guidance": "Measures prevalence of ultra-processed foods in stores, schools, and advertising versus whole food availability.",
        "ratings": {
            10: "Whole foods dominate; processed snacks are limited and clearly labeled, supporting mindful eating.",
            9: "Healthy options are abundant though processed treats appear in moderation.",
            8: "We can shop and dine well with planning, yet convenience foods are always nearby.",
            7: "Processed foods are common but balanced by strong fresh markets.",
            6: "Ultra-processed options crowd shelves; schools and events lean heavily on packaged snacks.",
            5: "Maintaining clean eating requires vigilance and possibly specialty stores.",
            4: "Healthy choices are overshadowed by processed fare in most neighborhoods.",
            3: "Food deserts or convenience stores dominate, making whole foods hard to secure.",
            2: "Ultra-processed diets are the norm, challenging our health goals.",
            1: "Fresh food access is scarce; processed saturation is overwhelming.",
        },
    },
    {
        "name": "Fresh & International Cuisine Access",
        "guidance": "Evaluates availability of fresh produce, farmers markets, and diverse international dining that aligns with the family's palate.",
        "ratings": {
            10: "Fresh markets abound and global cuisines flourish, letting us enjoy familiar and adventurous meals weekly.",
            9: "We have plentiful access to quality produce and diverse restaurants with only rare gaps.",
            8: "Strong selection overall though certain cuisines require a bit of travel.",
            7: "We can meet most cravings but specialty ingredients or restaurants appear sporadically.",
            6: "Fresh options exist yet international diversity is limited to a few neighborhoods.",
            5: "We rely on home cooking with imported ingredients to achieve desired variety.",
            4: "Produce quality or range is inconsistent; international cuisine is niche.",
            3: "Choices are narrow and repetitive, forcing frequent trips to larger cities.",
            2: "Fresh and global food options are scarce, complicating meal planning.",
            1: "Access to fresh and international cuisine is practically nonexistent.",
        },
    },
    {
        "name": "Depression Prevalence",
        "guidance": "Considers mental health statistics, stigma, and support systems addressing depression across the community.",
        "ratings": {
            10: "Low prevalence thanks to robust mental health services, social supports, and proactive public health initiatives.",
            9: "Rates are below average with strong access to counseling and community care.",
            8: "Mental health burdens exist but are met with accessible services and open dialogue.",
            7: "Prevalence is moderate; we secure support with some wait times.",
            6: "Higher-than-average depression rates prompt us to plan carefully for therapy access.",
            5: "Stigma or limited providers make it harder to secure consistent care.",
            4: "Prevalence is high with long waits and patchy insurance coverage.",
            3: "Community struggles visibly with depression and lacks coordinated response.",
            2: "Mental health crises are common and under-treated, affecting day-to-day life.",
            1: "Depression rates are extreme with minimal support infrastructure.",
        },
    },
    {
        "name": "Obesity Rate",
        "guidance": "Reviews obesity prevalence and whether health systems, culture, and infrastructure mitigate the risks.",
        "ratings": {
            10: "Obesity rates are low thanks to active transport, healthy food norms, and strong preventative care.",
            9: "Rates stay below national averages with proactive wellness campaigns.",
            8: "Moderate obesity levels exist but community efforts keep trends stable.",
            7: "We monitor diet and activity because obesity is moderately common.",
            6: "Higher obesity prevalence indicates limited access to healthy routines in some areas.",
            5: "Obesity is widespread, signaling systemic lifestyle challenges we must counter individually.",
            4: "Rates continue climbing; youth obesity impacts schools and recreation.",
            3: "Chronic disease linked to obesity burdens healthcare systems noticeably.",
            2: "Obesity prevalence is severe and intersects with poverty and limited mobility.",
            1: "Extremely high obesity rates make maintaining our health goals significantly harder.",
        },
    },
    {
        "name": "Cancer Incidence",
        "guidance": "Tracks cancer incidence trends, screening access, and environmental contributors that affect long-term family planning.",
        "ratings": {
            10: "Cancer rates are low with strong screening programs and minimal environmental risk factors.",
            9: "Incidence stays below averages thanks to proactive healthcare and clean environments.",
            8: "Rates align with global norms; screening and early detection programs are reliable.",
            7: "Slightly elevated incidence prompts routine checkups and monitoring.",
            6: "Noticeable clusters or industrial risks require diligence and perhaps neighborhood vetting.",
            5: "Higher cancer rates tie to environmental or lifestyle factors we must actively mitigate.",
            4: "Incidence trends upward; access to specialized care may be strained.",
            3: "Multiple risk factors converge, making cancer a frequent community concern.",
            2: "Serious environmental or policy failures drive alarming cancer rates.",
            1: "Cancer incidence is extreme with poor mitigation, jeopardizing long-term health plans.",
        },
    },
    {
        "name": "Broader Job Market Resilience",
        "guidance": "Evaluates how diversified and stable the regional economy is, and how well it weathers recessions or industry shocks.",
        "ratings": {
            10: "Economy is diversified with strong safety nets; job losses are rare and recovery is swift even during global crises.",
            9: "Multiple sectors thrive; downturns lead to short hiring pauses rather than layoffs.",
            8: "Resilience is good with occasional layoffs offset by quick reemployment.",
            7: "Market depends on a few key industries, so we maintain contingency plans.",
            6: "Recessions hit noticeable segments, requiring flexibility or retraining.",
            5: "Economic cycles bring recurring layoffs; we keep emergency funds and remote options ready.",
            4: "Job market is volatile with frequent booms and busts across major employers.",
            3: "Single-industry dominance makes downturns painful and long-lasting.",
            2: "Chronic unemployment or underemployment signals deep structural issues.",
            1: "The economy is fragile; job prospects collapse quickly during stress.",
        },
    },
]

# Deduplicate in case of copy-paste repeats while preserving the first definition of each key.
_unique_new_keys = []
_seen_names = set()
for _item in NEW_KEYS_DATA:
    if _item["name"] in _seen_names:
        continue
    _unique_new_keys.append(_item)
    _seen_names.add(_item["name"])
NEW_KEYS_DATA = _unique_new_keys


DEFAULT_ALIGNMENT_TEMPLATE = "Additional research is required before we can score {key}; the family is holding this space at 0 for now."


def update_categories():
    path = os.path.join("data", "categories.json")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    categories = data.get("categories", [])
    if not any(cat["id"] == NEW_CATEGORY["id"] for cat in categories):
        categories.append(NEW_CATEGORY)
        categories.sort(key=lambda c: c.get("order", 0))
        data["categories"] = categories
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)


def update_category_keys():
    path = os.path.join("data", "category_keys.json")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    changed = False
    for entry in data.get("categoryKeys", []):
        if entry["name"] in MOVED_KEY_NAMES:
            if entry.get("categoryId") != NEW_CATEGORY["id"]:
                entry["categoryId"] = NEW_CATEGORY["id"]
                changed = True
    existing_ids = {entry["id"] for entry in data.get("categoryKeys", [])}
    for item in NEW_KEYS_DATA:
        key_id = f"{NEW_CATEGORY['id']}_{slugify(item['name'])}"
        if key_id not in existing_ids:
            data["categoryKeys"].append(
                {
                    "id": key_id,
                    "categoryId": NEW_CATEGORY["id"],
                    "name": item["name"],
                    "guidance": item["guidance"],
                }
            )
            changed = True
    if changed:
        data["categoryKeys"] = sorted(data["categoryKeys"], key=lambda k: (k["categoryId"], k["name"]))
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)


def update_rating_guides():
    path = os.path.join("data", "rating_guides.json")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    existing_keys = {entry["key"] for entry in data.get("ratingGuides", [])}
    for item in NEW_KEYS_DATA:
        if item["name"] in existing_keys:
            continue
        guide = {
            "key": item["name"],
            "ratingGuide": [
                {"rating": rating, "guidance": text}
                for rating, text in sorted(item["ratings"].items(), reverse=True)
            ],
        }
        data["ratingGuides"].append(guide)
    data["ratingGuides"] = sorted(data["ratingGuides"], key=lambda g: g["key"])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def update_reports():
    report_paths = glob(os.path.join("reports", "*_report.json"))
    new_keys = [item["name"] for item in NEW_KEYS_DATA]
    for path in report_paths:
        with open(path, "r", encoding="utf-8") as f:
            report = json.load(f)
        values = report.get("values", [])
        existing = {entry["key"] for entry in values}
        added = False
        for key_name in new_keys:
            if key_name not in existing:
                values.append(
                    {
                        "key": key_name,
                        "alignmentText": DEFAULT_ALIGNMENT_TEMPLATE.format(key=key_name),
                        "alignmentValue": 0,
                    }
                )
                added = True
        if added:
            report["values"] = values
            with open(path, "w", encoding="utf-8") as f:
                json.dump(report, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    update_categories()
    update_category_keys()
    update_rating_guides()
    update_reports()
