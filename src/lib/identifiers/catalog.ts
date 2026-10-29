import { levenshtein, modelTokens, normalizeModel } from "@/lib/identifiers/checksums";

/**
 * Starter product catalogue (blueprint §5 "internal catalogue of normalized
 * model numbers"). This is an SG16-normalised dataset — NOT a manufacturer
 * feed — and the product module says so in every report it produces.
 */

export interface CatalogEntry {
  brand: string;
  model: string;
  family?: string;
  category: string;
  identifiers: { models: string[]; barcodePrefixes?: string[]; skuPattern?: string };
  specs: Record<string, string>;
  knownCounterfeitSignals: string[];
  officialUrl: string;
  source: string;
}

export const CATALOG_SEED: CatalogEntry[] = [
  {
    brand: "Apple", model: "iPhone 15 Pro Max", family: "iPhone 15", category: "Smartphone",
    identifiers: { models: ["A2849", "A3105", "A3106", "A3108", "A3110"], barcodePrefixes: ["194253", "194901"] },
    specs: { display: "6.7in OLED, 2796×1290, 120Hz ProMotion", chip: "Apple A17 Pro (3nm)",
      connector: "USB-C (USB 3, 10Gb/s on Pro models)", battery: "4441 mAh", weight: "221 g",
      materials: "Grade-5 titanium frame, ceramic shield front", biometrics: "Face ID (TrueDepth)" },
    knownCounterfeitSignals: [
      "iOS Settings → General → About shows the model as an A-number; clones often show a marketing name instead.",
      "A genuine unit answers on Apple's checkcoverage page with a purchase/warranty state; a copied IMEI usually returns 'invalid serial' or a different model.",
      "Android-based clones ship an App Store icon that opens a browser or a third-party store.",
      "Titanium-frame Pro models weigh 221 g — clones with steel frames are measurably heavier.",
      "The USB-C port on Pro models negotiates USB 3; clones stay at USB 2 speeds.",
    ],
    officialUrl: "https://support.apple.com/en-us/111832", source: "sg16-normalised",
  },
  {
    brand: "Apple", model: "iPhone 13", family: "iPhone 13", category: "Smartphone",
    identifiers: { models: ["A2482", "A2631", "A2633", "A2634", "A2635"], barcodePrefixes: ["194252"] },
    specs: { display: "6.1in OLED, 2532×1170, 60Hz", chip: "Apple A15 Bionic", connector: "Lightning",
      battery: "3240 mAh", weight: "174 g", biometrics: "Face ID (TrueDepth)" },
    knownCounterfeitSignals: [
      "Lightning port on clones frequently charges but never pairs with iTunes/Finder device trust.",
      "Display resolution reported by third-party apps below 2532×1170 indicates an LCD substitute panel.",
      "Single-camera clones mimic the twin-lens housing with one working sensor and one blank moulding.",
    ],
    officialUrl: "https://support.apple.com/en-us/111864", source: "sg16-normalised",
  },
  {
    brand: "Apple", model: "MacBook Air 13in (M3, 2024)", family: "MacBook Air", category: "Laptop",
    identifiers: { models: ["A3113", "MAC15,12"] },
    specs: { display: "13.6in Liquid Retina 2560×1664, 500 nits", chip: "Apple M3 (8-core CPU)",
      memory: "8/16/24 GB unified", storage: "256 GB – 2 TB NVMe", weight: "1.24 kg",
      ports: "2× Thunderbolt / USB 4, MagSafe 3, 3.5 mm", battery: "52.6 Wh" },
    knownCounterfeitSignals: [
      "Cloned shells are usually Windows ultrabooks with an edited 'About This Mac' screenshot; the serial will not resolve on checkcoverage.",
      "Fanless design — any audible fan under load means the unit is not an M-series Air.",
      "Genuine units expose Thunderbolt device trees in System Information; fakes show only USB 2/3 controllers.",
    ],
    officialUrl: "https://support.apple.com/en-us/117736", source: "sg16-normalised",
  },
  {
    brand: "Apple", model: "AirPods Pro (2nd generation, USB-C)", family: "AirPods Pro", category: "Audio accessory",
    identifiers: { models: ["A3047", "A3048", "A2968"] },
    specs: { chip: "Apple H2 (buds), U1/U2 in case", driver: "Custom high-excursion driver + amplifier",
      anc: "Adaptive EQ, Adaptive Transparency, Conversation Awareness", charging: "USB-C, MagSafe, Qi2, Apple Watch charger",
      ipRating: "IP54 buds and case", weight: "5.3 g per bud" },
    knownCounterfeitSignals: [
      "Fakes pair but never expose Firmware Version / Serial per-bud detail in iOS Settings → Bluetooth → (i).",
      "Genuine USB-C cases charge on an Apple Watch charger; clones do not.",
      "Vent mesh, hinge tolerance and the lanyard loop moulding differ measurably on clones.",
      "Adaptive Transparency with loud-noise attenuation is not reproducible on clone DSP — test with sudden noise.",
    ],
    officialUrl: "https://support.apple.com/en-us/108036", source: "sg16-normalised",
  },
  {
    brand: "Apple", model: "20W USB-C Power Adapter", family: "Apple chargers", category: "Charger",
    identifiers: { models: ["A2305", "MHJE3"], skuPattern: "^MHJE3" },
    specs: { output: "5V⎓3A / 9V⎓2.22A (20W PD 3.0)", connector: "USB-C female",
      markings: "Printed 'Designed by Apple in California', model A2305, regulatory marks CE/FCC/UKCA",
      weight: "≈58 g (US variant)" },
    knownCounterfeitSignals: [
      "Counterfeits commonly print A2305 but weigh 30–40 g because the internal PD controller and heatsink are absent.",
      "Genuine Apple adapters negotiate the 9V PDO — a USB-C tester that never shows 9V is not an Apple 20W adapter.",
      "Blurred, mis-spaced or silver-ink regulatory text and a missing pin-country marking are strong indicators.",
      "No serial is issued for this accessory, so 'serial verified' claims from a seller are meaningless.",
    ],
    officialUrl: "https://www.apple.com/shop/product/MHJE3AM/A/20w-usb-c-power-adapter", source: "sg16-normalised",
  },
  {
    brand: "Samsung", model: "Galaxy S24 Ultra", family: "Galaxy S24", category: "Smartphone",
    identifiers: { models: ["SM-S928B", "SM-S928B/DS", "SM-S928U", "SM-S928U1", "SM-S928W", "SM-S928N", "SM-S9280"] },
    specs: { display: "6.8in Dynamic AMOLED 2X, 3120×1440, 1–120Hz LTPO", chip: "Snapdragon 8 Gen 3 for Galaxy",
      camera: "200MP main, 12MP UW, 50MP 5× periscope, 10MP 3×", battery: "5000 mAh, 45W wired",
      build: "Titanium frame, Gorilla Armor, S Pen included", weight: "232 g" },
    knownCounterfeitSignals: [
      "Dial *#0*# on One UI — a genuine device opens the hidden test menu; clones show a normal dialler.",
      "Samsung Members / SmartThings device authentication fails on counterfeit hardware.",
      "Clones advertise '200MP' but report a 12–13MP sensor via Camera2 API probing apps.",
      "The S Pen on a clone is a passive stylus with no Bluetooth/Wacom digitiser response.",
      "SM-S928B/DS denotes dual-SIM EMEA; a US-market device claiming that suffix is mislabelled.",
    ],
    officialUrl: "https://www.samsung.com/global/galaxy/galaxy-s24-ultra/", source: "sg16-normalised",
  },
  {
    brand: "Samsung", model: "Galaxy A55 5G", family: "Galaxy A", category: "Smartphone",
    identifiers: { models: ["SM-A556B", "SM-A556B/DS", "SM-A556E", "SM-A5560"] },
    specs: { display: "6.6in Super AMOLED, 2340×1080, 120Hz", chip: "Exynos 1480",
      camera: "50MP main OIS, 12MP UW, 5MP macro", battery: "5000 mAh, 25W wired", weight: "213 g" },
    knownCounterfeitSignals: [
      "Mid-range models are the most cloned Samsung segment; check the Exynos 1480 CPU string in a hardware info app.",
      "A55 uses a metal frame — clones revert to plastic with a painted finish.",
      "25W charging only: a 'fast charger' box claiming 45W+ for this model is not Samsung packaging.",
    ],
    officialUrl: "https://www.samsung.com/global/galaxy/galaxy-a55-5g/", source: "sg16-normalised",
  },
  {
    brand: "Samsung", model: "25W USB-C Travel Adapter (EP-T2510)", family: "Samsung chargers", category: "Charger",
    identifiers: { models: ["EP-T2510", "EP-T2510NBEGWW", "EP-T2510X"] },
    specs: { output: "PPS/PD 3.0 up to 25W (5V⎓3A, 9V⎓2.77A)", connector: "USB-C female",
      markings: "Model EP-T2510, 'Samsung' logotype, input 100–240V~50/60Hz 0.7A" },
    knownCounterfeitSignals: [
      "PPS support is the differentiator: non-PPS clones still print EP-T2510 but never negotiate the 3.3–5.9V range.",
      "Genuine units are notably dense for their size; clones feel hollow and rattle.",
      "Samsung does not ship a cable with EP-T2510NBEGWW in every region — a 'free cable' claim is not proof either way.",
    ],
    officialUrl: "https://www.samsung.com/global/galaxy/accessories/", source: "sg16-normalised",
  },
  {
    brand: "Google", model: "Pixel 8 Pro", family: "Pixel 8", category: "Smartphone",
    identifiers: { models: ["GWG6C", "GZP1C"] },
    specs: { display: "6.7in LTPO OLED, 2992×1344, 1–120Hz", chip: "Google Tensor G3",
      camera: "50MP main, 48MP UW, 48MP 5× tele", battery: "5050 mAh, 30W wired", weight: "213 g",
      support: "7 years of OS and security updates from launch" },
    knownCounterfeitSignals: [
      "Genuine Pixels pass Google's device attestation (Play Integrity); clones fail basic integrity checks.",
      "Tensor G3 reports a specific CPU string; clones show MediaTek or Unisoc identifiers.",
      "Camera 'Best Take' / 'Magic Eraser' require the real Tensor pipeline and are absent on clones.",
    ],
    officialUrl: "https://store.google.com/product/pixel_8_pro", source: "sg16-normalised",
  },
  {
    brand: "Xiaomi", model: "Xiaomi 14", family: "Xiaomi 14", category: "Smartphone",
    identifiers: { models: ["23127PN0CC", "23127PN0CG"] },
    specs: { display: "6.36in AMOLED, 2670×1200, 1–120Hz", chip: "Snapdragon 8 Gen 3",
      camera: "50MP Light Fusion 900 + Leica Summilux optics", battery: "4610 mAh, 90W wired", weight: "193 g" },
    knownCounterfeitSignals: [
      "Global (…CG) and China (…CC) variants differ in band support and preinstalled software — a 'global ROM flashed' unit is not a factory global device.",
      "Leica co-branding on the camera island is laser-etched; printed badges rub off.",
      "90W HyperCharge requires the genuine 90W adapter; clones throttle around 18–27W.",
    ],
    officialUrl: "https://www.mi.com/global/product/xiaomi-14", source: "sg16-normalised",
  },
  {
    brand: "OnePlus", model: "OnePlus 12", family: "OnePlus 12", category: "Smartphone",
    identifiers: { models: ["CPH2573", "PHB110"] },
    specs: { display: "6.82in LTPO AMOLED, 3168×1440, 1–120Hz", chip: "Snapdragon 8 Gen 3",
      battery: "5400 mAh, 100W SUPERVOOC", weight: "220 g", camera: "50MP LYT-808 + 64MP periscope" },
    knownCounterfeitSignals: [
      "100W SUPERVOOC uses a proprietary handshake — a standard PD charger will never reach it, and neither will a clone.",
      "Alert-slider position and haptic motor quality differ on counterfeit shells.",
      "CPH2573 is the global model; PHB110 is China-only. Mismatch between box and Settings → About is a warning sign.",
    ],
    officialUrl: "https://www.oneplus.com/global/oneplus-12", source: "sg16-normalised",
  },
  {
    brand: "Dell", model: "XPS 15 (9530)", family: "XPS", category: "Laptop",
    identifiers: { models: ["9530", "XPS-9530"] },
    specs: { display: "15.6in FHD+ / 3.5K OLED", cpu: "Intel Core i5-13500H … i9-13900H",
      gpu: "Intel Iris Xe or NVIDIA GeForce RTX 4050/4060/4070", weight: "1.86–2.0 kg",
      ports: "2× Thunderbolt 4, 1× USB-C 3.2, 3.5 mm, microSD" },
    knownCounterfeitSignals: [
      "The Dell service tag on the base resolves to a configuration on Dell's support site; a fake tag returns nothing.",
      "CNC-machined aluminium + Gorilla Glass palm rest; clones use stamped plastic with a metallic film.",
      "OLED variants report a specific panel ID in the BIOS — mismatched panel strings indicate a swapped board.",
    ],
    officialUrl: "https://www.dell.com/support/home/en-us/product-support/product/xps-15-9530-laptop", source: "sg16-normalised",
  },
  {
    brand: "Lenovo", model: "ThinkPad X1 Carbon Gen 11", family: "ThinkPad X1", category: "Laptop",
    identifiers: { models: ["21CB", "21CC"] },
    specs: { display: "14in up to 2.8K OLED", cpu: "Intel Core i5-1335U … i7-1365U vPro",
      weight: "from 1.12 kg", chassis: "Carbon-fibre / magnesium, MIL-STD-810H tested",
      ports: "2× Thunderbolt 4, 2× USB-A, HDMI 2.1, 3.5 mm" },
    knownCounterfeitSignals: [
      "The serial (S/N) validates on Lenovo's warranty lookup and returns the exact machine type 21CB/21CC.",
      "Carbon-fibre lid has a distinctive weave and a specific TrackPoint cap feel; clones use ABS.",
      "Genuine units expose a TPM 2.0 attestation in Windows Device Security; clones frequently do not.",
    ],
    officialUrl: "https://pcsupport.lenovo.com/us/en/products/laptops-and-netbooks/thinkpad-x-series-laptops", source: "sg16-normalised",
  },
  {
    brand: "Sony", model: "WH-1000XM5", family: "1000X", category: "Audio accessory",
    identifiers: { models: ["WH1000XM5", "YY2944"] },
    specs: { drivers: "30mm carbon-fibre composite", anc: "8 microphones, dual processors QN1 + V1",
      battery: "30 h ANC on, 3 min charge = 3 h", weight: "250 g", codecs: "SBC, AAC, LDAC" },
    knownCounterfeitSignals: [
      "LDAC codec appears in Android developer options only for genuine units; clones fall back to SBC.",
      "The XM5 hinge is a silent, stepless slider — clones click or wobble.",
      "Sony | Headphones Connect app refuses to pair firmware updates with counterfeit hardware.",
      "250 g measured weight is a fast, reliable discriminator.",
    ],
    officialUrl: "https://www.sony.com/electronics/headband-headphones/wh-1000xm5", source: "sg16-normalised",
  },
  {
    brand: "Anker", model: "Nano 3 (30W, A2147)", family: "Anker Nano", category: "Charger",
    identifiers: { models: ["A2147", "A21473"] },
    specs: { output: "PD 3.0 + PPS up to 30W", connector: "USB-C female, folding pins",
      protection: "Anker MultiProtect: over-voltage, over-current, temperature control", weight: "≈36 g" },
    knownCounterfeitSignals: [
      "Clones print A2147 but omit the PPS 3.3–11V range in a protocol tester.",
      "Genuine Anker units carry a legible laser-etched model line, not pad-printed ink that scratches off.",
      "Anker's warranty lookup requires a purchase channel; 'Anker verified serial' claims on marketplaces are unverifiable.",
    ],
    officialUrl: "https://www.anker.com/products/a2147", source: "sg16-normalised",
  },
  {
    brand: "Dyson", model: "V15 Detect Absolute", family: "Dyson V15", category: "Home appliance",
    identifiers: { models: ["471184-01", "V15DETECT"] },
    specs: { motor: "Hyperdymium 125,000 rpm", runtime: "up to 60 min", dustbin: "0.77 L",
      features: "Piezo acoustic dust counting, green laser illumination, LCD particle report", weight: "3.08 kg" },
    knownCounterfeitSignals: [
      "The LCD particle count graph is unique to V15 Detect; clones with a fake LCD show static bars.",
      "Serial number on the handle/motor body validates through Dyson's warranty registration.",
      "Genuine cyclone stack has 14 cones with tight tolerances — clones have moulded decorative cones.",
    ],
    officialUrl: "https://www.dyson.com/vacuum-cleaners/sticks/v15", source: "sg16-normalised",
  },
  {
    brand: "Nike", model: "Air Jordan 1 Retro High OG", family: "Jordan 1", category: "Footwear / apparel",
    identifiers: { models: [], skuPattern: "^[0-9]{6}-[0-9]{3}$" },
    specs: { skuFormat: "Six digits, hyphen, three digits (e.g. 555088-134)",
      sizing: "US / CM / EUR / UK block printed on the size label", materials: "Full-grain leather upper, Air-Sole unit" },
    knownCounterfeitSignals: [
      "The SKU on the size label must match the SKU on the box label exactly — mismatch is the most common tell.",
      "Genuine pairs have consistent, tight stitching with 8–9 stitches per inch on the Swoosh outline.",
      "The 'Nike Air' tongue tag font and the shape of the hourglass silhouette from the back differ on replicas.",
      "UPC/EAN on the box resolves to the correct colourway; cloned boxes reuse a valid barcode from another colourway.",
      "Odour, glue staining inside the vamp and a rigid sole unit indicate factory-replica production.",
    ],
    officialUrl: "https://www.nike.com/jordan", source: "sg16-normalised",
  },
  {
    brand: "Apple", model: "MagSafe Charger (1st gen)", family: "Apple accessories", category: "Charger",
    identifiers: { models: ["A2140", "MHXH3"] },
    specs: { output: "15W MagSafe, 7.5W Qi fallback", cable: "Integrated 1 m braided USB-C",
      markings: "'Designed by Apple in California', model A2140" },
    knownCounterfeitSignals: [
      "Clones charge at 5–7.5W but never trigger the 15W MagSafe animation ring on iPhone 12 and later.",
      "The magnet array on genuine units is a 16-magnet ring plus alignment magnet; clones use a single disc.",
      "Braided cable weave and the moulded strain relief are common failure points on counterfeits.",
    ],
    officialUrl: "https://support.apple.com/en-us/HT211918", source: "sg16-normalised",
  },
];

export interface CatalogMatch {
  entry: CatalogEntry;
  score: number;
  matchedOn: string[];
}

export function matchCatalog(query: string, entries: CatalogEntry[], limit = 5): CatalogMatch[] {
  const norm = normalizeModel(query);
  const tokens = modelTokens(query);
  const lower = query.toLowerCase();
  const matches: CatalogMatch[] = [];

  for (const entry of entries) {
    const reasons: string[] = [];
    let score = 0;

    const brandHit = lower.includes(entry.brand.toLowerCase());
    if (brandHit) { score += 0.5; reasons.push(`brand term "${entry.brand}"`); }

    for (const code of entry.identifiers.models) {
      const codeNorm = normalizeModel(code);
      if (codeNorm && norm && (norm === codeNorm || norm.includes(codeNorm) || codeNorm.includes(norm))) {
        score += 1.6;
        reasons.push(`exact/contained model code "${code}"`);
        continue;
      }
      const shared = tokens.filter((t) => codeNorm.includes(t) && t.length >= 4);
      if (shared.length) {
        score += 0.45 * Math.min(shared.length, 2);
        reasons.push(`model fragment "${shared[0]}"`);
      }
      const distance = levenshtein(norm, codeNorm);
      if (norm.length > 4 && distance <= 2) {
        score += 1.1 - distance * 0.3;
        reasons.push(`near-match to "${code}" (edit distance ${distance})`);
      }
    }

    const modelNorm = normalizeModel(entry.model);
    if (modelNorm && (norm.includes(modelNorm) || modelNorm.includes(norm))) {
      score += 1.2;
      reasons.push(`marketing model name "${entry.model}"`);
    } else {
      const words = entry.model.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
      const hits = words.filter((w) => lower.includes(w));
      if (hits.length >= 2) {
        score += 0.35 * hits.length;
        reasons.push(`model words ${hits.map((h) => `"${h}"`).join(", ")}`);
      }
    }

    if (entry.family && lower.includes(entry.family.toLowerCase())) {
      score += 0.3;
      reasons.push(`family "${entry.family}"`);
    }
    if (entry.identifiers.skuPattern && new RegExp(entry.identifiers.skuPattern, "i").test(query)) {
      score += 1.3;
      reasons.push("SKU format matches the manufacturer pattern");
    }
    if (entry.identifiers.barcodePrefixes?.some((p) => query.replace(/\D/g, "").startsWith(p))) {
      score += 0.8;
      reasons.push("GTIN company prefix matches the brand's GS1 allocation");
    }

    if (score > 0.55) matches.push({ entry, score: Math.min(2.6, score), matchedOn: [...new Set(reasons)] });
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}
