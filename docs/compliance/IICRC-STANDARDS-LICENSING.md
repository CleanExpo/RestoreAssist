# Standards licensing: what AU and NZ law permits, and what the licences permit

**I am not a lawyer and this is not legal advice.** It is a structured brief: the
statutory provisions and the licence terms, quoted with their sources, set against
what this codebase actually does. It exists so a decision can be made on the facts
rather than on an impression, and so that if you do take advice, the questions are
already framed. Every conclusion below is a reading, not a ruling.

**Prepared:** 2026-08-31. **Sources:** the legislation itself and the licensors'
published terms, each linked inline.

## The trap this brief exists to avoid

Copyright and contract are different instruments and they give different answers.
The temptation is to reason "this is a small extract, fair dealing covers it" and
stop. That reasoning can be correct about copyright and still leave you in breach,
because **fair dealing is a defence to infringement, not a defence to breach of
contract.** A licensee who agreed not to do something has agreed not to do it,
whether or not copyright would have permitted it.

There are **three** instruments in play here and **two separate licensors**.

## 1. Copyright — what the law protects

### Australia: Copyright Act 1968 (Cth)

- **s 14** — doing an act in relation to a **substantial part** of a work is doing
  it in relation to the whole. Substantiality is assessed qualitatively, not just
  by word count; a short but distinctive passage can be substantial.
- **s 40** — fair dealing for **research or study**. s 40(2) lists the factors:
  purpose and character; nature of the work; **"the possibility of obtaining the
  work … within a reasonable time at an ordinary commercial price"**; effect on the
  potential market or value; and the amount and substantiality of the part taken.
- **s 41** — fair dealing for **criticism or review**, and it requires a
  *sufficient acknowledgement*.
- **s 41A** parody or satire; **s 42** reporting news; **s 43** reproduction for
  judicial proceedings or professional legal advice.

Australia has **no** general fair-use provision. The dealing must fit one of the
enumerated purposes.

### New Zealand: Copyright Act 1994

- **s 42** — fair dealing for **criticism, review and news reporting**, with
  sufficient acknowledgement.
- **s 43** — fair dealing for **research or private study**. s 43(3) lists factors
  that mirror Australia's, including **"(c) whether the work could have been
  obtained within a reasonable time at an ordinary commercial price"**. **s 43(4)**
  limits it to **one copy** of the same work on any one occasion.

New Zealand likewise has no fair use.

### The two points that matter most here

**Facts and citations are not the protected thing.** Copyright protects
expression. A standard's designation, its edition, its year, its section numbering
and a short section title are facts about a document, not the document's
expression. That is the line `scripts/check-no-verbatim-standards.ts` already
draws, and it is drawn in the right place. Nothing in this brief argues for
weakening the product's citations.

**Commercial availability cuts against fair dealing, and it is squarely against
us.** Both statutes make "could you have just bought it" an express factor, and
these standards are on sale: the IICRC subscription is USD 200 for all current and
historical standards, and AS-IICRC titles are sold individually by Standards
Australia. Copying instead of purchasing is the fact pattern that factor exists to
catch. A research-or-study argument over a purchasable standard starts from behind.

## 2. Contract — the IICRC

**IICRC Standards: AI Use Policy**, March 2026
(`iicrc.org/wp-content/uploads/2026/03/IICRC-Standards_AI-Use-Policy.pdf`):

> "IICRC prohibits the entry of its standards and related intellectual property
> (IP) into any form of artificial intelligence (AI) tools, such as ChatGPT.
> Additionally, creating derivatives of IICRC published and draft standards using
> AI is also prohibited. If a licensee violates this AI Use Policy, IICRC will
> suspend their access to its intellectual property, and further legal action will
> be considered."

> "For Standards Subscription Site and Webstore: Using Artificial Intelligence (AI)
> on IICRC standards and related intellectual property is prohibited. Violations
> will result in suspension of access."

The stated sanction is **suspension of access to the IP**. For an accredited CEC
provider that is not a takedown notice — it is the accreditation.

## 3. Contract — Standards Australia, and it is broader

This is the instrument most likely to be missed, because the AS-IICRC adoptions
are Standards Australia publications, not IICRC ones. A different licensor, with
its own terms.

**Standards Australia General Terms and Conditions, clause 3.3**
(`standards.org.au/legal/terms-and-conditions`):

> "**NO AI OR LLM USE** – For avoidance of doubt, an Account User must not and must
> not permit any other person to upload, input, transmit, make available or
> otherwise provide any Standards or Content of Standards Australia, in whole or in
> part, to any artificial intelligence, machine learning, generative AI, large
> language model or similar system, or use the Standards in the development,
> training, testing, fine-tuning, validation, optimisation or operation of any such
> system, including by permitting the Standards to be **ingested, indexed,
> embedded, tokenised**, learned from or otherwise analysed, whether directly or
> indirectly, automatically or incidentally, and whether using technologies now
> known or developed in the future, **without the prior written permission of
> Standards Australia**."

Read that against the vocabulary of this codebase. "Ingested, indexed, embedded,
tokenised" is not a general gesture at AI — it is a precise description of a
retrieval-augmented pipeline. `scripts/ingest-iicrc.ts` chunks, embeds and indexes;
`IicrcChunk` stores the embedding. The clause also reaches conduct that is
"indirectly, automatically or incidentally" done, which forecloses the argument
that an automated pipeline is different from a person pasting text.

Two further clauses worth having on the record:

- **cl 6.1(c)** — the Account User warrants it will not "bypass, circumvent,
  interfere with or defeat" access controls or DRM. Relevant because the licensed
  copies are held in a DRM reader; extracting text from it is the conduct this
  warranty covers.
- **cl 7.4(b)** — *"Australian Standards® and related publications are voluntary
  consensus documents. Unless expressly required by applicable law, regulation or
  contract, compliance with a Standard is voluntary."* This is the licensor's own
  statement, and it is why marketing copy must not say a standard is legally
  mandatory. It is also why "IICRC-compliant" is a claim about conformity that
  someone has to have actually assessed.

**"Without the prior written permission" is a door, not a wall.** Both licensors
allow consent. Asking is a real option and is probably the shortest path to an
architecture that is defensible rather than merely arguable.

## 4. Conditions the architecture must satisfy

Stated as rules, so they can be checked rather than remembered.

| # | Condition | Why |
|---|---|---|
| C1 | **Cite freely.** Designation, edition, year, section number, short section title. | Facts, not expression. Neither licence restricts citation, and both statutes protect only expression. |
| C2 | **Never reproduce standard prose** in the repository, the database, marketing, course material or generated output. | AU s 14 substantial part; commercial availability defeats the fair-dealing factors in AU s 40(2)(c) and NZ s 43(3)(c). |
| C3 | **Never pass standard text to a model** — not as prompt context, not for embedding, not for extraction, not for summarising. | IICRC AI Use Policy; Standards Australia cl 3.3, which names ingesting, indexing, embedding and tokenising expressly, and reaches incidental and automated conduct. |
| C4 | **Never create derivatives with AI** — no AI-authored summary, explainer, course module or video script produced *from* the standard's text. | Both policies prohibit AI-created derivatives by name. |
| C5 | **Do not extract from the DRM reader.** | Standards Australia cl 6.1(c); the licensed copies live in a VitalSource bookshelf. |
| C6 | **Do not claim a standard is legally mandatory**, or that work is "compliant", without naming the instrument that makes it so or the assessment that established it. | Standards Australia cl 7.4(b); and separately ACL s 18 / s 29(1)(a) and NZ FTA s 9 / s 13(a). |
| C7 | **Two licensors, not one.** Anything touching an AS-IICRC adoption is governed by Standards Australia's terms, which are broader than the IICRC's. | The AU adoptions are Standards Australia publications. |
| C8 | **Consent is available.** Both regimes permit prior written permission. If the product needs more than C1 allows, that is the route. | IICRC policy; Standards Australia cl 3.3. |

## 5. Where the codebase sits against these conditions

Assessed 2026-08-31; see `docs/findings/iicrc-standards-provenance.md` for the
evidence behind each.

| Surface | Condition | Position |
|---|---|---|
| `STANDARDS_VERSIONS`, `AS_IICRC_ADOPTIONS`, `standardCite()` | C1 | **Clear.** Designations, editions and years only. |
| `S500_SECTIONS`, `S520_SECTIONS` | C1 | **Clear on its face** — numbers and short titles. Their accuracy is a separate question. |
| `scripts/check-no-verbatim-standards.ts`, `copyright-guard.ts` | C2 | **Working as intended**, and the line is drawn in the right place. |
| `scripts/ingest-standards.ts` → `StandardsChunk` | C2, C3 | **In-house authored summaries, not standard text.** Zero rows. This is the compliant design and it was abandoned. |
| `scripts/ingest-iicrc.ts` → `IicrcChunk` | **C3** | **Squarely against C3 by description.** Chunks standard text, embeds it via a third-party model, indexes the vectors. Zero rows on production, so nothing has happened yet. `docs/runbooks/ra-6934-iicrc-rag-populate.md` is the procedure that would execute it. |
| `lib/standards-retrieval.ts` → `extract-standards-sections.ts` | **C3, C4** | **Against C3 and C4 by description.** Downloads standard documents and passes their text to a model, with a prompt asking for "the exact text". This is the path that is actually wired into report generation. It is inert only because the Drive folder is unreadable and the credentials are unset. |
| App-store listing, campaign copy, video scripts | **C6** | **Under review.** "IICRC-compliant" asserts a conformity nobody has assessed. |

## 6. What follows, and what does not

**This does not say a breach has occurred.** The two paths that meet C3 and C4 are
both dormant: `IicrcChunk` has zero rows and the Drive retrieval cannot read its
folder. Whether anything was ever run against them is a question for the owner, not
something this repository records.

**It does say the direction of travel is wrong.** RA-6934 is a written procedure to
populate the pipeline that C3 speaks to, and `scripts/ingest-standards.ts:9` already
notes that clause ingestion is *"blocked pending legal clearance (RA-1132)"*. These
two policies read as the answer to that question, and the answer is not yes.

**The compliant architecture already exists.** In-house authored guidance in
`StandardsChunk`, section numbers and titles in the `*-sections.ts` files, editions
in the registry, and the copyright guard on the output side. It was built, left
empty, and is being replaced by the non-compliant one. Reviving it is a smaller
change than defending the alternative.

## 7. Questions worth putting to a lawyer

Framed so they can be answered without re-deriving the background.

1. Does clause 3.3 of the Standards Australia GTCs bind the organisation on the
   facts — who accepted it, and on whose behalf?
2. Does an in-house authored *summary of topic areas*, written by a person who has
   read the standard, count as a "derivative … using AI" if any AI tool assisted
   the drafting? This is the question that decides whether `StandardsChunk` is a
   safe harbour or the same problem in a smaller font.
3. Does passing standard text to a model for **extraction only** — no output
   retained, no training — engage cl 3.3? The clause's "incidentally" and
   "operation of any such system" wording suggests yes.
4. What would prior written permission from each licensor realistically cover, and
   what would it cost to ask?
5. For CARSI specifically: does CEC provider accreditation carry obligations beyond
   the standard licence, and what is the exposure of an AI-assisted course module
   built from a standard? (Tracked as GP-536.)

## Limitations

Every statutory reference was read from the legislation; every licence term from
the licensor's published page, on the date above. Terms change — Standards
Australia GTC cl 9.1 reserves the right to vary them — so re-read before relying on
this. I have not read the IICRC subscription agreement itself, only the published AI
Use Policy; the subscription terms may say more. And, again: I am not a lawyer.
