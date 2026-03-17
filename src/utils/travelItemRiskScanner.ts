export interface RiskScanResult {
  riskLevel: 'LOW' | 'REVIEW' | 'BLOCKED';
  flags: string[];
}

const BLOCKED_KEYWORDS = [
  'weapon', 'weapons', 'gun', 'guns', 'firearm', 'firearms',
  'explosive', 'explosives', 'ammunition', 'ammo',
  'knife', 'knives', 'sword', 'dagger',
  'drugs', 'narcotics', 'cocaine', 'heroin', 'marijuana', 'cannabis',
];

const REVIEW_KEYWORDS = [
  'liquid', 'liquids',
  'battery', 'batteries', 'lithium',
  'cash', 'money', 'currency',
  'gold', 'silver',
  'jewelry', 'jewellery', 'diamond', 'diamonds',
  'passport', 'passports',
  'medicine', 'medicines', 'medication', 'pharmaceutical',
  'perfume', 'perfumes', 'cologne',
  'aerosol', 'aerosols', 'spray',
  'food', 'perishable', 'perishables',
  'powder', 'powders',
  'flammable', 'combustible',
  'chemical', 'chemicals',
  'tobacco', 'cigarette', 'cigarettes', 'vape',
  'alcohol', 'wine', 'beer', 'spirits',
];

export function scanTravelCourierItemRisk(declaredContents: string): RiskScanResult {
  const lower = declaredContents.toLowerCase();
  const flags: string[] = [];
  let riskLevel: 'LOW' | 'REVIEW' | 'BLOCKED' = 'LOW';

  for (const keyword of BLOCKED_KEYWORDS) {
    if (lower.includes(keyword)) {
      flags.push(keyword.toUpperCase());
      riskLevel = 'BLOCKED';
    }
  }

  if (riskLevel !== 'BLOCKED') {
    for (const keyword of REVIEW_KEYWORDS) {
      if (lower.includes(keyword)) {
        flags.push(keyword.toUpperCase());
        riskLevel = 'REVIEW';
      }
    }
  }

  return { riskLevel, flags };
}
