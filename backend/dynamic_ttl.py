from functools import lru_cache
from typing import Dict, List, Optional

import numpy as np

from embedding.embedding import embed, embed_text

DEFAULT_TTL = 86400
SEMANTIC_FLOOR = 0.55
MIN_MARGIN = 0.05
KEYWORD_BONUS = 0.15

TTL_BUCKETS: Dict[int, Dict[str, List[str]]] = {
    0: {
        "anchors": [
            "medical dosage advice for my specific condition",
            "legal opinion on my contract case",
            "personal tax filing numbers confidential",
            "how much is my home loan approval",
            "password reset for my account",
            "is my credit card compromised",
            "what should I tell my lawyer",
            "my private medical record details",
        ],
        "keywords": [
            "ibuprofen", "beta blocker", "dosage", "prescription", "my medication",
            "my medical", "diagnosis", "my lawyer", "court case", "lawsuit",
            "bankruptcy", "tax filing", "password", "otp", "credit card",
            "bank account", "social security", "loan approval", "private",
            "confidential", "my condition",
        ],
    },
    180: {
        "anchors": [
            "tsunami alert hit the coast moments ago",
            "goal announcement came seconds ago",
            "explosion happened minutes earlier",
            "air strike reported just now",
            "power cut occurred five minutes back",
            "earthquake struck moments earlier",
            "hackers claimed breach minutes ago",
            "result broke in the last two minutes",
        ],
        "keywords": [
            "breaking", "tsunami", "earthquake", "explosion", "air strike",
            "moments ago", "just now", "seconds ago", "minutes ago", "ongoing",
            "evacuation", "power cut", "right now",
        ],
    },
    600: {
        "anchors": [
            "live cricket run rate ticking now",
            "auction bidding climbing this instant",
            "poll majority shuffling this instant",
            "room temperature meter live now",
            "package tracker ping this instant",
            "power plant output gauge live this instant",
            "exchange order book updating this instant",
            "traffic flow sensor reading this instant",
        ],
        "keywords": [
            "live score", "run rate", "ticker", "auction", "bid", "poll",
            "sensor", "gauge", "tracking", "ping", "order book", "live now",
            "is winning",
        ],
    },
    3600: {
        "anchors": [
            "bus arrives within the hour",
            "short-term trend for the coming sixty minutes",
            "weather changes over the next hour",
            "when does the shop open this hour",
            "hourly limit resets shortly",
            "rate for the current hour",
            "retry the task again in about an hour",
            "leave in roughly sixty minutes",
        ],
        "keywords": [
            "within the hour", "next hour", "in an hour", "this hour",
            "hourly", "sixty minutes", "60 minutes", "opens soon",
        ],
    },
    18000: {
        "anchors": [
            "plan for this afternoon",
            "itinerary for the rest of the day",
            "afternoon meeting at two pm today",
            "afternoon session schedule",
            "lunch rush ends this afternoon",
            "afternoon availability today",
            "closing hours after midday today",
            "half day schedule until supper",
        ],
        "keywords": [
            "afternoon", "lunch", "midday", "rest of the day", "2 pm", "supper",
        ],
    },
    36000: {
        "anchors": [
            "tonight's concert venue tonight",
            "what's happening across today",
            "today's full schedule morning to night",
            "evening plans for today",
            "today's itinerary all day",
            "tonight's game tip-off this evening",
            "today's agenda from start to finish",
            "evening classes scheduled today",
        ],
        "keywords": [
            "tonight", "evening", "today's schedule", "today's agenda",
            "today's itinerary", "all day", "morning to night",
        ],
    },
    61200: {
        "anchors": [
            "tomorrow's weather forecast will it rain",
            "is it going to rain tomorrow",
            "flight departure tomorrow morning",
            "tomorrow's schedule plans",
            "tomorrow's sunrise time",
            "stock market opens tomorrow",
            "tomorrow's appointments",
            "overnight layover tonight tomorrow morning",
        ],
        "keywords": [
            "tomorrow", "tomorrow morning", "tomorrow's", "tomorrow night",
            "overnight", "next day",
        ],
    },
    86400: {
        "anchors": [
            "today's date and holidays today",
            "today's temperature high and low",
            "today's exchange rate fix",
            "today's closing price daily",
            "today's newspaper headlines summary",
            "menu of the day at the canteen",
            "daily specials valid only today",
            "sunrise and sunset times today",
        ],
        "keywords": [
            "today's date", "today's weather", "commute today", "rate today",
            "of the day", "daily", "closing price", "menu of the day",
            "weather forecast",
        ],
    },
    432000: {
        "anchors": [
            "this weekend's festival dates",
            "this week's matches fixtures",
            "weekend movie releases this week",
            "what's coming up this week",
            "this week's specials at the mall",
            "weekend weather outlook",
            "weekly rota for the week",
            "this week's menu at the cafeteria",
        ],
        "keywords": [
            "this weekend", "this week", "weekend", "weekly", "this week's",
        ],
    },
    864000: {
        "anchors": [
            "next week's meetings agenda",
            "next week's conference schedule",
            "appointment next Tuesday",
            "deadlines next week",
            "next week's weather outlook",
            "booking for next Friday",
            "next weekend getaway plans",
            "what's planned for next week",
        ],
        "keywords": [
            "next week", "next tuesday", "next friday", "next weekend",
            "week after", "newsweek",
        ],
    },
    1296000: {
        "anchors": [
            "project shipping in two weeks",
            "fortnight from now milestone",
            "event at the end of this month",
            "sprint ending in two weeks",
            "delivery arriving the week after next",
            "registration closes in two weeks",
            "review scheduled a fortnight ahead",
            "mid month milestone in two weeks",
        ],
        "keywords": [
            "two weeks", "fortnight", "week after next", "in 2 weeks", "mid month",
        ],
    },
    1900800: {
        "anchors": [
            "credit card bill due at month end",
            "salary credited at month end",
            "rent due on the thirtieth",
            "monthly subscription renews this month",
            "loan emi due this month",
            "monthly report deadline",
            "utility bill closing day this month",
            "month end targets closing soon",
        ],
        "keywords": [
            "month end", "end of month", "due this month", "renews this month",
            "monthly", "thirtieth", "30th", "salary", "rent", "emi",
        ],
    },
    2592000: {
        "anchors": [
            "definition meaning of a term explained",
            "how to cook pasta tutorial steps",
            "history of ancient rome facts",
            "algebra formula reference",
            "law about self defense basics",
            "company vacation policy handbook",
            "capital of france geography",
            "how to write a resume guide",
        ],
        "keywords": [
            "how to", "meaning of", "tutorial", "guide", "reference",
            "formula", "capital of", "handbook", "what is the definition",
            "explain", "definition",
        ],
    },
}

_ANCHOR_CACHE = None
@lru_cache(maxsize=1)
def _anchor_vectors():
    global _ANCHOR_CACHE
    if _ANCHOR_CACHE is None:
        result = {}
        for ttl, config in TTL_BUCKETS.items():
            result[ttl] = []
        all_phrases = []
        for ttl, config in TTL_BUCKETS.items():
            for phrase in config["anchors"]:
                all_phrases.append(phrase)
        vectors = embed(all_phrases)
        i = 0
        for ttl, config in TTL_BUCKETS.items():
            for _ in range(len(config["anchors"])):
                result[ttl].append(vectors[i])
                i = i + 1
        _ANCHOR_CACHE = result
    return _ANCHOR_CACHE



def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


def get_semantic_ttl(user_query: str, risk_level: Optional[str] = None) -> int:
    
    if risk_level is not None and risk_level.lower() == "high":
        return 0

    text = user_query.lower()
    
    query_vector = embed_text(user_query)
    
    anchors = _anchor_vectors()

    scores = []
    

    for ttl, config in TTL_BUCKETS.items():
        
        highest_similarity = 0.0
        for anchor_vector in anchors[ttl]:
            sim = _cosine_similarity(query_vector, anchor_vector)
            if sim > highest_similarity:
                highest_similarity = sim
                
        
        keyword_hits = 0
        for keyword in config["keywords"]:
            if keyword in text:
                keyword_hits += 1
     
        total_score = highest_similarity + (KEYWORD_BONUS * keyword_hits)

        scores.append({
            "total_score": total_score,
            "similarity": highest_similarity,
            "keyword_hits": keyword_hits,
            "ttl_value": ttl
        })

    scores.sort(key=lambda x: x["total_score"], reverse=True)
    

    best_match = scores[0]
    second_best = scores[1]

    if best_match["keyword_hits"] > 0:

        if best_match["total_score"] < second_best["total_score"] + 0.01:
            return DEFAULT_TTL
        return best_match["ttl_value"]

    else:
      
        is_score_too_low = best_match["similarity"] < SEMANTIC_FLOOR
        is_margin_too_close = (best_match["similarity"] - second_best["similarity"]) < MIN_MARGIN
        
        if is_score_too_low or is_margin_too_close:
            return DEFAULT_TTL
            
        return best_match["ttl_value"]


if __name__ == "__main__":
    for query in [
        "What is the current stock price of Tesla?",
        "What is the weather forecast for tomorrow morning?",
        "Explain how quicksort works",
        "Any breaking news right now?",
        "Can I take ibuprofen with beta blockers?",
        "Weather this weekend?",
        "When is my credit card bill due this month?",
        "glorble snarf zorp empirical",
    ]:
        print(f"{get_semantic_ttl(query):>9}  {query}")