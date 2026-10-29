import type { VerificationCategory } from "@/lib/types";

/**
 * Signal lexicons used by the deterministic rules engine.
 * Weights are deliberately modest: they move confidence, never decide a verdict
 * on their own, and each match is reported as a *finding* with its own wording.
 */

export interface Signal {
  re: RegExp;
  label: string;
  weight: number;
  why: string;
}

export const SCAM_SIGNALS: Signal[] = [
  { re: /\b(act now|immediately|urgent(ly)?|final notice|last (chance|warning)|don'?t delay|hurry)\b/i, label: "Manufactured urgency", weight: 0.18, why: "Pressure to act before you can think or check is the single most reliable scam indicator." },
  { re: /\b(account (will be )?(suspended|closed|locked|blocked)|verify your (account|identity)|unusual (activity|sign[\s-]?in))\b/i, label: "Account-threat pretext", weight: 0.22, why: "Legitimate providers do not threaten suspension in unsolicited messages to collect credentials." },
  { re: /\b(click (here|the link|below)|tap (here|the link)|log ?in (here|now)|confirm (here|now))\b/i, label: "Direct credential click-through", weight: 0.12, why: "Unsolicited messages that route you to a login page are the standard phishing pattern." },
  { re: /\b(gift ?card|itunes card|steam wallet|google play card|paysafecard|western union|money ?gram|wire transfer)\b/i, label: "Irreversible / untraceable payment method", weight: 0.3, why: "No legitimate retailer, bank or government body settles with gift cards or irreversible remittance." },
  { re: /\b(bitcoin|btc|usdt|crypto(wallet)?|binance pay|metamask)\b/i, label: "Cryptocurrency settlement requested", weight: 0.2, why: "Crypto payments are irreversible and favoured by fraud operations." },
  { re: /\b(you (have )?(won|been selected|are (a )?winner)|congratulations|prize|lottery|sweepstakes|claim your reward|lucky (visitor|user)|spin (the )?wheel)\b/i, label: "Unsolicited prize / reward", weight: 0.26, why: "A prize you never entered for is a harvesting mechanism, not a windfall." },
  { re: /\b(100% (free|guaranteed|original|genuine)|risk[\s-]?free|no questions asked|guaranteed (delivery|pass|approval))\b/i, label: "Absolute guarantee language", weight: 0.16, why: "Absolute guarantees are unverifiable by construction." },
  { re: /\b(up to \d{2,3}% off|\d{2}%[-\s]?off|lowest price (ever|guaranteed)|unbeatable|clearance (sale )?(ends|today)|price (mistake|error))\b/i, label: "Implausible discount", weight: 0.18, why: "Discounts far below wholesale cost are the bait in fake-shop and card-harvesting operations." },
  { re: /\b(remaining stock|only \d+ (left|items|units)|\d+ people (are )?(viewing|bought)|ends in|timer|countdown)\b/i, label: "Scarcity / countdown pressure", weight: 0.12, why: "Artificial scarcity suppresses comparison shopping." },
  { re: /\b(dear (customer|user|sir|madam|valued)|attention (customer|user)|hi dear|hello dear)\b/i, label: "Generic non-personal greeting", weight: 0.08, why: "Organisations that hold your account data address you by name." },
  { re: /\b(refund|reimburse|compensation|delivery (fee|charge) (of )?(\$|€|£)?\d)\b/i, label: "Refund / small-fee pretext", weight: 0.14, why: "Refund fraud and parcel-fee scams both start with a small amount to capture card details." },
  { re: /\b(otp|one[\s-]?time (password|code)|verification code|share the code)\b/i, label: "Requests a one-time code", weight: 0.3, why: "A one-time code is a login. No legitimate party ever needs you to read it out." },
  { re: /\b(remote (access|desktop)|anydesk|teamviewer|quick support|install (this )?app)\b/i, label: "Requests remote-access software", weight: 0.28, why: "Remote-access tools are used to move funds and install malware during support scams." },
  { re: /\b(customs|duty|clearance) (fee|charge|payment)\b/i, label: "Customs / duty fee demand", weight: 0.2, why: "Parcel interception scams invent customs charges for goods already paid for." },
  { re: /\b(work (from home|at home)|earn (\$|€|£)?\d{3,}|part[\s-]?time job|daily (payment|income)|no experience)\b/i, label: "Recruitment / task scam framing", weight: 0.2, why: "Task and recruitment scams pay small amounts first, then require deposits." },
  { re: /\b(investment|trading) (group|signal|guaranteed)|\b\d+% (daily|weekly|monthly) (return|profit)\b/i, label: "Guaranteed-return investment", weight: 0.32, why: "A stated guaranteed return is the defining feature of investment fraud." },
  { re: /\b(whatsapp|telegram|signal|wechat)\b/i, label: "Moves the conversation to an encrypted app", weight: 0.12, why: "Migrating off-platform removes marketplace protection and evidence." },
  { re: /\b(seo\b|copy ?of|replica|1:1|aaa quality|mirror quality|original quality (box|packaging))\b/i, label: "Counterfeit-grade marketing language", weight: 0.3, why: "\"1:1\", \"AAA\" and \"mirror quality\" are trade terms for counterfeit goods." },
];

export const IMPERSONATED_BRANDS = [
  "apple", "iphone", "icloud", "samsung", "google", "gmail", "microsoft", "outlook", "windows",
  "amazon", "amzn", "ebay", "etsy", "aliexpress", "alibaba", "temu", "shein", "walmart", "costco",
  "paypal", "stripe", "netflix", "spotify", "whatsapp", "instagram", "facebook", "meta", "tiktok",
  "youtube", "linkedin", "twitter", "x", "dhl", "fedex", "ups", "usps", "royal mail", "evri", "dpd",
  "hsbc", "barclays", "lloyds", "natwest", "santander", "revolut", "monzo", "wise", "chase",
  "bank of america", "wells fargo", "citibank", "capital one", "commonwealth bank", "anz", "nab",
  "westpac", "sbi", "hdfc", "icici", "m-pesa", "glovo", "uber", "deliveroo", "just eat", "coinbase",
  "binance", "kraken", "gov", "hmrc", "irs", "inland revenue", "social security", "medicare",
  "nike", "adidas", "gucci", "louis vuitton", "rolex", "dyson", "sony", "playstation", "xbox",
  "nintendo", "dell", "hp", "lenovo", "asus", "acer", "xiaomi", "oneplus", "oppo", "vivo",
  "huawei", "honor", "realme", "tecno", "infinix", "transsion", "nokia", "motorola", "google pixel",
  "intel", "amd", "nvidia", "qualcomm", "mediatek", "anker", "jbl", "bose", "sonos", "lg", "hisense",
];

/** Brands named in free text as whole words — "x" is not in "tax", "chase" not in "purchase". */
export function brandsInText(text: string): string[] {
  const lower = text.toLowerCase();
  return IMPERSONATED_BRANDS.filter((b) => {
    const pattern = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s-]+/g, "[\\s-]?");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${pattern}($|[^\\p{L}\\p{N}])`, "u").test(lower);
  });
}

export const URL_SCAM_SIGNALS: Signal[] = [
  { re: /(?:^|\.)?(?:secure|login|signin|verify|account|billing|payment|update|confirm|auth|secure\d*)[.-]/i, label: "Trust-word subdomain", weight: 0.16, why: "Attackers prepend \"secure\", \"login\" or \"verify\" to unrelated domains to look official." },
  { re: /-\d{2,}\.|\.php$|\/wp-content\/(?:uploads|plugins)\//i, label: "Compromised-site hosting pattern", weight: 0.14, why: "Phishing kits are frequently dropped into the upload folders of hijacked WordPress sites." },
  { re: /%[0-9a-f]{2}/i, label: "Percent-encoded path", weight: 0.08, why: "Encoding hides the real path from the reader." },
  { re: /(?:^|[./_?&=-])(?:login|signin|verify|secure|account|password|credential)(?:[./_?&=-]|$)/i, label: "Credential-harvesting path vocabulary", weight: 0.14, why: "Paths built around login/verify language indicate a credential capture page." },
  { re: /https?:\/\/\d{1,3}(?:\.\d{1,3}){3}/i, label: "Bare IP address instead of a domain", weight: 0.3, why: "Legitimate consumer services do not serve from a bare IP: there is no registration trail to trace." },
  { re: /(xn--)/i, label: "Punycode / internationalised domain", weight: 0.2, why: "Punycode lets a domain render as a familiar brand name using look-alike characters." },
];

export const CLAIM_HEDGES: Signal[] = [
  { re: /\b(may|might|could|possibly|perhaps|reportedly|allegedly|said to|believed to|rumou?red)\b/i, label: "Hedged attribution", weight: 0.05, why: "Hedging signals that the author does not hold primary evidence." },
  { re: /\b(always|never|all|every|none|100%|0%|no one|everyone)\b/i, label: "Absolute quantifier", weight: 0.12, why: "Universal quantifiers are almost always falsifiable by a single counter-example." },
  { re: /\b(studies show|scientists say|experts agree|research proves|it is proven|evidence shows)\b/i, label: "Unnamed authority", weight: 0.14, why: "Citing \"studies\" without naming one prevents the reader from checking the source." },
  { re: /\b(causes?|leads to|results in|makes you|cures?|prevents)\b/i, label: "Causal assertion", weight: 0.1, why: "Causal claims require stronger evidence than correlation or anecdote." },
  { re: /\b(\d+(\.\d+)?%|\b\d[\d,]*\b (million|billion|people|cases|deaths))\b/i, label: "Numeric claim", weight: 0.08, why: "Numbers need a stated denominator, date and source." },
  { re: /\b(banned|censored|mainstream media won'?t|they don'?t want you to know|suppressed|cover[\s-]?up)\b/i, label: "Suppression narrative", weight: 0.18, why: "\"Hidden truth\" framing pre-emptively discredits any contrary evidence." },
  { re: /\b(shocking|unbelievable|viral|exposed|leaked|breaking)\b/i, label: "Emotional amplification", weight: 0.1, why: "Emotive framing is optimised for sharing, not accuracy." },
  { re: /\b(as of today|just announced|breaking|this morning|tonight)\b/i, label: "Immediacy framing", weight: 0.06, why: "Very recent events usually have thin sourcing; treat early reports as provisional." },
];

export const OUT_OF_CONTEXT_SIGNALS: Signal[] = [
  { re: /\b(\d{4}) (video|photo|image|footage|clip)\b/i,
    label: "Explicit year attached to media", weight: 0.1, why: "Attaching a year to media often means an older asset is being re-presented as new." },
  { re: /\b(old|archived|years ago|back in|remember when|again)\b/i,
    label: "Recycled-content wording", weight: 0.12, why: "Reused media is the most common form of misleading content, ahead of fabrication." },
];

export const PRODUCT_CATEGORY_RULES: Array<{ re: RegExp; category: VerificationCategory }> = [
  { re: /\b(fake news|fact ?check|hoax|misinformation|disinformation|viral (post|claim)|rumou?r)\b/i, category: "claim" },
  { re: /\b(scam|phishing|fraud|fraudulent|suspicious (site|link|email)|malware)\b/i, category: "website" },
  { re: /\b(imei|gtin|ean|upc|barcode|model (number|no)|serial (number|no)|counterfeit|original or fake)\b/i, category: "product" },
  { re: /\b(ai[\s-]?generated|deepfake|photoshop(ped)?|manipulated|edited image|c2pa|content credentials)\b/i, category: "media" },
];

export const HIGH_TRUST_SUFFIXES = [
  ".gov", ".mil", ".int", ".edu", ".ac.uk", ".nhs.uk", ".go.jp", ".gouv.fr", ".gov.au", ".gc.ca",
];
