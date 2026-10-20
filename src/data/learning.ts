/**
 * Learning Center content. EDUCATIONAL — explains concepts in general terms.
 * It is not a source of current benefit amounts or payer rules; the rule library
 * and verified payer responses are.
 */

export interface Term {
  term: string;
  plain: string;
  atTheDesk: string;
  mistake: string;
}

export const GLOSSARY: Term[] = [
  { term: "Copay", plain: "A fixed dollar amount the plan says the patient pays for a specific kind of service, like $40 for a specialist visit.", atTheDesk: "Only collect a copay that was verified for this service and this setting.", mistake: "Using the office copay printed on the card for an ED visit, lab draw, or imaging study." },
  { term: "Deductible", plain: "The amount the patient pays each plan year before the plan starts sharing costs for services the deductible applies to.", atTheDesk: "A remaining deductible is not a copay. What the patient actually owes depends on the allowed amount for the service.", mistake: "Collecting the whole remaining deductible at check-in as if it were a copay." },
  { term: "Coinsurance", plain: "A percentage of the allowed amount the patient pays after the deductible, like 20%.", atTheDesk: "Coinsurance can only be estimated until the claim is processed, because it's a percentage of a number you don't have yet.", mistake: "Treating '20%' as a fixed fee, or calculating it on billed charges." },
  { term: "Out-of-pocket maximum", plain: "The most the patient pays in a plan year for covered in-network care. After it's met, the plan pays 100% of covered services.", atTheDesk: "If the remaining out-of-pocket is verified at $0, there is nothing to collect for covered services.", mistake: "Ignoring a met out-of-pocket maximum and collecting a copay anyway." },
  { term: "Allowed amount", plain: "The maximum the plan recognizes for a service — the contracted or fee-schedule rate. Patient cost-sharing is calculated from this.", atTheDesk: "Estimates use the facility's allowed-amount estimate, never the chargemaster price.", mistake: "Calculating the patient's share from billed charges." },
  { term: "Billed charges", plain: "The facility's list price for a service. Insurers almost never pay this amount.", atTheDesk: "Never compute a patient balance as billed charges minus insurance payments.", mistake: "Telling a patient they owe the difference between the charge and what insurance paid." },
  { term: "Primary, secondary, tertiary", plain: "The order in which plans process a claim. Each later plan looks at what the earlier ones did.", atTheDesk: "Order comes from coordination-of-benefits rules and the payers — not from card order, patient preference, or which copay is higher.", mistake: "Making the plan with the lower copay primary because it's easier for the patient." },
  { term: "Explanation of benefits (EOB / ERA)", plain: "The payer's statement of what it allowed, paid, adjusted, and left as patient responsibility on a claim.", atTheDesk: "After adjudication, the patient balance is the patient responsibility on the last payer's EOB.", mistake: "Quoting the primary EOB's patient responsibility when a secondary plan hasn't processed yet." },
  { term: "Eligibility verification", plain: "Confirming that coverage is active on the date of service, usually through a 270/271 transaction or the payer portal.", atTheDesk: "Record the source and time. Active coverage tells you the plan exists, not what the patient owes.", mistake: "Treating 'active' as 'benefits verified'." },
  { term: "Coordination of benefits (COB)", plain: "The rules that decide which plan pays first when a patient has more than one.", atTheDesk: "If COB isn't established with the payers, the claim can deny — confirm before collecting anything.", mistake: "Assuming the employee's own plan is always primary for a child (custody and birthday rules apply)." },
  { term: "Medicare and Medigap", plain: "Original Medicare (Parts A and B) pays first; a Medigap supplement pays some or all of the Medicare cost-sharing left over. Each Medigap letter covers different things.", atTheDesk: "There is no standard Medicare 'office copay.' With Plan G, the patient typically owes at most the remaining Part B deductible.", mistake: "Collecting a flat copay from a Medicare + Plan G patient." },
  { term: "Medicare Advantage", plain: "A private plan that replaces Original Medicare (Part C). It sets its own copays, networks, and authorization rules.", atTheDesk: "Verify the MA plan's own benefits. Original Medicare rules don't apply, and Medigap doesn't pay with MA.", mistake: "Applying Original Medicare's deductible and 20% coinsurance to an MA patient." },
  { term: "Medicaid", plain: "State-run coverage with very limited, state-set cost-sharing. Medicaid pays after all other coverage.", atTheDesk: "Many patients and services are exempt from Medicaid cost-sharing. QMB patients may not be billed Medicare cost-sharing at all.", mistake: "Collecting a Medicare deductible from a QMB patient, or putting Medicaid ahead of other insurance." },
  { term: "ED collection procedures", plain: "Federal law (EMTALA) requires a medical screening exam and any needed stabilizing treatment regardless of ability to pay.", atTheDesk: "Never ask about payment in a way that delays screening or treatment. Financial steps wait until after stabilization or discharge.", mistake: "Asking an ED patient for their copay before they've been seen." },
  { term: "Estimate vs. final liability", plain: "An estimate is a prediction made before the claim is processed. Final liability is what the EOB says after processing.", atTheDesk: "Label every estimate as an estimate. Follow facility policy on whether estimates may be collected.", mistake: "Recording an estimate as the patient's balance due." },
];

export interface Lesson {
  id: string;
  title: string;
  intro: string;
  steps: string[];
  collect: string;
  wait: string;
  escalate: string;
}

export const LESSONS: Lesson[] = [
  {
    id: "single",
    title: "One plan",
    intro: "Most encounters. The question is not 'what's on the card' but 'what does this plan say about this service, today'.",
    steps: [
      "Verify eligibility for the date of service and record the source.",
      "Confirm network status.",
      "Pull benefits for this service type and setting: copay, deductible, coinsurance, out-of-pocket remaining.",
      "Check for authorization or referral requirements.",
      "If a copay applies and is verified, collect it (less anything already collected). If the service runs through the deductible or coinsurance, it's an estimate.",
    ],
    collect: "A verified copay for this exact service and setting.",
    wait: "Deductible or coinsurance-only services when your facility doesn't collect estimates.",
    escalate: "Out-of-network, non-covered services, conflicting information, or amounts above the review threshold.",
  },
  {
    id: "dual",
    title: "Two plans",
    intro: "Two plans means one pays first and the other looks at what's left. The secondary may cover the primary's copay — so the copay you see may not be what the patient owes.",
    steps: [
      "Verify both plans are active on the date of service.",
      "Establish payer order from COB rules and the payers: employer vs. spouse plan, birthday rule for children, Medicare Secondary Payer questionnaire, Medicaid last.",
      "Check the primary plan's benefits for this service.",
      "Check whether the secondary covers the primary's cost-sharing.",
      "Don't add the two copays together, and don't collect the higher one. Unless your policy and verified benefits say otherwise, wait for adjudication.",
    ],
    collect: "Only when facility policy allows and the secondary is verified not to cover the primary's copay — and then only the primary's copay.",
    wait: "Most dual-coverage visits, until the secondary has processed.",
    escalate: "Payer order you can't confirm, Medicare with an employer plan and unclear MSP answers, or Medicaid listed ahead of other coverage.",
  },
  {
    id: "triple",
    title: "Three plans",
    intro: "Three plans process in sequence. Each payer works from the previous payer's EOB. Mistakes multiply here: a wrong order causes three denials, not one.",
    steps: [
      "Verify all three policies for the date of service.",
      "Confirm the full order of benefits with the payers.",
      "Bill the primary; then the secondary with the primary EOB; then the tertiary with both.",
      "The patient's balance is the patient responsibility on the tertiary's EOB — after contractual adjustments and every payer's processing.",
      "Watch for duplicate copays and double-counted deductibles across EOBs.",
    ],
    collect: "Only the adjudicated balance from the last payer's EOB.",
    wait: "Until every payer in the sequence has processed.",
    escalate: "Any unresolved order or missing EOB with three plans — always a supervisor case.",
  },
  {
    id: "medicare",
    title: "Medicare, Medigap, and Medicare Advantage",
    intro: "Original Medicare and Medicare Advantage look similar on a card and work completely differently at the desk.",
    steps: [
      "Identify which Medicare the patient has: Original Medicare (the Medicare card) or a Medicare Advantage plan (the private plan’s card).",
      "Original Medicare: cost-sharing is a deductible plus coinsurance on the approved amount — no standard copay.",
      "If there's a supplement, get the Medigap letter. Plan G generally covers Medicare cost-sharing except the Part B deductible. Other letters differ.",
      "If there's any other non-supplement coverage, complete the MSP questionnaire before deciding who pays first. Age alone never decides it.",
      "If the patient has Medicaid too, check for QMB. QMB patients may not be billed Medicare cost-sharing.",
    ],
    collect: "MA plan copays that are verified for the service. For Original Medicare, only per facility estimate policy.",
    wait: "Original Medicare + supplement visits, generally until Medicare and the supplement process.",
    escalate: "Unclear MSP answers, Medigap paired with Medicare Advantage, or a supplement with no active Original Medicare.",
  },
  {
    id: "ed",
    title: "Emergency department",
    intro: "In the ED, the order of operations is set by federal law: screening and stabilization first, money later.",
    steps: [
      "Quick-register the patient in a way that never delays the medical screening exam.",
      "Don't ask about payment, copays, or insurance in a way that could delay care. A missing card changes nothing about whether they're seen.",
      "Insurance verification can run in the background.",
      "After screening and stabilization (or at discharge), use the plan's emergency benefit — never the office copay.",
      "Out-of-network ED visits go to billing review; federal surprise-billing protections apply.",
    ],
    collect: "A verified ED copay after stabilization, if your facility collects in the ED.",
    wait: "Anything before screening and stabilization. Always.",
    escalate: "Out-of-network ED visits and any uncertainty about the emergency benefit.",
  },
];

export interface QuizQ {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export const QUIZ: QuizQ[] = [
  { q: "A patient has Original Medicare and Medigap Plan G and is here for an outpatient visit. Their Part B deductible status hasn't been verified. What do you do?", options: ["Collect the standard $40 specialist copay", "Collect the full Part B deductible", "Verify the remaining Part B deductible before collecting anything", "Collect nothing and never bill the patient"], answer: 2, why: "Plan G generally doesn't cover the Part B deductible, so the patient may owe part of it — but there's no standard copay, and you can't know the amount without verifying how much deductible remains." },
  { q: "A child is covered by both parents' employer plans. Mom's birthday is in March, Dad's in July. Which plan is primary?", options: ["Mom's — the birthday rule settles it", "Dad's — he's the subscriber who brought the child in", "Confirm with the payers; the birthday rule is common but custody orders and plan terms can change it", "Whichever has the lower copay"], answer: 2, why: "Many plans use the birthday rule, but divorce/custody arrangements and plan provisions can override it. Confirm COB with the payers instead of assuming." },
  { q: "A walk-in ED patient has no insurance card and is in pain. When do you discuss payment?", options: ["Before triage, so registration is complete", "After the medical screening exam and any stabilizing treatment", "Only if they mention insurance", "Before they leave the waiting room"], answer: 1, why: "EMTALA prohibits delaying screening or stabilizing treatment to inquire about payment or insurance." },
  { q: "The primary EOB shows $210 patient responsibility. The secondary hasn't processed yet. What does the patient owe?", options: ["$210", "Nothing, ever", "Not known yet — wait for the secondary to process", "$210 plus the secondary's copay"], answer: 2, why: "The secondary may pay some or all of that $210. The final balance is on the last payer's EOB." },
  { q: "A patient has $500 left on the deductible and 20% coinsurance. The facility estimates the allowed amount at $800. What's the estimate?", options: ["$500", "$560", "$660", "$800"], answer: 1, why: "$500 goes to the deductible. 20% of the remaining $300 is $60. $500 + $60 = $560 — and it's an estimate until the claim processes." },
  { q: "Two plans: primary copay $30, secondary copay $50. What do you collect at the desk by default?", options: ["$80", "$50", "$30", "Nothing until adjudication, unless policy and verified benefits say otherwise"], answer: 3, why: "Never add copays or take the higher one. The secondary may cover the primary's copay." },
  { q: "The Medicaid response shows QMB. Medicare's Part B deductible isn't met. What do you collect?", options: ["The remaining Part B deductible", "A $4 Medicaid copay", "Nothing — QMB patients may not be billed Medicare cost-sharing", "20% coinsurance"], answer: 2, why: "Federal law prohibits billing Qualified Medicare Beneficiaries for Medicare deductibles, coinsurance, and copays." },
  { q: "A 67-year-old still working at a company with 250 employees has Medicare and their employer plan. Who is primary?", options: ["Medicare, because they're over 65", "The employer plan — current employment with 20+ employees", "Whichever card they hand you first", "Medicaid"], answer: 1, why: "Under Medicare Secondary Payer rules for the working aged, the group health plan of an employer with 20+ employees pays first. Confirm with the MSP questionnaire." },
];
