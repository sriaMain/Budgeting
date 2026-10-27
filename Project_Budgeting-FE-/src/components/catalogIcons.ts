import {
  Bot, Boxes, Briefcase, Cloud, Code, Cpu, Database, Globe, KeyRound, Laptop, Layers, Lightbulb, Package,
  Palette, Plug, Server, Smartphone, Workflow, Wrench, type LucideIcon,
} from 'lucide-react';

/** Icon keys a category can store (ProductGroup.icon). */
export const CATALOG_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  globe: { icon: Globe, label: 'Web' },
  code: { icon: Code, label: 'Code' },
  smartphone: { icon: Smartphone, label: 'Mobile' },
  bot: { icon: Bot, label: 'AI / Bot' },
  cpu: { icon: Cpu, label: 'Automation' },
  database: { icon: Database, label: 'SAP / Data' },
  boxes: { icon: Boxes, label: 'Odoo / Modules' },
  workflow: { icon: Workflow, label: 'CRM / ERP' },
  cloud: { icon: Cloud, label: 'Cloud' },
  server: { icon: Server, label: 'Hosting' },
  palette: { icon: Palette, label: 'Design' },
  lightbulb: { icon: Lightbulb, label: 'Consulting' },
  wrench: { icon: Wrench, label: 'Support' },
  plug: { icon: Plug, label: 'Integration' },
  briefcase: { icon: Briefcase, label: 'Business' },
  layers: { icon: Layers, label: 'Platform' },
  laptop: { icon: Laptop, label: 'Hardware' },
  key: { icon: KeyRound, label: 'Licence' },
  package: { icon: Package, label: 'Product' },
};

// Used when a category has no icon chosen: first keyword found in the category / item name wins.
const KEYWORDS: [RegExp, string][] = [
  [/\b(ai|chatbot|bot|automation|ml)\b/i, 'bot'],
  [/sap/i, 'database'],
  [/odoo/i, 'boxes'],
  [/crm|erp/i, 'workflow'],
  [/mobile|android|ios|app\b/i, 'smartphone'],
  [/cloud|devops|aws|azure/i, 'cloud'],
  [/hosting|server/i, 'server'],
  [/ui|ux|design/i, 'palette'],
  [/consult/i, 'lightbulb'],
  [/support|maintenance|amc/i, 'wrench'],
  [/api|integration/i, 'plug'],
  [/web|site/i, 'globe'],
  [/licen[cs]e|subscription/i, 'key'],
  [/laptop|hardware|device/i, 'laptop'],
];

export function resolveCatalogIcon(iconKey?: string | null, ...names: (string | null | undefined)[]): LucideIcon {
  if (iconKey && CATALOG_ICONS[iconKey]) return CATALOG_ICONS[iconKey].icon;
  const text = names.filter(Boolean).join(' ');
  const hit = KEYWORDS.find(([re]) => re.test(text));
  return hit ? CATALOG_ICONS[hit[1]].icon : Package;
}
