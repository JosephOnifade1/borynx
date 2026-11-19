import type { LeadServiceKind } from "./lead-service-input";

type Environment = Readonly<Record<string, string | undefined>>;

/** No paid offers without an explicit opt-in. The sponsorship fee has no default. */
export function leadServicePrice(kind: LeadServiceKind, env: Environment = process.env): number | null {
  if (kind === "assisted_hire") return env.BORYNX_ASSISTED_HIRE === "1" ? 25_000 * 100 : null;
  const price = env.BORYNX_SPONSORED_LEAD_PRICE_NGN;
  return env.BORYNX_SPONSORED_LEADS === "1" && price && /^[1-9]\d{0,6}$/.test(price) ? Number(price) * 100 : null;
}
