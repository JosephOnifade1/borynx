# Borynx monetization: test a buyer-paid shortlist

**Sell an optional hiring service, not access to a pitch or the winner.** Keep posting, applying, awarding, and private kickoff free. Start with **Assisted Hire**: help a buyer turn a brief into a clear scope and send 2–3 relevant, available freelancers with portfolio examples and budget fit. A shortlist is the deliverable; don’t guarantee a hire. Freelancers pay nothing and aren’t ranked by payment.

## Run the first pilot by hand

1. **Pick one narrow market.** For example, invite Nigerian startup teams hiring for a small, fixed-scope technical project. Start with the specialty where Borynx already has enough available freelancers. Recruit 5–10 qualified buyers with an actual brief, budget, and timeline, not just waitlist signups.
2. **Offer one transparent flat fee.** For example, try **₦25,000 per assisted brief** if operating in Nigeria. That is a test price, not market data: adjust it to cover the time to vet and contact candidates, payment costs, and expected refunds. Quote a delivery window you can meet (e.g. two business days), and refund if you cannot deliver the agreed shortlist. Explain up front that the fee buys the service, is separate from the project budget, and does not pay or hold money for the freelancer.
3. **Use an invoice or a hosted payment link for the service.** Once the external-pilot gate is cleared, invite buyers manually. Log offer, payment confirmation, promised/delivered dates, refund, time spent, and the lead reference in a limited-access operations tracker. Ask shortlisted freelancers for consent before sharing an introduction. Use Borynx’s normal award and kickoff process; don’t require a fee to acknowledge kickoff or to finish a lead.
4. **Decide based on money and delivery.** Track paid briefs / qualified offers, on-time shortlist rate, awards, starts confirmed by both parties, repeat buyers, refunds, and contribution per assisted brief (service revenue minus refunds, provider fees and delivery labour). A directional first gate could be at least 3 of 10 qualified buyers paying and positive contribution on fulfilled briefs. An award or acknowledgment is a funnel metric, not proof of a paid start.

## Automate only after buyers pay and delivery is repeatable

- Add an optional **Request a curated shortlist** action on the buyer’s lead or after submission; show the price, deliverable, turnaround, and refund terms. Never gate a normal award or kickoff on this service.
- Keep private `assisted_hire_orders` separate from `leads`: buyer and lead IDs, server-set amount in minor units, currency, provider reference, payment state, delivery state, and timestamps. Use a hosted checkout for Borynx’s fee only. Store no card details.
- Create orders and checkout sessions server-side for the lead owner. A signed, verified provider webhook (not the success redirect) confirms payment against the expected order, amount and currency. Process provider event IDs idempotently and keep refund/reconciliation records. Send paid orders to a scoped staff work queue and provide the buyer a private receipt and delivery status. Never mark a lead paid, awarded, or completed from a billing event.
- If repeat employers ask for recurring hiring help, test buyer-side bundles or a team subscription next. Defer platform commissions and escrow until there is repeat transaction volume and a credible payouts, disputes, compliance, and support plan. Do not start with proposal credits or pay-to-rank placement.

This is a proposal, not billing code. Clear the [verified sign-in and staging gates](./MARKETPLACE_PHASE_3.md), review demo access and database isolation, and assign a reviewer before using real buyers, email, or money.
