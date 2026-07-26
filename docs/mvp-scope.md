# RecChat MVP Scope

## 1. Product Summary

RecChat is a public-facing conversational application that allows users to interact with source-grounded simulations of historical personalities.

The MVP will begin with **Mahatma Gandhi** as the first personality.

The system will answer questions using a curated set of primary and authoritative historical sources. It will clearly distinguish between:

* views directly documented in historical sources;
* interpretations synthesized from multiple sources;
* cautious extrapolations about modern topics;
* questions for which there is insufficient evidence.

The goal is not to imitate Gandhi perfectly or claim that the user is speaking to the historical person directly. The goal is to provide a trustworthy, citation-backed conversational experience.

---

## 2. MVP Objective

The MVP should demonstrate that the system can:

1. ingest a small curated historical corpus;
2. retrieve relevant passages for a user question;
3. generate a grounded answer from those passages;
4. cite the sources used;
5. avoid inventing quotations or unsupported opinions;
6. clearly label modern extrapolations;
7. provide an “insufficient evidence” response when the corpus does not support an answer;
8. expose the experience through a simple public web interface.

---

## 3. Initial Personality

### Mahatma Gandhi

Gandhi is the first personality because:

* he has a large body of primary-source material;
* his views span politics, ethics, religion, economics, social reform, and nonviolence;
* users can ask both historical and modern questions;
* his writings provide a strong test of source grounding;
* his ideas are frequently simplified or misquoted, making citation quality important.

---

## 4. Initial Corpus

The first corpus will contain approximately **10–20 carefully selected documents**.

Preferred source types:

* books written by Gandhi;
* speeches;
* letters;
* essays;
* articles from journals such as *Young India* and *Harijan*;
* authoritative archival collections;
* reputable historical sources used only for context.

Primary sources should be preferred over secondary sources whenever available.

Every source must include:

* title;
* author;
* publication date;
* source type;
* primary or secondary classification;
* original URL or archive location;
* rights status;
* page or section information;
* ingestion date.

---

## 5. Core User Experience

The user should be able to:

1. open the RecChat website;
2. view Gandhi as the available historical personality;
3. read a short explanation of how the simulation works;
4. select one of several suggested questions or type their own;
5. receive a response grounded in retrieved sources;
6. view citations beneath the response;
7. expand each citation to read the supporting excerpt;
8. see whether the answer is direct, synthesized, extrapolated, or unsupported;
9. provide simple thumbs-up or thumbs-down feedback.

---

## 6. Response Categories

Every response should be assigned one of four support levels.

### Directly Supported

The retrieved sources explicitly discuss the user’s question.

Example:

> What did Gandhi believe about nonviolence?

### Synthesized

The answer combines multiple documented views, but no single source answers the complete question directly.

Example:

> How did Gandhi connect self-discipline with political leadership?

### Modern Extrapolation

The question concerns something Gandhi did not encounter. The answer should:

1. acknowledge that the topic is modern;
2. identify relevant documented principles;
3. provide a cautious inference;
4. clearly label that inference as an extrapolation.

Example:

> What might Gandhi think about social media?

### Insufficient Evidence

The corpus does not provide enough reliable evidence to answer confidently.

Example:

> What was Gandhi’s favorite fictional novel?

The system should not guess.

---

## 7. Functional Requirements

The MVP must include:

* one historical personality;
* text chat;
* English-language input and output;
* a curated document corpus;
* document ingestion;
* chunking and embeddings;
* vector retrieval;
* metadata filtering by personality;
* grounded answer generation;
* visible citations;
* source excerpts;
* answer support labels;
* basic conversation history;
* a health-check endpoint;
* a simple frontend;
* a FastAPI backend;
* basic feedback collection;
* anonymous rate limiting before public launch;
* a small evaluation dataset.

---

## 8. Technical Scope

The MVP will use:

* **Next.js** for the frontend;
* **FastAPI** for the backend;
* **Supabase PostgreSQL** for structured data;
* **pgvector** for vector search;
* **Supabase Storage** for source documents;
* **OpenAI embeddings** for document and query embeddings;
* **OpenAI generation models** for answer generation;
* **Vercel** for frontend hosting;
* **Render** or a similar low-cost service for backend hosting.

The first version will use a modular monolith rather than microservices.

---

## 9. Non-Goals

The MVP will not include:

* multiple historical personalities;
* voice cloning;
* generated video or animated avatars;
* multilingual support;
* user accounts;
* payments;
* mobile applications;
* autonomous agents;
* live web search;
* fine-tuned persona models;
* long-term user memory;
* social sharing;
* personality comparison mode;
* complex admin dashboards;
* automatic large-scale web scraping;
* fully automated source approval;
* a dedicated vector database outside PostgreSQL;
* exact imitation of Gandhi’s writing style.

---

## 10. Trust and Safety Rules

The system must:

* never invent a quotation;
* never present an inference as a historical fact;
* never claim that the user is speaking to the real historical person;
* avoid presenting modern political endorsements in Gandhi’s voice;
* disclose when a question concerns events after Gandhi’s death;
* prioritize primary sources;
* distinguish Gandhi’s own words from historians’ interpretations;
* decline or qualify answers unsupported by the corpus;
* show citations for important factual claims;
* avoid reproducing long copyrighted passages.

The interface should include a statement such as:

> RecChat provides a source-grounded historical simulation based on documented writings and speeches. It does not represent the actual person, and some responses may involve clearly labeled interpretation.

---

## 11. MVP Success Criteria

The MVP will be considered successful when:

* at least 10 high-quality sources have been ingested;
* at least 25 evaluation questions have been created;
* relevant sources appear in the top five retrieved chunks for most answerable evaluation questions;
* answers include valid citations;
* unsupported questions trigger an insufficient-evidence response;
* modern questions are labeled as extrapolations;
* no invented quotations appear in the evaluation set;
* the frontend and backend work together locally;
* the application is publicly accessible;
* average answer cost and latency are recorded;
* a second personality can be added without redesigning the architecture.

---

# Initial Gandhi Evaluation Questions

## Directly Supported Questions

1. What did Gandhi mean by nonviolence?

2. Why did Gandhi believe that means and ends were connected?

3. What were Gandhi’s views on industrialization and machinery?

4. How did Gandhi describe the idea of self-rule or swaraj?

5. What role did religion play in Gandhi’s political thinking?

6. What did Gandhi believe about civil disobedience?

7. How did Gandhi view the relationship between personal discipline and public leadership?

8. What did Gandhi say about economic inequality and poverty?

9. How did Gandhi think India’s villages should contribute to national development?

10. What did Gandhi believe about education?

---

## Questions to Add Later for Evaluation

### Modern Extrapolation

* What might Gandhi think about social media?
* What might Gandhi think about artificial intelligence?
* How might Gandhi respond to online political polarization?
* What principles might Gandhi apply to climate change?
* What might Gandhi think about consumer culture today?

### Insufficient Evidence

* What was Gandhi’s favorite fictional novel?
* Which modern smartphone brand would Gandhi prefer?
* What music would Gandhi listen to today?
* Which current political candidate would Gandhi support?
* What would Gandhi think about a specific event with no relevant supporting source?
