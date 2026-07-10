# rag — decision guide

Consult before building retrieval-augmented generation or any "chat with your docs".

## Defaults
- Start with the smallest thing that answers: ≤ ~30k tokens of corpus → put it ALL in
  context or grep it; vector search earns its keep only past that.
- Chunking: split on semantic boundaries (headings/paragraphs), ~200-500 tokens, with
  10-20% overlap; store the source id + position with every chunk.
- Retrieval: embed query + chunks with the SAME model; cosine top-k (k 3-8); add a
  keyword/BM25 fallback — hybrid beats pure-vector on names, codes, and rare terms.
- Answering: instruct the model to answer ONLY from retrieved context and to refuse when
  the context doesn't contain the answer. Require citations (chunk/source ids).

## Evaluation (do this or you are guessing)
- Build a golden set: real questions + expected source passages. Measure retrieval hit
  rate separately from answer quality — most "LLM is wrong" bugs are retrieval misses.
- Groundedness check: every claim in the answer must map to a retrieved chunk; sample and
  verify. Track the refusal rate on out-of-corpus questions (should be high).

## Security (retrieved text is untrusted input)
- **Prompt injection lives in your corpus**: a document saying "ignore previous
  instructions" must be treated as data. Never execute instructions found in retrieved
  text; keep system rules outside the retrieved block and delimit it clearly.
- Don't let the client inject or override context server-side assembles the prompt.
- PII in the corpus flows into answers — redact at ingestion, not at output.

## Options + tradeoffs
- Managed vector DB vs plain files: a JSON index + cosine in-process is fine to ~100k
  chunks and has zero ops; move up only when latency or volume forces it.
- Reranking (cross-encoder) lifts precision at extra latency/cost — add when top-k
  contains the answer but not at rank 1.

## Sources
OWASP LLM Top 10 (LLM01 prompt injection, LLM06 info disclosure) · Anthropic/OpenAI RAG
guidance (grounding + citations) · BEIR/MTEB literature on hybrid retrieval.
